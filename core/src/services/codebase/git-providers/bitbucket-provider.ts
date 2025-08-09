/**
 * Bitbucket Provider Implementation
 * 
 * Implements the GitProvider interface for Bitbucket repositories.
 * Supports both Bitbucket Cloud and Bitbucket Server.
 */

import axios, { AxiosInstance } from 'axios';
import type { 
  GitProvider,
  RepositoryInfo,
  RepositoryTree,
  BranchInfo,
  ChangeSet,
  FileChange,
  GitProvider as GitProviderEnum
} from '../../../shared/types/repository.js';
import { parseBitbucketUrl, detectLanguageFromExtension, isBinaryFile } from './index.js';

/**
 * Bitbucket API provider implementation
 */
export class BitbucketProvider implements GitProvider {
  readonly name = 'Bitbucket';
  readonly provider = GitProviderEnum.BITBUCKET;
  
  private readonly client: AxiosInstance;
  private readonly accessToken?: string;
  private readonly baseUrl: string;

  constructor(accessToken?: string, baseUrl: string = 'https://api.bitbucket.org/2.0') {
    this.accessToken = accessToken;
    this.baseUrl = baseUrl;
    
    this.client = axios.create({
      baseURL: baseUrl,
      headers: {
        'Content-Type': 'application/json',
        ...(accessToken && { 'Authorization': `Bearer ${accessToken}` })
      },
      timeout: 30000
    });

    // Add response interceptor for error handling
    this.client.interceptors.response.use(
      (response) => response,
      (error) => {
        if (error.response?.status === 401) {
          throw new Error('Bitbucket authentication failed. Check access token.');
        }
        if (error.response?.status === 404) {
          throw new Error('Bitbucket resource not found.');
        }
        if (error.response?.status === 403) {
          throw new Error('Access denied to Bitbucket resource.');
        }
        throw error;
      }
    );
  }

  /**
   * Get repository information from Bitbucket
   */
  async getRepositoryInfo(url: string): Promise<RepositoryInfo> {
    try {
      const { workspace, repo } = parseBitbucketUrl(url);
      const response = await this.client.get(`/repositories/${workspace}/${repo}`);
      const data = response.data;

      return {
        name: data.name,
        fullName: data.full_name,
        description: data.description || undefined,
        language: data.language || undefined,
        defaultBranch: data.mainbranch?.name || 'main',
        starsCount: 0, // Bitbucket doesn't have stars, might use watchers
        forksCount: 0, // Would need separate API call
        sizeKb: data.size || 0,
        isPrivate: data.is_private || false,
        createdAt: new Date(data.created_on),
        updatedAt: new Date(data.updated_on)
      };
    } catch (error) {
      throw new Error(`Failed to fetch Bitbucket repository info: ${error.message}`);
    }
  }

  /**
   * Get repository tree with file information
   */
  async getRepositoryTree(url: string, branch: string): Promise<RepositoryTree> {
    try {
      const { workspace, repo } = parseBitbucketUrl(url);
      
      // First get the latest commit for the branch
      const commitsResponse = await this.client.get(
        `/repositories/${workspace}/${repo}/commits/${branch}?pagelen=1`
      );
      
      const commits = commitsResponse.data.values;
      if (!commits || commits.length === 0) {
        throw new Error(`No commits found for branch ${branch}`);
      }

      const commitHash = commits[0].hash;

      // Get repository files recursively
      const files: any[] = [];
      let nextUrl = `/repositories/${workspace}/${repo}/src/${branch}`;
      
      while (nextUrl) {
        const response = await this.client.get(nextUrl);
        const data = response.data;
        
        if (data.values) {
          for (const item of data.values) {
            if (item.type === 'commit_file') {
              files.push({
                path: item.path,
                sha: item.commit?.hash || '',
                size: item.size || 0,
                mode: '100644' // Default file mode
              });
            }
          }
        }
        
        nextUrl = data.next ? data.next.replace(this.baseUrl, '') : null;
      }

      return {
        commitHash,
        files
      };
    } catch (error) {
      throw new Error(`Failed to fetch Bitbucket repository tree: ${error.message}`);
    }
  }

  /**
   * Get all branches for the repository
   */
  async getBranches(url: string): Promise<BranchInfo[]> {
    try {
      const { workspace, repo } = parseBitbucketUrl(url);
      
      const branches: BranchInfo[] = [];
      let nextUrl = `/repositories/${workspace}/${repo}/refs/branches`;
      
      while (nextUrl) {
        const response = await this.client.get(nextUrl);
        const data = response.data;
        
        if (data.values) {
          for (const branch of data.values) {
            branches.push({
              name: branch.name,
              commitHash: branch.target.hash,
              commitMessage: branch.target.message,
              authorName: branch.target.author?.user?.display_name,
              authorEmail: branch.target.author?.user?.email,
              lastCommitAt: branch.target.date ? new Date(branch.target.date) : undefined,
              isProtected: false // Would need separate API call to check
            });
          }
        }
        
        nextUrl = data.next ? data.next.replace(this.baseUrl, '') : null;
      }

      return branches;
    } catch (error) {
      throw new Error(`Failed to fetch Bitbucket repository branches: ${error.message}`);
    }
  }

