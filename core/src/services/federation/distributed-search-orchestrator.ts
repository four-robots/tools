/**
 * Distributed Search Orchestrator Service
 * 
 * Orchestrates search queries across federated MCP Tools instances,
 * manages result aggregation, handles failures, and optimizes performance.
 * 
 * Part of Work Item 4.2.2 - Federation Protocol Implementation
 */

import { logger } from '../../utils/logger.js';
import { DatabaseConnectionPool } from '../../utils/database-pool.js';
import { 
  CrossOrgSearch,
  SearchNodeResponse,
  SearchResultAggregation,
  FederationSearchRequest,
  FederationSearchResponse,
  validateFederationSearchRequest,
  validateCrossOrgSearch
} from '../../shared/types/federation.js';
import crypto from 'crypto';

interface SearchNodeTarget {
  node_id: string;
  endpoint: string;
  protocols: string[];
  capabilities: Record<string, any>;
  trust_score: number;
}

interface SearchExecutionPlan {
  primary_nodes: SearchNodeTarget[];
  fallback_nodes: SearchNodeTarget[];
  timeout_per_node: number;
  max_concurrent: number;
  aggregation_strategy: string;
}

interface SearchResultItem {
  id: string;
  title: string;
  content: string;
  source: string;
  relevance_score: number;
  node_id: string;
  content_type: string;
  metadata: Record<string, any>;
  created_at: string;
}

interface AggregationMetrics {
  total_results_before: number;
  total_results_after: number;
  duplicates_removed: number;
  aggregation_time_ms: number;
  quality_score: number;
}

export class DistributedSearchOrchestrator {
  private db: DatabaseConnectionPool;
  private activeSearches = new Map<string, AbortController>();

  constructor() {
    this.db = new DatabaseConnectionPool();
  }

  // ===================
  // SEARCH ORCHESTRATION
  // ===================

  /**
   * Execute a distributed search across federation nodes
   */
  async executeDistributedSearch(
    tenantId: string,
    searchRequest: FederationSearchRequest,
    initiatedBy: string
  ): Promise<FederationSearchResponse> {
    logger.info(`Executing distributed search for tenant: ${tenantId}`);

    try {
      // Validate search request
      const validatedRequest = validateFederationSearchRequest(searchRequest);
      
      // Generate search session
      const searchSessionId = crypto.randomUUID();
      const searchId = crypto.randomUUID();

      // Create search record
      const crossOrgSearch = await this.createSearchRecord(
        searchId,
        searchSessionId,
        tenantId,
        validatedRequest,
        initiatedBy
      );

      // Plan search execution
      const executionPlan = await this.planSearchExecution(
        tenantId,
        validatedRequest
      );

      // Execute search with timeout handling
      const searchPromise = this.performDistributedSearch(
        crossOrgSearch,
        executionPlan,
        validatedRequest
      );

      // Set up abort controller for timeout
      const abortController = new AbortController();
      this.activeSearches.set(searchId, abortController);

      const timeoutId = setTimeout(() => {
        abortController.abort();
        logger.warn(`Search timeout for session: ${searchSessionId}`);
      }, validatedRequest.timeout_ms);

      try {
        // Wait for search completion
        const searchResponse = await searchPromise;
        clearTimeout(timeoutId);
        this.activeSearches.delete(searchId);

        return searchResponse;

      } catch (error) {
        clearTimeout(timeoutId);
        this.activeSearches.delete(searchId);

        // Update search status to failed
        const errorMsg = error instanceof Error ? error.message : String(error);
        const errorStack = error instanceof Error ? error.stack : undefined;
        await this.updateSearchStatus(searchId, 'failed', {
          error: errorMsg,
          error_details: { stack: errorStack }
        });

        throw error;
      }

    } catch (error) {
      logger.error('Failed to execute distributed search:', error);
      throw new Error(`Failed to execute distributed search: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Cancel an active search
   */
  async cancelSearch(searchId: string, tenantId: string, cancelledBy: string): Promise<void> {
    logger.info(`Cancelling search: ${searchId}`);

    try {
      // Verify search ownership
      const search = await this.db.db
        .selectFrom('cross_org_searches')
        .select(['id', 'status'])
        .where('id', '=', searchId)
        .where('originating_tenant_id', '=', tenantId)
        .executeTakeFirst();

      if (!search) {
        throw new Error('Search not found or access denied');
      }

      if (search.status !== 'executing') {
        throw new Error('Search is not in executing state');
      }

      // Abort the search
      const abortController = this.activeSearches.get(searchId);
      if (abortController) {
        abortController.abort();
        this.activeSearches.delete(searchId);
      }

      // Update search status
      await this.updateSearchStatus(searchId, 'cancelled', {
        cancelled_by: cancelledBy,
        cancelled_at: new Date().toISOString()
      });

      logger.info(`Successfully cancelled search: ${searchId}`);

    } catch (error) {
      logger.error('Failed to cancel search:', error);
      throw new Error(`Failed to cancel search: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  // ===================
  // SEARCH EXECUTION
  // ===================

  private async performDistributedSearch(
    search: CrossOrgSearch,
    executionPlan: SearchExecutionPlan,
    searchRequest: FederationSearchRequest
  ): Promise<FederationSearchResponse> {
    const startTime = Date.now();
    const nodeResponses: SearchNodeResponse[] = [];
    let nodesContacted = 0;
    let nodesResponded = 0;

    try {
      // Execute searches on primary nodes first
      const primaryPromises = executionPlan.primary_nodes.map(node => 
        this.executeNodeSearch(search.id, node, searchRequest)
      );

      // Execute with concurrency limit
      const primaryResults = await this.executeConcurrentSearches(
        primaryPromises,
        executionPlan.max_concurrent
      );

      nodesContacted += executionPlan.primary_nodes.length;
      
      // Process primary results
      for (const result of primaryResults) {
        if (result.status === 'fulfilled') {
          nodeResponses.push(result.value);
          nodesResponded++;
        } else {
          logger.warn(`Primary node search failed: ${result.reason.message}`);
        }
      }

      // Check if we need fallback nodes
      const successfulResponses = nodeResponses.filter(r => r.response_status === 'success');
      const minimumNodes = Math.max(1, Math.ceil(executionPlan.primary_nodes.length * 0.5));

      if (successfulResponses.length < minimumNodes && executionPlan.fallback_nodes.length > 0) {
        logger.info('Insufficient primary responses, using fallback nodes');
        
        const fallbackPromises = executionPlan.fallback_nodes.slice(0, 3).map(node =>
          this.executeNodeSearch(search.id, node, searchRequest)
        );

        const fallbackResults = await this.executeConcurrentSearches(
          fallbackPromises,
          executionPlan.max_concurrent
        );

        nodesContacted += fallbackPromises.length;

        for (const result of fallbackResults) {
          if (result.status === 'fulfilled') {
            nodeResponses.push(result.value);
            nodesResponded++;
          }
        }
      }

      // Aggregate results
      const aggregation = await this.aggregateSearchResults(
        search.id,
        nodeResponses,
        searchRequest.aggregation_strategy || 'merge_rank'
      );

      const executionTime = Date.now() - startTime;

      // Update search completion
      await this.updateSearchCompletion(
        search.id,
        aggregation.total_unique_results,
        nodesContacted,
        nodesResponded,
        executionTime
      );

      // Prepare response
      const response: FederationSearchResponse = {
        search_id: search.id,
        status: 'completed',
        total_results: aggregation.total_unique_results,
        results: aggregation.aggregated_results,
        execution_time_ms: executionTime,
        nodes_contacted: nodesContacted,
        nodes_responded: nodesResponded,
        aggregation_metadata: {
          duplicates_removed: aggregation.duplicates_removed,
          quality_scores: aggregation.quality_scores,
          aggregation_time_ms: aggregation.aggregation_time_ms
        },
        errors: nodeResponses
          .filter(r => r.response_status === 'error')
          .map(r => ({
            node_id: r.node_id,
            error_code: r.error_code || 'unknown',
            error_message: r.error_message || 'Unknown error'
          }))
      };

      return response;

    } catch (error) {
      const executionTime = Date.now() - startTime;
      
      await this.updateSearchStatus(search.id, 'failed', {
        error: error instanceof Error ? error.message : String(error),
        execution_time_ms: executionTime,
        nodes_contacted: nodesContacted,
        nodes_responded: nodesResponded
      });

      throw error;
    }
  }

  private async executeNodeSearch(
    searchId: string,
    node: SearchNodeTarget,
    searchRequest: FederationSearchRequest
  ): Promise<SearchNodeResponse> {
    const startTime = Date.now();
    const abortController = new AbortController();
    const timeoutId = setTimeout(() => abortController.abort(), 10000); // 10 second timeout

    try {
      // Check rate limiting for this node
      if (!await this.checkRateLimit(node.node_id)) {
        throw new Error(`Rate limit exceeded for node ${node.node_id}`);
      }

      // Prepare node-specific search request
      const nodeSearchRequest = {
        query: searchRequest.query,
        filters: searchRequest.filters || {},
        max_results: searchRequest.max_results || 50,
        search_type: searchRequest.search_type || 'unified',
        privacy_level: searchRequest.privacy_level || 'standard'
      };

      // Generate authentication headers
      const authHeaders = await this.generateFederationAuthHeaders(node.node_id);
      
      // Execute HTTP request to node with proper authentication
      const response = await fetch(`${node.endpoint}/api/v1/federation/search`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'MCP-Tools-Federation/1.0',
          'Accept': 'application/json',
          'X-Federation-Version': '1.0',
          'X-Request-ID': crypto.randomUUID(),
          'X-Search-Session-ID': searchId,
          ...authHeaders
        },
        body: JSON.stringify(nodeSearchRequest),
        signal: abortController.signal
      });

      clearTimeout(timeoutId);
      const responseTime = Date.now() - startTime;

      // Enhanced response validation
      if (!response.ok) {
        const errorText = await response.text().catch(() => 'Unknown error');
        throw new Error(`HTTP ${response.status}: ${response.statusText} - ${errorText}`);
      }

      const contentType = response.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
        throw new Error('Invalid response content type - expected application/json');
      }

      let responseData;
      try {
        responseData = await response.json();
      } catch (error) {
        throw new Error(`Invalid JSON response: ${error instanceof Error ? error.message : String(error)}`);
      }

      // Validate response structure
      if (!responseData || typeof responseData !== 'object') {
        throw new Error('Invalid response format');
      }

      const results = Array.isArray(responseData.results) ? responseData.results : [];

      // Create and store node response
      const nodeResponse: SearchNodeResponse = {
        id: crypto.randomUUID(),
        search_id: searchId,
        node_id: node.node_id,
        response_status: 'success',
        results_count: results.length,
        response_time_ms: responseTime,
        results_data: results,
        ranking_metadata: responseData.metadata || {},
        partial_results: results.length >= (searchRequest.max_results || 50),
        cache_hit: responseData.cache_hit || false,
        response_metadata: {
          node_trust_score: node.trust_score,
          protocol_used: 'http'
        },
        received_at: new Date().toISOString()
      };

      // Store response in database
      await this.storeNodeResponse(nodeResponse);

      return nodeResponse;

    } catch (error) {
      clearTimeout(timeoutId);
      const responseTime = Date.now() - startTime;
      
      const errorMsg = error instanceof Error ? error.message : String(error);
      const errorName = error instanceof Error ? error.name : 'UnknownError';

      // Log detailed error information for security monitoring
      logger.error(`Federation search failed for node ${node.node_id}:`, {
        error: errorMsg,
        searchId,
        nodeId: node.node_id,
        responseTime,
        errorType: errorName
      });

      // Determine error status
      let responseStatus: 'error' | 'timeout' | 'partial';
      if (errorName === 'AbortError') {
        responseStatus = 'timeout';
      } else if (errorMsg.includes('Rate limit')) {
        responseStatus = 'error';
      } else {
        responseStatus = 'error';
      }

      const nodeResponse: SearchNodeResponse = {
        id: crypto.randomUUID(),
        search_id: searchId,
        node_id: node.node_id,
        response_status: responseStatus,
        results_count: 0,
        response_time_ms: responseTime,
        results_data: [],
        ranking_metadata: {},
        error_code: errorName,
        error_message: errorMsg || 'Unknown error occurred',
        partial_results: false,
        cache_hit: false,
        response_metadata: {
          node_trust_score: node.trust_score,
          protocol_used: 'http',
          error_category: this.categorizeError(error)
        },
        received_at: new Date().toISOString()
      };

      await this.storeNodeResponse(nodeResponse);
      return nodeResponse;
    }
  }