  /**
   * Get file content from repository
   */
  async getFileContent(url: string, path: string, ref: string): Promise<string> {
    try {
      const { workspace, repo } = parseBitbucketUrl(url);
      
      const response = await this.client.get(
        `/repositories/${workspace}/${repo}/src/${ref}/${encodeURIComponent(path)}`,
        { responseType: 'text' }
      );

      return response.data;
    } catch (error) {
      if (error.response?.status === 404) {
        throw new Error(`File not found: ${path}`);
      }
      throw new Error(`Failed to fetch file content: ${error.message}`);
    }
  }

  /**
   * Get changes since a specific commit
   */
  async getChangesSince(url: string, branch: string, since: string): Promise<ChangeSet> {
    try {
      const { workspace, repo } = parseBitbucketUrl(url);
      
      // Get commits since the specified commit
      const commitsResponse = await this.client.get(
        `/repositories/${workspace}/${repo}/commits/${branch}?exclude=${since}`
      );

      const commits = commitsResponse.data.values || [];
      const fileChanges = new Map<string, FileChange>();
      
      // Process each commit to get file changes
      for (const commit of commits) {
        try {
          const diffResponse = await this.client.get(
            `/repositories/${workspace}/${repo}/diff/${commit.hash}`
          );
          
          // Parse diff response (simplified - real implementation would need proper diff parsing)
          const diffText = diffResponse.data;
          if (typeof diffText === 'string') {
            // This is a simplified approach - would need proper diff parsing
            const lines = diffText.split('\n');
            for (const line of lines) {
              if (line.startsWith('diff --git a/') || line.startsWith('+++ b/')) {
                const match = line.match(/[ab]\/(.+)/);
                if (match) {
                  const path = match[1];
                  if (!fileChanges.has(path)) {
                    fileChanges.set(path, {
                      path,
                      changeType: 'modified' // Simplified - would need proper detection
                    });
                  }
                }
              }
            }
          }
        } catch (diffError) {
          console.warn(`Failed to fetch commit diff for ${commit.hash}:`, diffError);
        }
      }

      return {
        latestCommit: commits[0]?.hash || branch,
        files: Array.from(fileChanges.values())
      };
    } catch (error) {
      throw new Error(`Failed to fetch Bitbucket changes since ${since}: ${error.message}`);
    }
  }

  /**
   * Check if webhooks are supported (true for Bitbucket)
   */
  supportsWebhooks(): boolean {
    return true;
  }

  /**
   * Parse Bitbucket webhook payload to extract file changes
   */
  parseWebhookData(data: any): FileChange[] {
    try {
      if (data.push && data.push.changes) {
        const fileChanges = new Map<string, FileChange>();
        
        for (const change of data.push.changes) {
          if (change.commits) {
            for (const commit of change.commits) {
              // Bitbucket webhook doesn't include file lists by default
              // This would require additional API calls or webhook configuration
              // For now, return empty array and rely on incremental sync
            }
          }
        }

        return Array.from(fileChanges.values());
      }

      return [];
    } catch (error) {
      console.warn('Failed to parse Bitbucket webhook data:', error);
      return [];
    }
  }

  /**
   * Validate access to repository
   */
  async validateAccess(url: string): Promise<boolean> {
    try {
      await this.getRepositoryInfo(url);
      return true;
    } catch (error) {
      return false;
    }
  }

  // ===================
  // WEBHOOK MANAGEMENT
  // ===================

  /**
   * Create a webhook for the repository
   */
  async createWebhook(url: string, webhookUrl: string, secret: string, events: string[] = ['repo:push']): Promise<string> {
    try {
      const { workspace, repo } = parseBitbucketUrl(url);
      
      // Convert generic events to Bitbucket-specific events
      const bitbucketEvents = this.convertEventsToBitbucket(events);
      
      const response = await this.client.post(
        `/repositories/${workspace}/${repo}/hooks`,
        {
          description: 'MCP Tools Repository Sync Webhook',
          url: webhookUrl,
          active: true,
          events: bitbucketEvents
        }
      );

      return response.data.uuid;
    } catch (error) {
      throw new Error(`Failed to create Bitbucket webhook: ${error.message}`);
    }
  }

  /**
   * Delete a webhook
   */
  async deleteWebhook(url: string, webhookId: string): Promise<void> {
    try {
      const { workspace, repo } = parseBitbucketUrl(url);
      
      await this.client.delete(
        `/repositories/${workspace}/${repo}/hooks/${webhookId}`
      );
    } catch (error) {
      throw new Error(`Failed to delete Bitbucket webhook: ${error.message}`);
    }
  }

  /**
   * Convert generic events to Bitbucket webhook events
   */
  private convertEventsToBitbucket(events: string[]): string[] {
    const bitbucketEvents: string[] = [];
    
    for (const event of events) {
      switch (event) {
        case 'push':
          bitbucketEvents.push('repo:push');
          break;
        case 'pull_request':
          bitbucketEvents.push('pullrequest:created');
          bitbucketEvents.push('pullrequest:updated');
          break;
        case 'issues':
          bitbucketEvents.push('issue:created');
          bitbucketEvents.push('issue:updated');
          break;
        default:
          console.warn(`Unknown Bitbucket webhook event: ${event}`);
      }
    }
    
    return bitbucketEvents.length > 0 ? bitbucketEvents : ['repo:push'];
  }
}