  // ===================
  // RESULT AGGREGATION
  // ===================

  private async aggregateSearchResults(
    searchId: string,
    nodeResponses: SearchNodeResponse[],
    strategy: string
  ): Promise<SearchResultAggregation> {
    const startTime = Date.now();
    
    try {
      // Collect all results from successful responses
      const allResults: SearchResultItem[] = [];
      
      nodeResponses
        .filter(r => r.response_status === 'success' && r.results_data.length > 0)
        .forEach(response => {
          response.results_data.forEach((result: any) => {
            allResults.push({
              id: result.id || crypto.randomUUID(),
              title: result.title || '',
              content: result.content || result.summary || '',
              source: result.source || 'unknown',
              relevance_score: result.relevance_score || result.score || 0.5,
              node_id: response.node_id,
              content_type: result.content_type || result.type || 'unknown',
              metadata: result.metadata || {},
              created_at: result.created_at || new Date().toISOString()
            });
          });
        });

      // Deduplicate results
      const { uniqueResults, duplicatesRemoved } = this.deduplicateResults(allResults);

      // Apply aggregation strategy
      const aggregatedResults = this.applyAggregationStrategy(uniqueResults, strategy);

      // Calculate quality scores
      const qualityScores = this.calculateQualityScores(nodeResponses);

      const aggregationTime = Date.now() - startTime;

      const aggregation: SearchResultAggregation = {
        id: crypto.randomUUID(),
        search_id: searchId,
        aggregated_results: aggregatedResults.slice(0, 100), // Limit final results
        result_ranking: aggregatedResults.map((r, index) => ({
          result_id: r.id,
          rank: index + 1,
          score: r.relevance_score,
          contributing_nodes: [r.node_id]
        })),
        deduplication_stats: {
          total_before_dedup: allResults.length,
          total_after_dedup: uniqueResults.length,
          duplicates_removed: duplicatesRemoved,
          dedup_algorithm: 'content_hash'
        },
        performance_metrics: {
          nodes_with_results: nodeResponses.filter(r => r.results_count > 0).length,
          average_response_time: nodeResponses.length > 0 ? nodeResponses.reduce((sum, r) => sum + (r.response_time_ms || 0), 0) / nodeResponses.length : 0,
          fastest_node: nodeResponses.length > 0 ? Math.min(...nodeResponses.map(r => r.response_time_ms || Infinity)) : 0,
          slowest_node: nodeResponses.length > 0 ? Math.max(...nodeResponses.map(r => r.response_time_ms || 0)) : 0
        },
        quality_scores: qualityScores,
        aggregation_algorithm: strategy,
        aggregation_time_ms: aggregationTime,
        total_unique_results: aggregatedResults.length,
        duplicates_removed: duplicatesRemoved,
        created_at: new Date().toISOString()
      };

      // Store aggregation result
      await this.storeAggregation(aggregation);

      return aggregation;

    } catch (error) {
      logger.error('Failed to aggregate search results:', error);
      throw new Error(`Failed to aggregate search results: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private deduplicateResults(results: SearchResultItem[]): { uniqueResults: SearchResultItem[], duplicatesRemoved: number } {
    const seen = new Set<string>();
    const uniqueResults: SearchResultItem[] = [];
    let duplicatesRemoved = 0;

    for (const result of results) {
      // Create content hash for deduplication
      const contentHash = crypto
        .createHash('sha256')
        .update(`${result.title}:${result.content.substring(0, 200)}`)
        .digest('hex');

      if (!seen.has(contentHash)) {
        seen.add(contentHash);
        uniqueResults.push(result);
      } else {
        duplicatesRemoved++;
      }
    }

    return { uniqueResults, duplicatesRemoved };
  }

  private applyAggregationStrategy(results: SearchResultItem[], strategy: string): SearchResultItem[] {
    switch (strategy) {
      case 'merge_rank':
        return this.mergeRankStrategy(results);
      case 'trust_weighted':
        return this.trustWeightedStrategy(results);
      case 'recency_boost':
        return this.recencyBoostStrategy(results);
      default:
        return this.mergeRankStrategy(results);
    }
  }

  private mergeRankStrategy(results: SearchResultItem[]): SearchResultItem[] {
    return results.sort((a, b) => b.relevance_score - a.relevance_score);
  }

  private trustWeightedStrategy(results: SearchResultItem[]): SearchResultItem[] {
    // Would incorporate node trust scores in a real implementation
    return results.sort((a, b) => {
      const aScore = a.relevance_score; // * node_trust_score
      const bScore = b.relevance_score; // * node_trust_score
      return bScore - aScore;
    });
  }

  private recencyBoostStrategy(results: SearchResultItem[]): SearchResultItem[] {
    const now = Date.now();
    
    return results.sort((a, b) => {
      const aAge = now - new Date(a.created_at).getTime();
      const bAge = now - new Date(b.created_at).getTime();
      
      // Boost recent content
      const aBoost = aAge < 86400000 ? 0.2 : 0; // 24 hours
      const bBoost = bAge < 86400000 ? 0.2 : 0;
      
      return (b.relevance_score + bBoost) - (a.relevance_score + aBoost);
    });
  }

  private calculateQualityScores(nodeResponses: SearchNodeResponse[]): Record<string, number> {
    const scores: Record<string, number> = {};
    
    nodeResponses.forEach(response => {
      let score = 0.5; // Base score
      
      // Success bonus
      if (response.response_status === 'success') {
        score += 0.3;
      }
      
      // Response time bonus
      if (response.response_time_ms && response.response_time_ms < 1000) {
        score += 0.1;
      }
      
      // Results count bonus
      if (response.results_count > 0) {
        score += Math.min(0.1, response.results_count / 100);
      }
      
      scores[response.node_id] = Math.min(score, 1.0);
    });
    
    return scores;
  }

  // ===================
  // SEARCH EXECUTION PLANNING
  // ===================

  private async planSearchExecution(
    tenantId: string,
    searchRequest: FederationSearchRequest
  ): Promise<SearchExecutionPlan> {
    try {
      // Get available nodes
      const availableNodes = await this.getAvailableNodes(tenantId, searchRequest);
      
      // Separate into primary and fallback based on trust score and health
      const primaryNodes = availableNodes
        .filter(node => node.trust_score >= 70)
        .sort((a, b) => b.trust_score - a.trust_score)
        .slice(0, 5); // Limit to top 5 nodes

      const fallbackNodes = availableNodes
        .filter(node => node.trust_score < 70 && node.trust_score >= 50)
        .sort((a, b) => b.trust_score - a.trust_score)
        .slice(0, 3); // Limit to top 3 fallback nodes

      return {
        primary_nodes: primaryNodes,
        fallback_nodes: fallbackNodes,
        timeout_per_node: Math.min(searchRequest.timeout_ms / 2, 10000),
        max_concurrent: Math.min(primaryNodes.length, 3),
        aggregation_strategy: searchRequest.aggregation_strategy || 'merge_rank'
      };

    } catch (error) {
      logger.error('Failed to plan search execution:', error);
      throw new Error(`Failed to plan search execution: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async getAvailableNodes(tenantId: string, searchRequest: FederationSearchRequest): Promise<SearchNodeTarget[]> {
    let query = this.db.db
      .selectFrom('federation_nodes')
      .innerJoin('federation_protocols', 'federation_protocols.node_id', 'federation_nodes.id')
      .select([
        'federation_nodes.id as node_id',
        'federation_protocols.endpoint_url as endpoint',
        'federation_nodes.supported_protocols',
        'federation_nodes.capabilities',
        'federation_nodes.trust_score'
      ])
      .where('federation_nodes.status', '=', 'active')
      .where('federation_nodes.health_status', 'in', ['healthy', 'degraded'])
      .where('federation_nodes.tenant_id', '!=', tenantId)
      .where('federation_protocols.is_enabled', '=', true)
      .where('federation_protocols.protocol_name', '=', 'http');

    // Apply target node filter if specified
    if (searchRequest.target_nodes && searchRequest.target_nodes.length > 0) {
      query = query.where('federation_nodes.id', 'in', searchRequest.target_nodes);
    }

    const nodes = await query.execute();

    return nodes.map(node => ({
      node_id: node.node_id,
      endpoint: node.endpoint,
      protocols: JSON.parse(node.supported_protocols as string || '[]'),
      capabilities: JSON.parse(node.capabilities as string || '{}'),
      trust_score: Number(node.trust_score) || 0
    }));
  }

  // ===================
  // AUTHENTICATION AND SECURITY
  // ===================

  /**
   * Generate authentication headers for federation requests
   */
  private async generateFederationAuthHeaders(nodeId: string): Promise<Record<string, string>> {
    try {
      // Get API key for this node
      const apiKey = await this.db.db
        .selectFrom('federation_api_keys')
        .select(['key_hash', 'key_prefix'])
        .where('target_node_id', '=', nodeId)
        .where('status', '=', 'active')
        .where('expires_at', '>', new Date().toISOString())
        .executeTakeFirst();

      if (!apiKey) {
        throw new Error(`No valid API key found for node ${nodeId}`);
      }

      // In production, this would retrieve the actual API key from secure storage
      // For now, we'll use the key prefix as a placeholder
      const authToken = `${apiKey.key_prefix}_${Buffer.from(nodeId).toString('base64')}`;

      return {
        'Authorization': `Bearer ${authToken}`,
        'X-API-Key': apiKey.key_prefix,
        'X-Federation-Node-ID': nodeId,
        'X-Timestamp': Date.now().toString(),
        'X-Nonce': crypto.randomBytes(16).toString('hex')
      };

    } catch (error) {
      logger.error('Failed to generate federation auth headers:', error);
      // Return basic headers as fallback
      return {
        'Authorization': `Basic ${Buffer.from(`federation:${nodeId}`).toString('base64')}`,
        'X-Federation-Node-ID': nodeId
      };
    }
  }

  /**
   * Check rate limiting for federation requests
   */
  private async checkRateLimit(nodeId: string): Promise<boolean> {
    try {
      const now = Date.now();
      const windowStart = now - (60 * 1000); // 1 minute window

      // Count requests in the last minute
      const [requestCount] = await this.db.db
        .selectFrom('search_node_responses')
        .select((eb) => eb.fn.count<number>('id').as('count'))
        .where('node_id', '=', nodeId)
        .where('received_at', '>', new Date(windowStart).toISOString())
        .execute();

      const requestsPerMinute = requestCount.count || 0;
      const maxRequestsPerMinute = 100; // Configurable rate limit

      if (requestsPerMinute >= maxRequestsPerMinute) {
        logger.warn(`Rate limit exceeded for node ${nodeId}: ${requestsPerMinute} requests in last minute`);
        return false;
      }

      return true;

    } catch (error) {
      logger.error('Failed to check rate limit:', error);
      // Allow request if rate limit check fails
      return true;
    }
  }

  /**
   * Categorize errors for better monitoring
   */
  private categorizeError(error: unknown): string {
    const message = error instanceof Error ? error.message : String(error);
    const name = error instanceof Error ? error.name : '';
    if (name === 'AbortError') {
      return 'timeout';
    }
    if (message.includes('Rate limit')) {
      return 'rate_limit';
    }
    if (message.includes('HTTP 401') || message.includes('HTTP 403')) {
      return 'authentication';
    }
    if (message.includes('HTTP 404')) {
      return 'not_found';
    }
    if (message.includes('HTTP 5')) {
      return 'server_error';
    }
    if (message.includes('network') || message.includes('ECONNREFUSED')) {
      return 'network';
    }
    return 'unknown';
  }

  // ===================
  // CONCURRENT EXECUTION HELPERS
  // ===================

  private async executeConcurrentSearches<T>(
    promises: Promise<T>[],
    concurrencyLimit: number
  ): Promise<PromiseSettledResult<T>[]> {
    const results: PromiseSettledResult<T>[] = [];
    
    for (let i = 0; i < promises.length; i += concurrencyLimit) {
      const batch = promises.slice(i, i + concurrencyLimit);
      const batchResults = await Promise.allSettled(batch);
      results.push(...batchResults);
    }
    
    return results;
  }

  // ===================
  // DATABASE OPERATIONS
  // ===================

  private async createSearchRecord(
    searchId: string,
    searchSessionId: string,
    tenantId: string,
    searchRequest: FederationSearchRequest,
    initiatedBy: string
  ): Promise<CrossOrgSearch> {
    const crossOrgSearch = await this.db.db
      .insertInto('cross_org_searches')
      .values({
        id: searchId,
        search_session_id: searchSessionId,
        originating_tenant_id: tenantId,
        search_query: searchRequest.query,
        search_type: searchRequest.search_type || 'unified',
        target_nodes: JSON.stringify(searchRequest.target_nodes || []),
        search_filters: JSON.stringify(searchRequest.filters || {}),
        aggregation_strategy: searchRequest.aggregation_strategy || 'merge_rank',
        max_results_per_node: searchRequest.max_results || 50,
        search_timeout_ms: searchRequest.timeout_ms || 10000,
        privacy_level: searchRequest.privacy_level || 'standard',
        initiated_by: initiatedBy,
        status: 'executing'
      })
      .returningAll()
      .executeTakeFirst();

    if (!crossOrgSearch) {
      throw new Error('Failed to create search record');
    }

    return validateCrossOrgSearch(crossOrgSearch);
  }

  private async storeNodeResponse(response: SearchNodeResponse): Promise<void> {
    await this.db.db
      .insertInto('search_node_responses')
      .values({
        id: response.id,
        search_id: response.search_id,
        node_id: response.node_id,
        response_status: response.response_status,
        results_count: response.results_count,
        response_time_ms: response.response_time_ms,
        results_data: JSON.stringify(response.results_data),
        ranking_metadata: JSON.stringify(response.ranking_metadata),
        error_code: response.error_code,
        error_message: response.error_message,
        partial_results: response.partial_results,
        cache_hit: response.cache_hit,
        response_metadata: JSON.stringify(response.response_metadata)
      })
      .execute();
  }

  private async storeAggregation(aggregation: SearchResultAggregation): Promise<void> {
    await this.db.db
      .insertInto('search_result_aggregation')
      .values({
        id: aggregation.id,
        search_id: aggregation.search_id,
        aggregated_results: JSON.stringify(aggregation.aggregated_results),
        result_ranking: JSON.stringify(aggregation.result_ranking),
        deduplication_stats: JSON.stringify(aggregation.deduplication_stats),
        performance_metrics: JSON.stringify(aggregation.performance_metrics),
        quality_scores: JSON.stringify(aggregation.quality_scores),
        aggregation_algorithm: aggregation.aggregation_algorithm,
        aggregation_time_ms: aggregation.aggregation_time_ms,
        total_unique_results: aggregation.total_unique_results,
        duplicates_removed: aggregation.duplicates_removed
      })
      .execute();
  }

  private async updateSearchStatus(
    searchId: string,
    status: string,
    details?: Record<string, any>
  ): Promise<void> {
    const updateData: any = {
      status,
      updated_at: new Date().toISOString()
    };

    if (status === 'completed' || status === 'failed' || status === 'cancelled') {
      updateData.completed_at = new Date().toISOString();
    }

    if (details) {
      updateData.search_metadata = this.db.db
        .selectFrom('cross_org_searches')
        .select((eb) => 
          eb.fn('jsonb_set', [
            'search_metadata',
            JSON.stringify(['status_details']),
            JSON.stringify(details)
          ])
        )
        .where('id', '=', searchId);
    }

    await this.db.db
      .updateTable('cross_org_searches')
      .set(updateData)
      .where('id', '=', searchId)
      .execute();
  }

  private async updateSearchCompletion(
    searchId: string,
    totalResults: number,
    nodesContacted: number,
    nodesResponded: number,
    executionTime: number
  ): Promise<void> {
    await this.db.db
      .updateTable('cross_org_searches')
      .set({
        status: 'completed',
        completed_at: new Date().toISOString(),
        total_results_count: totalResults,
        nodes_contacted: nodesContacted,
        nodes_responded: nodesResponded,
        execution_time_ms: executionTime
      })
      .where('id', '=', searchId)
      .execute();
  }

  // ===================
  // SEARCH HISTORY AND ANALYTICS
  // ===================

  /**
   * Get search history for a tenant
   */
  async getSearchHistory(
    tenantId: string,
    limit: number = 20,
    offset: number = 0
  ): Promise<CrossOrgSearch[]> {
    try {
      const searches = await this.db.db
        .selectFrom('cross_org_searches')
        .selectAll()
        .where('originating_tenant_id', '=', tenantId)
        .orderBy('initiated_at', 'desc')
        .limit(limit)
        .offset(offset)
        .execute();

      return searches.map(search => validateCrossOrgSearch(search));

    } catch (error) {
      logger.error('Failed to get search history:', error);
      throw new Error(`Failed to get search history: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Get detailed search results
   */
  async getSearchDetails(searchId: string, tenantId: string): Promise<{
    search: CrossOrgSearch;
    nodeResponses: SearchNodeResponse[];
    aggregation: SearchResultAggregation | null;
  }> {
    try {
      // Get search record
      const search = await this.db.db
        .selectFrom('cross_org_searches')
        .selectAll()
        .where('id', '=', searchId)
        .where('originating_tenant_id', '=', tenantId)
        .executeTakeFirst();

      if (!search) {
        throw new Error('Search not found or access denied');
      }

      // Get node responses
      const nodeResponses = await this.db.db
        .selectFrom('search_node_responses')
        .selectAll()
        .where('search_id', '=', searchId)
        .execute();

      // Get aggregation
      const aggregation = await this.db.db
        .selectFrom('search_result_aggregation')
        .selectAll()
        .where('search_id', '=', searchId)
        .executeTakeFirst();

      return {
        search: validateCrossOrgSearch(search),
        nodeResponses: nodeResponses as SearchNodeResponse[],
        aggregation: aggregation as SearchResultAggregation | null
      };

    } catch (error) {
      logger.error('Failed to get search details:', error);
      throw new Error(`Failed to get search details: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}