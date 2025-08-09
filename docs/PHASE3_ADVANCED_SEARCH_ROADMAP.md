# Phase 3: Advanced Search Enhancements Feature Roadmap

## Overview

Enhance the unified search experience with AI-powered features, advanced filtering capabilities, saved searches, personalization, and collaborative search functionalities.

**Timeline**: 6-8 weeks  
**Prerequisites**: Phase 1 (Unified Search Foundation) and Phase 2 (Codebase Analysis) completed  
**Team**: Backend engineers, fullstack developers, AI/ML specialists

## Goals

- **Primary**: Transform search into an intelligent, AI-powered experience
- **Secondary**: Enable advanced user personalization and collaboration  
- **Tertiary**: Provide comprehensive search analytics and optimization

## Architecture Overview

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   NLP Engine    │───▶│  Query Processor │───▶│  AI Summaries   │
│   - Intent Class│    │  - Expansion     │    │  - LLM Generate │
│   - Entity Extr │    │  - Spell Check   │    │  - Citation     │
│   - Synonyms    │    │  - Multi-lang    │    │  - Confidence   │
└─────────────────┘    └──────────────────┘    └─────────────────┘
         │                       │                       │
         ▼                       ▼                       ▼
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│ Dynamic Facets  │    │  Saved Searches  │    │ Personalization │
│ - Auto Discover │    │  - Collections   │    │ - Behavior Track│
│ - Hierarchical  │    │  - Alerts        │    │ - Custom Rank   │
│ - Range Filters │    │  - Scheduling    │    │ - Preferences   │
└─────────────────┘    └──────────────────┘    └─────────────────┘
```

## Work Items

### 3.1 AI-Powered Search Features

#### 3.1.1 Natural Language Query Processing

**Agent**: nodejs-backend-engineer  
**Estimated Time**: 2 weeks  
**Priority**: Critical

**Description**  
Implement advanced NLP pipeline for natural language query understanding, intent classification, entity extraction, and intelligent query expansion.

**Technical Requirements**
- Large Language Model integration for query processing
- Intent classification (search, question, command, navigation)
- Named entity recognition and extraction
- Query expansion with synonyms and related terms
- Multi-language support and spell correction
- Context-aware query interpretation

**NLP Processing Pipeline**
```typescript
interface NLPQueryProcessor {
  // Core processing
  processQuery(query: string, context?: QueryContext): Promise<ProcessedQuery>;
  classifyIntent(query: string): Promise<QueryIntent>;
  extractEntities(query: string): Promise<NamedEntity[]>;
  expandQuery(query: string): Promise<QueryExpansion>;
  
  // Language support
  detectLanguage(query: string): Promise<string>;
  correctSpelling(query: string): Promise<SpellCorrection>;
  translateQuery(query: string, targetLang: string): Promise<string>;
  
  // Context understanding
  parseContext(query: string, history: string[]): Promise<QueryContext>;
  resolveReferences(query: string, context: QueryContext): Promise<string>;
}

interface ProcessedQuery {
  original: string;
  normalized: string;
  intent: QueryIntent;
  entities: NamedEntity[];
  expansion: QueryExpansion;
  confidence: number;
  language: string;
  corrections: SpellCorrection[];
  context: QueryContext;
  searchStrategy: SearchStrategy;
}

enum QueryIntent {
  SEARCH = 'search',           // "find documents about AI"
  QUESTION = 'question',       // "what is machine learning?"
  NAVIGATION = 'navigation',   // "go to user settings"
  COMPARISON = 'comparison',   // "compare React vs Vue"
  DEFINITION = 'definition',   // "define microservice"
  TUTORIAL = 'tutorial',       // "how to deploy app"
  TROUBLESHOOT = 'troubleshoot' // "fix database connection error"
}

interface NamedEntity {
  text: string;
  type: EntityType;
  confidence: number;
  startIndex: number;
  endIndex: number;
  metadata: Record<string, any>;
}

enum EntityType {
  PERSON = 'person',
  ORGANIZATION = 'organization',
  TECHNOLOGY = 'technology',
  PROGRAMMING_LANGUAGE = 'programming_language',
  FRAMEWORK = 'framework',
  CONCEPT = 'concept',
  FILE_TYPE = 'file_type',
  DATE = 'date',
  LOCATION = 'location'
}
```

**LLM Integration Service**
```typescript
interface LLMService {
  // Query understanding
  understandQuery(query: string): Promise<QueryUnderstanding>;
  generateSearchTerms(query: string): Promise<string[]>;
  classifySearchIntent(query: string): Promise<IntentClassification>;
  
  // Query expansion
  expandWithSynonyms(query: string): Promise<string[]>;
  generateRelatedQueries(query: string): Promise<RelatedQuery[]>;
  improveQuery(query: string, context: string): Promise<string>;
  
  // Multi-language support
  translateQuery(query: string, sourceLang: string, targetLang: string): Promise<string>;
  detectLanguage(query: string): Promise<LanguageDetection>;
}

interface QueryUnderstanding {
  mainIntent: string;
  subIntents: string[];
  entities: NamedEntity[];
  concepts: string[];
  expectedResultTypes: ContentType[];
  confidence: number;
  reasoning: string;
}
```

**Database Schema for NLP**
```sql
CREATE TABLE query_processing_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  query_hash VARCHAR(64) NOT NULL UNIQUE,
  original_query TEXT NOT NULL,
  processed_query JSONB NOT NULL,
  intent VARCHAR(50),
  entities JSONB DEFAULT '[]',
  expansions JSONB DEFAULT '[]',
  language VARCHAR(10),
  confidence DECIMAL(3,2),
  processing_time_ms INTEGER,
  created_at TIMESTAMP DEFAULT NOW(),
  accessed_count INTEGER DEFAULT 1,
  last_accessed_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE query_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  query_hash VARCHAR(64) NOT NULL,
  user_id UUID REFERENCES users(id),
  feedback_type VARCHAR(50) NOT NULL, -- helpful, not_helpful, wrong_intent
  feedback_data JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_query_cache_hash ON query_processing_cache(query_hash);
CREATE INDEX idx_query_feedback_hash ON query_feedback(query_hash);
```

**Key Features**
- **Intent Classification**: Understand what users want to accomplish
- **Entity Extraction**: Identify important terms and concepts
- **Query Expansion**: Generate synonyms and related terms
- **Spell Correction**: Fix typos and suggest corrections
- **Context Awareness**: Understand queries in conversation context
- **Multi-language**: Support for multiple languages

**Acceptance Criteria**
1. ✅ Intent classification with 85%+ accuracy
2. ✅ Entity extraction for technical terms
3. ✅ Query expansion improving results by 20%
4. ✅ Spell correction with suggestions
5. ✅ Multi-language query support
6. ✅ Processing latency <200ms
7. ✅ Integration with existing search pipeline

---

#### 3.1.2 AI-Generated Summaries

**Agent**: fullstack-feature-developer  
**Estimated Time**: 2 weeks  
**Priority**: High

**Description**  
Generate intelligent summaries of search results using LLMs, with key points extraction, answer generation for questions, and proper source citation.

**Technical Requirements**
- LLM integration for content summarization
- Multi-result aggregation and synthesis
- Source attribution and citation linking
- Answer generation for question-type queries
- Confidence scoring and fact-checking
- Real-time summary generation

**AI Summary Service**
```typescript
interface AISummaryService {
  // Summary generation
  generateResultSummary(results: SearchResult[]): Promise<SearchSummary>;
  generateAnswerFromResults(question: string, results: SearchResult[]): Promise<GeneratedAnswer>;
  extractKeyPoints(content: string[]): Promise<KeyPoint[]>;
  
  // Content synthesis
  synthesizeInformation(sources: ContentSource[]): Promise<SynthesizedContent>;
  compareResults(results: SearchResult[]): Promise<Comparison>;
  identifyGaps(query: string, results: SearchResult[]): Promise<ContentGap[]>;
  
  // Quality assurance
  validateFactualAccuracy(summary: string, sources: ContentSource[]): Promise<FactCheck>;
  calculateConfidence(summary: string, sources: ContentSource[]): Promise<number>;
  detectHallucinations(summary: string, sources: ContentSource[]): Promise<HallucinationCheck>;
}

interface SearchSummary {
  id: string;
  query: string;
  summary: string;
  keyPoints: KeyPoint[];
  sources: SummaryCitation[];
  confidence: number;
  generatedAt: Date;
  metadata: SummaryMetadata;
}

interface GeneratedAnswer {
  question: string;
  answer: string;
  confidence: number;
  sources: AnswerCitation[];
  followUpQuestions: string[];
  caveats: string[];
  lastUpdated: Date;
}

interface KeyPoint {
  point: string;
  importance: number;
  sources: string[];
  category: string;
  confidence: number;
}

interface SummaryCitation {
  sourceId: string;
  sourceType: ContentType;
  title: string;
  url?: string;
  excerpt: string;
  relevanceScore: number;
  trustScore: number;
}
```

**Summary Generation Pipeline**
```typescript
class SummaryGenerationPipeline {
  async generateSummary(
    query: string, 
    results: SearchResult[]
  ): Promise<SearchSummary> {
    // Step 1: Content preprocessing
    const processedContent = await this.preprocessContent(results);
    
    // Step 2: Relevance ranking
    const rankedContent = await this.rankByRelevance(query, processedContent);
    
    // Step 3: Content synthesis
    const synthesizedInfo = await this.synthesizeContent(rankedContent);
    
    // Step 4: Summary generation
    const summary = await this.generateTextSummary(synthesizedInfo);
    
    // Step 5: Citation generation
    const citations = await this.generateCitations(summary, rankedContent);
    
    // Step 6: Quality validation
    const qualityCheck = await this.validateQuality(summary, citations);
    
    // Step 7: Confidence scoring
    const confidence = await this.calculateConfidence(summary, citations);
    
    return {
      id: crypto.randomUUID(),
      query,
      summary: summary.text,
      keyPoints: summary.keyPoints,
      sources: citations,
      confidence,
      generatedAt: new Date(),
      metadata: {
        processingTime: qualityCheck.processingTime,
        sourcesUsed: citations.length,
        qualityScore: qualityCheck.score
      }
    };
  }

  private async synthesizeContent(
    content: RankedContent[]
  ): Promise<SynthesizedContent> {
    const prompt = `
      Synthesize the following information into a comprehensive understanding:
      
      ${content.map((c, i) => `
        Source ${i + 1} (Relevance: ${c.relevance}):
        ${c.content}
      `).join('\n')}
      
      Requirements:
      - Identify key themes and concepts
      - Note contradictions or disagreements
      - Highlight most important information
      - Maintain factual accuracy
    `;
    
    return this.llmService.generateSynthesis(prompt);
  }
}
```

**React Components for AI Summaries**
```typescript
interface AISummaryCardProps {
  summary: SearchSummary;
  onSourceClick: (sourceId: string) => void;
  onFeedback: (feedback: SummaryFeedback) => void;
  expandable?: boolean;
}

export const AISummaryCard: React.FC<AISummaryCardProps> = ({
  summary,
  onSourceClick,
  onFeedback,
  expandable = true
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [userFeedback, setUserFeedback] = useState<string | null>(null);

  return (
    <div className="ai-summary-card">
      <div className="summary-header">
        <div className="summary-badge">
          <Icon name="sparkles" />
          <span>AI Summary</span>
        </div>
        
        <div className="confidence-indicator">
          <div className="confidence-bar">
            <div 
              className="confidence-fill" 
              style={{ width: `${summary.confidence * 100}%` }}
            />
          </div>
          <span>{Math.round(summary.confidence * 100)}% confidence</span>
        </div>
      </div>

      <div className="summary-content">
        <div className="summary-text">
          {summary.summary}
        </div>

        {summary.keyPoints.length > 0 && (
          <div className="key-points">
            <h4>Key Points</h4>
            <ul>
              {summary.keyPoints.slice(0, isExpanded ? undefined : 3).map((point, index) => (
                <li key={index}>
                  <span className="point-text">{point.point}</span>
                  <div className="point-sources">
                    {point.sources.map(sourceId => (
                      <button
                        key={sourceId}
                        className="source-link"
                        onClick={() => onSourceClick(sourceId)}
                      >
                        Source
                      </button>
                    ))}
                  </div>
                </li>
              ))}
            </ul>
            
            {expandable && summary.keyPoints.length > 3 && (
              <button
                className="expand-toggle"
                onClick={() => setIsExpanded(!isExpanded)}
              >
                {isExpanded ? 'Show Less' : `Show ${summary.keyPoints.length - 3} More`}
              </button>
            )}
          </div>
        )}

        <div className="summary-sources">
          <h4>Sources ({summary.sources.length})</h4>
          <div className="sources-list">
            {summary.sources.slice(0, 3).map(source => (
              <button
                key={source.sourceId}
                className="source-card"
                onClick={() => onSourceClick(source.sourceId)}
              >
                <div className="source-title">{source.title}</div>
                <div className="source-excerpt">{source.excerpt}</div>
                <div className="source-metadata">
                  <span className="source-type">{source.sourceType}</span>
                  <span className="relevance-score">
                    {Math.round(source.relevanceScore * 100)}% relevant
                  </span>
                </div>
              </button>
            ))}
            
            {summary.sources.length > 3 && (
              <button 
                className="show-all-sources"
                onClick={() => setIsExpanded(true)}
              >
                +{summary.sources.length - 3} more sources
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="summary-actions">
        <div className="feedback-buttons">
          <button
            className={`feedback-btn ${userFeedback === 'helpful' ? 'active' : ''}`}
            onClick={() => {
              setUserFeedback('helpful');
              onFeedback({ type: 'helpful', summaryId: summary.id });
            }}
          >
            <Icon name="thumbs-up" />
            Helpful
          </button>
          <button
            className={`feedback-btn ${userFeedback === 'not-helpful' ? 'active' : ''}`}
            onClick={() => {
              setUserFeedback('not-helpful');
              onFeedback({ type: 'not-helpful', summaryId: summary.id });
            }}
          >
            <Icon name="thumbs-down" />
            Not Helpful
          </button>
        </div>

        <div className="share-actions">
          <button className="action-btn" onClick={() => handleShare(summary)}>
            <Icon name="share" />
            Share
          </button>
          <button className="action-btn" onClick={() => handleSave(summary)}>
            <Icon name="bookmark" />
            Save
          </button>
        </div>
      </div>

      <div className="summary-footer">
        <span className="generation-time">
          Generated {formatRelativeDate(summary.generatedAt)}
        </span>
        <span className="processing-info">
          {summary.sources.length} sources • {summary.keyPoints.length} key points
        </span>
      </div>
    </div>
  );
};
```

**Key Features**
- **Intelligent Summarization**: Multi-result synthesis with LLMs
- **Source Attribution**: Proper citation with trust scores
- **Answer Generation**: Direct answers to questions
- **Confidence Scoring**: Reliability indicators
- **Fact Checking**: Hallucination detection
- **Real-time**: Fast summary generation

**Acceptance Criteria**
1. ✅ Summary generation for multi-result sets
2. ✅ Source attribution with clickable citations
3. ✅ Answer generation for question queries
4. ✅ Confidence scoring with accuracy >80%
5. ✅ Fact-checking and hallucination detection
6. ✅ Generation time <2 seconds
7. ✅ User feedback collection and learning

---

### 3.2 Advanced Filtering & Facets

#### 3.2.1 Dynamic Facet Generation

**Agent**: nodejs-backend-engineer  
**Estimated Time**: 1.5 weeks  
**Priority**: High

**Description**  
Create dynamic faceting system that automatically discovers facets from result content, provides hierarchical facets, range filters, and real-time facet statistics.

**Technical Requirements**
- Automatic facet discovery from search results
- Hierarchical facet structures with drill-down
- Range facets for numeric and date fields
- Multi-select facets with AND/OR logic
- Real-time facet statistics and counts
- Performance optimization for large result sets

**Dynamic Facet Service**
```typescript
interface DynamicFacetService {
  // Facet generation
  generateFacets(results: SearchResult[], query: string): Promise<FacetCollection>;
  discoverFacets(results: SearchResult[]): Promise<DiscoveredFacet[]>;
  buildHierarchicalFacets(results: SearchResult[]): Promise<HierarchicalFacet[]>;
  
  // Facet operations
  applyFacetFilters(results: SearchResult[], filters: FacetFilter[]): Promise<SearchResult[]>;
  calculateFacetCounts(results: SearchResult[], facets: Facet[]): Promise<FacetCounts>;
  refreshFacetStatistics(facetId: string): Promise<FacetStatistics>;
  
  // Range facets
  generateRangeFacets(field: string, results: SearchResult[]): Promise<RangeFacet>;
  calculateOptimalRanges(values: number[]): Promise<Range[]>;
  
  // Performance optimization
  cacheFacetData(query: string, facets: FacetCollection): Promise<void>;
  precomputeFacets(commonQueries: string[]): Promise<void>;
}

interface FacetCollection {
  query: string;
  totalResults: number;
  facets: Facet[];
  rangeFacets: RangeFacet[];
  hierarchicalFacets: HierarchicalFacet[];
  discoveredFacets: DiscoveredFacet[];
  generatedAt: Date;
  computationTime: number;
}

interface Facet {
  id: string;
  name: string;
  field: string;
  type: FacetType;
  values: FacetValue[];
  displayOptions: FacetDisplayOptions;
  metadata: FacetMetadata;
}

enum FacetType {
  CATEGORICAL = 'categorical',
  BOOLEAN = 'boolean',
  DATE = 'date',
  NUMERIC_RANGE = 'numeric_range',
  HIERARCHICAL = 'hierarchical',
  TAG_CLOUD = 'tag_cloud',
  GEO = 'geo'
}

interface FacetValue {
  value: string;
  displayValue: string;
  count: number;
  percentage: number;
  selected: boolean;
  children?: FacetValue[];
  metadata?: Record<string, any>;
}
```

**Auto-Discovery Algorithm**
```typescript
class FacetDiscoveryEngine {
  async discoverFacets(results: SearchResult[]): Promise<DiscoveredFacet[]> {
    const discoveredFacets: DiscoveredFacet[] = [];
    
    // Analyze content for common patterns
    const patterns = await this.analyzeContentPatterns(results);
    
    // Discover categorical facets
    const categoricalFacets = await this.discoverCategoricalFacets(results, patterns);
    discoveredFacets.push(...categoricalFacets);
    
    // Discover date range facets
    const dateFacets = await this.discoverDateFacets(results);
    discoveredFacets.push(...dateFacets);
    
    // Discover numeric range facets
    const numericFacets = await this.discoverNumericFacets(results);
    discoveredFacets.push(...numericFacets);
    
    // Discover tag-based facets
    const tagFacets = await this.discoverTagFacets(results);
    discoveredFacets.push(...tagFacets);
    
    // Score and rank facets by usefulness
    return this.rankFacetsByUsefulness(discoveredFacets);
  }

  private async discoverCategoricalFacets(
    results: SearchResult[],
    patterns: ContentPattern[]
  ): Promise<DiscoveredFacet[]> {
    const facets: DiscoveredFacet[] = [];
    
    // Common categorical fields
    const categoricalFields = [
      'type', 'contentType', 'source', 'author', 'language',
      'technology', 'framework', 'platform', 'status'
    ];
    
    for (const field of categoricalFields) {
      const valueDistribution = this.analyzeFieldDistribution(results, field);
      
      if (this.isViableCategory(valueDistribution)) {
        facets.push({
          field,
          type: FacetType.CATEGORICAL,
          name: this.generateFacetName(field),
          values: this.convertToFacetValues(valueDistribution),
          score: this.calculateFacetScore(valueDistribution),
          discovered: true
        });
      }
    }
    
    return facets;
  }

  private isViableCategory(distribution: ValueDistribution): boolean {
    const uniqueValues = Object.keys(distribution).length;
    const totalValues = Object.values(distribution).reduce((a, b) => a + b, 0);
    
    // Good categorical facets have:
    // - Between 2-20 unique values
    // - No single value dominates >80%
    // - At least 5% of results have the value
    
    if (uniqueValues < 2 || uniqueValues > 20) return false;
    
    const maxValue = Math.max(...Object.values(distribution));
    if (maxValue / totalValues > 0.8) return false;
    
    const minViableCount = Math.max(1, totalValues * 0.05);
    const viableValues = Object.values(distribution).filter(count => count >= minViableCount);
    
    return viableValues.length >= 2;
  }
}
```

**Hierarchical Facet Implementation**
```typescript
interface HierarchicalFacet {
  id: string;
  name: string;
  field: string;
  hierarchy: FacetHierarchy;
  maxDepth: number;
  expandedLevels: Set<string>;
}

interface FacetHierarchy {
  root: HierarchicalFacetNode;
  pathSeparator: string;
  levelNames: string[];
}

interface HierarchicalFacetNode {
  id: string;
  value: string;
  displayValue: string;
  count: number;
  level: number;
  parent?: HierarchicalFacetNode;
  children: HierarchicalFacetNode[];
  path: string[];
  selected: boolean;
  expanded: boolean;
}

class HierarchicalFacetBuilder {
  buildTechnologyHierarchy(results: SearchResult[]): HierarchicalFacet {
    // Example: JavaScript > React > Next.js
    //          JavaScript > Node.js > Express
    //          Python > Django > REST Framework
    
    const hierarchy = this.buildHierarchyFromPaths(
      this.extractTechnologyPaths(results),
      ' > '
    );
    
    return {
      id: 'technology-hierarchy',
      name: 'Technology Stack',
      field: 'technologies',
      hierarchy,
      maxDepth: 3,
      expandedLevels: new Set(['0']) // Expand first level by default
    };
  }

  buildContentHierarchy(results: SearchResult[]): HierarchicalFacet {
    // Example: Documentation > API > REST API
    //          Documentation > Tutorials > Getting Started
    //          Code > Frontend > Components
    
    return {
      id: 'content-hierarchy',
      name: 'Content Type',
      field: 'contentHierarchy',
      hierarchy: this.buildContentTypeHierarchy(results),
      maxDepth: 4,
      expandedLevels: new Set(['0', '1'])
    };
  }
}
```

**React Components for Dynamic Facets**
```typescript
interface DynamicFacetsProps {
  facets: FacetCollection;
  selectedFacets: FacetFilter[];
  onFacetChange: (filters: FacetFilter[]) => void;
  onFacetExpand: (facetId: string) => void;
  loading?: boolean;
}

export const DynamicFacets: React.FC<DynamicFacetsProps> = ({
  facets,
  selectedFacets,
  onFacetChange,
  onFacetExpand,
  loading = false
}) => {
  const [collapsedFacets, setCollapsedFacets] = useState<Set<string>>(new Set());
  const [facetSearch, setFacetSearch] = useState<Record<string, string>>({});

  return (
    <div className="dynamic-facets">
      <div className="facets-header">
        <h3>Filter Results</h3>
        {selectedFacets.length > 0 && (
          <button 
            className="clear-all-filters"
            onClick={() => onFacetChange([])}
          >
            Clear All ({selectedFacets.length})
          </button>
        )}
      </div>

      {/* Active Filters */}
      {selectedFacets.length > 0 && (
        <div className="active-filters">
          <div className="active-filters-header">Active Filters</div>
          <div className="filter-chips">
            {selectedFacets.map(filter => (
              <div key={`${filter.facetId}-${filter.value}`} className="filter-chip">
                <span className="filter-name">{filter.displayName}</span>
                <span className="filter-value">{filter.displayValue}</span>
                <button
                  className="remove-filter"
                  onClick={() => removeFacetFilter(filter)}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Categorical Facets */}
      {facets.facets.map(facet => (
        <FacetGroup
          key={facet.id}
          facet={facet}
          selectedValues={getSelectedValues(facet.id, selectedFacets)}
          onSelectionChange={(values) => updateFacetSelection(facet.id, values)}
          collapsed={collapsedFacets.has(facet.id)}
          onToggleCollapse={() => toggleFacetCollapse(facet.id)}
          searchValue={facetSearch[facet.id] || ''}
          onSearchChange={(value) => updateFacetSearch(facet.id, value)}
          loading={loading}
        />
      ))}

      {/* Range Facets */}
      {facets.rangeFacets.map(rangeFacet => (
        <RangeFacetGroup
          key={rangeFacet.id}
          facet={rangeFacet}
          selectedRange={getSelectedRange(rangeFacet.id, selectedFacets)}
          onRangeChange={(range) => updateRangeSelection(rangeFacet.id, range)}
          collapsed={collapsedFacets.has(rangeFacet.id)}
          onToggleCollapse={() => toggleFacetCollapse(rangeFacet.id)}
        />
      ))}

      {/* Hierarchical Facets */}
      {facets.hierarchicalFacets.map(hierarchicalFacet => (
        <HierarchicalFacetGroup
          key={hierarchicalFacet.id}
          facet={hierarchicalFacet}
          selectedPaths={getSelectedPaths(hierarchicalFacet.id, selectedFacets)}
          onPathSelection={(paths) => updatePathSelection(hierarchicalFacet.id, paths)}
          onExpand={(nodeId) => onFacetExpand(nodeId)}
        />
      ))}

      {/* Discovered Facets */}
      {facets.discoveredFacets.length > 0 && (
        <div className="discovered-facets">
          <div className="discovered-facets-header">
            <Icon name="sparkles" />
            <span>Suggested Filters</span>
          </div>
          {facets.discoveredFacets.slice(0, 3).map(discovered => (
            <DiscoveredFacetCard
              key={discovered.id}
              facet={discovered}
              onApply={() => applyDiscoveredFacet(discovered)}
              onDismiss={() => dismissDiscoveredFacet(discovered.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
};
```

**Key Features**
- **Auto-Discovery**: Automatic facet generation from content
- **Hierarchical**: Drill-down navigation in facets  
- **Range Filters**: Date and numeric range facets
- **Real-time Counts**: Live facet statistics
- **Performance**: Optimized for large result sets
- **Customizable**: User-configurable facet display

**Acceptance Criteria**
1. ✅ Automatic facet discovery from results
2. ✅ Hierarchical facets with drill-down navigation
3. ✅ Range facets for dates and numbers
4. ✅ Real-time facet count updates
5. ✅ Multi-select with AND/OR logic
6. ✅ Performance: <500ms for 10k results
7. ✅ Mobile-responsive facet interface

---

#### 3.2.2 Custom Filter Builder

**Agent**: fullstack-feature-developer  
**Estimated Time**: 2 weeks  
**Priority**: Medium

**Description**  
Create visual query builder for complex filters with drag-and-drop interface, Boolean logic support, nested filter groups, and filter templates.

**Technical Requirements**
- Drag-and-drop visual query builder
- Boolean logic operators (AND, OR, NOT)
- Nested filter groups with parentheses
- Filter templates and presets
- Real-time query preview and validation
- Filter sharing and collaboration

**Visual Query Builder Service**
```typescript
interface QueryBuilderService {
  // Query building
  buildQuery(filterTree: FilterTree): Promise<SearchQuery>;
  validateQuery(filterTree: FilterTree): Promise<QueryValidation>;
  optimizeQuery(filterTree: FilterTree): Promise<FilterTree>;
  
  // Templates
  createTemplate(name: string, filterTree: FilterTree): Promise<FilterTemplate>;
  getTemplates(userId?: string): Promise<FilterTemplate[]>;
  applyTemplate(templateId: string): Promise<FilterTree>;
  
  // Sharing
  shareFilter(filterTree: FilterTree, permissions: SharePermissions): Promise<string>;
  importSharedFilter(shareId: string): Promise<FilterTree>;
  
  // Presets
  getPresetFilters(contentType?: ContentType): Promise<PresetFilter[]>;
  suggestFilters(query: string): Promise<FilterSuggestion[]>;
}

interface FilterTree {
  id: string;
  type: 'group' | 'condition';
  operator?: BooleanOperator;
  conditions?: FilterCondition[];
  children?: FilterTree[];
  metadata?: FilterMetadata;
}

enum BooleanOperator {
  AND = 'AND',
  OR = 'OR',
  NOT = 'NOT'
}

interface FilterCondition {
  id: string;
  field: string;
  operator: ComparisonOperator;
  value: any;
  valueType: ValueType;
  displayName: string;
  negate: boolean;
}

enum ComparisonOperator {
  EQUALS = 'equals',
  NOT_EQUALS = 'not_equals',
  CONTAINS = 'contains',
  NOT_CONTAINS = 'not_contains',
  STARTS_WITH = 'starts_with',
  ENDS_WITH = 'ends_with',
  GREATER_THAN = 'greater_than',
  LESS_THAN = 'less_than',
  BETWEEN = 'between',
  IN = 'in',
  NOT_IN = 'not_in',
  IS_EMPTY = 'is_empty',
  IS_NOT_EMPTY = 'is_not_empty',
  REGEX = 'regex'
}
```

**React Query Builder Components**
```typescript
interface VisualQueryBuilderProps {
  initialFilter?: FilterTree;
  availableFields: FieldDefinition[];
  onQueryChange: (filterTree: FilterTree) => void;
  onPreview: (query: SearchQuery) => void;
  readonly?: boolean;
  showPreview?: boolean;
}

export const VisualQueryBuilder: React.FC<VisualQueryBuilderProps> = ({
  initialFilter,
  availableFields,
  onQueryChange,
  onPreview,
  readonly = false,
  showPreview = true
}) => {
  const [filterTree, setFilterTree] = useState<FilterTree>(
    initialFilter || createEmptyGroup()
  );
  const [draggedItem, setDraggedItem] = useState<DraggedItem | null>(null);
  const [queryPreview, setQueryPreview] = useState<string>('');

  const updateFilterTree = useCallback((updatedTree: FilterTree) => {
    setFilterTree(updatedTree);
    onQueryChange(updatedTree);
    
    if (showPreview) {
      queryBuilderService.buildQuery(updatedTree).then(query => {
        setQueryPreview(query.toString());
        onPreview(query);
      });
    }
  }, [onQueryChange, onPreview, showPreview]);

  return (
    <div className="visual-query-builder">
      <div className="query-builder-toolbar">
        <div className="field-palette">
          <h4>Available Fields</h4>
          <div className="field-list">
            {availableFields.map(field => (
              <div
                key={field.name}
                className="field-item"
                draggable
                onDragStart={(e) => handleFieldDragStart(e, field)}
              >
                <Icon name={getFieldIcon(field.type)} />
                <span>{field.displayName}</span>
                <div className="field-type">{field.type}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="template-actions">
          <button onClick={() => openTemplateModal('save')}>
            <Icon name="save" />
            Save Template
          </button>
          <button onClick={() => openTemplateModal('load')}>
            <Icon name="folder" />
            Load Template
          </button>
        </div>
      </div>

      <div className="query-builder-canvas">
        <FilterGroupComponent
          group={filterTree}
          onUpdate={updateFilterTree}
          onDrop={handleDropOnGroup}
          readonly={readonly}
          level={0}
        />
      </div>

      {showPreview && (
        <div className="query-preview">
          <div className="preview-header">
            <h4>Query Preview</h4>
            <button onClick={() => copyToClipboard(queryPreview)}>
              <Icon name="copy" />
              Copy
            </button>
          </div>
          <div className="preview-content">
            <code>{queryPreview}</code>
          </div>
        </div>
      )}
    </div>
  );
};

interface FilterGroupComponentProps {
  group: FilterTree;
  onUpdate: (updatedGroup: FilterTree) => void;
  onDrop: (droppedItem: DraggedItem, targetGroup: FilterTree) => void;
  readonly?: boolean;
  level: number;
}

const FilterGroupComponent: React.FC<FilterGroupComponentProps> = ({
  group,
  onUpdate,
  onDrop,
  readonly = false,
  level
}) => {
  const [isDragOver, setIsDragOver] = useState(false);

  const addCondition = useCallback(() => {
    const newCondition: FilterCondition = {
      id: crypto.randomUUID(),
      field: '',
      operator: ComparisonOperator.EQUALS,
      value: '',
      valueType: ValueType.STRING,
      displayName: 'New Condition',
      negate: false
    };

    const updatedGroup: FilterTree = {
      ...group,
      conditions: [...(group.conditions || []), newCondition]
    };

    onUpdate(updatedGroup);
  }, [group, onUpdate]);

  const addGroup = useCallback(() => {
    const newGroup: FilterTree = {
      id: crypto.randomUUID(),
      type: 'group',
      operator: BooleanOperator.AND,
      conditions: [],
      children: []
    };

    const updatedGroup: FilterTree = {
      ...group,
      children: [...(group.children || []), newGroup]
    };

    onUpdate(updatedGroup);
  }, [group, onUpdate]);

  return (
    <div 
      className={`filter-group level-${level} ${isDragOver ? 'drag-over' : ''}`}
      onDragOver={handleDragOver}
      onDragLeave={() => setIsDragOver(false)}
      onDrop={(e) => handleDrop(e, group)}
    >
      <div className="group-header">
        <select
          value={group.operator || BooleanOperator.AND}
          onChange={(e) => updateGroupOperator(e.target.value as BooleanOperator)}
          disabled={readonly}
        >
          <option value={BooleanOperator.AND}>AND</option>
          <option value={BooleanOperator.OR}>OR</option>
          <option value={BooleanOperator.NOT}>NOT</option>
        </select>

        <div className="group-actions">
          {!readonly && (
            <>
              <button onClick={addCondition} title="Add Condition">
                <Icon name="plus" />
                Condition
              </button>
              <button onClick={addGroup} title="Add Group">
                <Icon name="plus" />
                Group
              </button>
              {level > 0 && (
                <button onClick={() => removeGroup(group.id)} title="Remove Group">
                  <Icon name="trash" />
                </button>
              )}
            </>
          )}
        </div>
      </div>

      <div className="group-content">
        {/* Render conditions */}
        {group.conditions?.map(condition => (
          <FilterConditionComponent
            key={condition.id}
            condition={condition}
            onUpdate={(updatedCondition) => updateCondition(condition.id, updatedCondition)}
            onRemove={() => removeCondition(condition.id)}
            readonly={readonly}
          />
        ))}

        {/* Render child groups */}
        {group.children?.map(childGroup => (
          <FilterGroupComponent
            key={childGroup.id}
            group={childGroup}
            onUpdate={(updatedChild) => updateChildGroup(childGroup.id, updatedChild)}
            onDrop={onDrop}
            readonly={readonly}
            level={level + 1}
          />
        ))}

        {/* Drop zone for empty groups */}
        {(!group.conditions?.length && !group.children?.length) && (
          <div className="empty-group-placeholder">
            <Icon name="plus-circle" />
            <span>Drag fields here or click to add conditions</span>
          </div>
        )}
      </div>
    </div>
  );
};
```

**Filter Templates System**
```typescript
interface FilterTemplate {
  id: string;
  name: string;
  description: string;
  category: string;
  filterTree: FilterTree;
  isPublic: boolean;
  createdBy: string;
  createdAt: Date;
  usageCount: number;
  tags: string[];
}

interface PresetFilter {
  id: string;
  name: string;
  description: string;
  icon: string;
  filterTree: FilterTree;
  applicableTypes: ContentType[];
  category: FilterCategory;
}

enum FilterCategory {
  CONTENT_TYPE = 'content_type',
  DATE_RANGE = 'date_range',
  QUALITY = 'quality',
  SOURCE = 'source',
  TECHNICAL = 'technical',
  CUSTOM = 'custom'
}

const PRESET_FILTERS: PresetFilter[] = [
  {
    id: 'recent-content',
    name: 'Recent Content',
    description: 'Content created in the last 30 days',
    icon: 'clock',
    filterTree: {
      id: 'recent-filter',
      type: 'condition',
      operator: BooleanOperator.AND,
      conditions: [{
        id: 'date-condition',
        field: 'created_at',
        operator: ComparisonOperator.GREATER_THAN,
        value: '30 days ago',
        valueType: ValueType.DATE,
        displayName: 'Created Date',
        negate: false
      }]
    },
    applicableTypes: [ContentType.ALL],
    category: FilterCategory.DATE_RANGE
  },
  {
    id: 'high-quality-code',
    name: 'High Quality Code',
    description: 'Code files with quality score > 80%',
    icon: 'star',
    filterTree: {
      id: 'quality-filter',
      type: 'group',
      operator: BooleanOperator.AND,
      conditions: [
        {
          id: 'type-condition',
          field: 'content_type',
          operator: ComparisonOperator.IN,
          value: ['code_file', 'code_chunk'],
          valueType: ValueType.ARRAY,
          displayName: 'Content Type',
          negate: false
        },
        {
          id: 'quality-condition',
          field: 'quality_score',
          operator: ComparisonOperator.GREATER_THAN,
          value: 0.8,
          valueType: ValueType.NUMBER,
          displayName: 'Quality Score',
          negate: false
        }
      ]
    },
    applicableTypes: [ContentType.CODE_FILE, ContentType.CODE_CHUNK],
    category: FilterCategory.QUALITY
  }
];
```

**Key Features**
- **Visual Interface**: Drag-and-drop query construction
- **Boolean Logic**: AND, OR, NOT operators with grouping
- **Nested Groups**: Complex query structures with parentheses
- **Templates**: Save and share filter configurations
- **Real-time Preview**: Live query generation and validation
- **Field Assistance**: Smart field suggestions and validation

**Acceptance Criteria**
1. ✅ Drag-and-drop visual query builder
2. ✅ Boolean logic with nested groups
3. ✅ Real-time query preview and validation
4. ✅ Filter template system with sharing
5. ✅ Smart field suggestions and type validation
6. ✅ Mobile-responsive builder interface
7. ✅ Export/import filter configurations

---

### 3.3 Saved Searches & Alerts

#### 3.3.1 Saved Search Management

**Agent**: fullstack-feature-developer  
**Estimated Time**: 2 weeks  
**Priority**: High

**Description**  
Enable users to save, organize, and manage search queries with collections, scheduling, team sharing, and version history.

**Technical Requirements**
- Search saving with metadata and organization
- Search collections and folders
- Scheduled search execution
- Team sharing and collaboration
- Search version history and change tracking
- Search analytics and usage statistics

**Saved Search Service**
```typescript
interface SavedSearchService {
  // Search management
  saveSearch(search: SaveSearchRequest): Promise<SavedSearch>;
  updateSearch(searchId: string, updates: Partial<SavedSearch>): Promise<SavedSearch>;
  deleteSearch(searchId: string): Promise<void>;
  getUserSearches(userId: string, options?: SearchListOptions): Promise<SavedSearch[]>;
  
  // Organization
  createCollection(collection: SearchCollection): Promise<SearchCollection>;
  addToCollection(searchId: string, collectionId: string): Promise<void>;
  removeFromCollection(searchId: string, collectionId: string): Promise<void>;
  getCollections(userId: string): Promise<SearchCollection[]>;
  
  // Scheduling
  scheduleSearch(searchId: string, schedule: SearchSchedule): Promise<ScheduledSearch>;
  updateSchedule(scheduleId: string, schedule: Partial<SearchSchedule>): Promise<ScheduledSearch>;
  getScheduledSearches(userId: string): Promise<ScheduledSearch[]>;
  executeScheduledSearch(scheduleId: string): Promise<SearchExecution>;
  
  // Sharing
  shareSearch(searchId: string, permissions: SharePermissions): Promise<string>;
  getSharedSearches(userId: string): Promise<SharedSearch[]>;
  acceptSearchShare(shareId: string): Promise<SavedSearch>;
  
  // History and versioning
  getSearchHistory(searchId: string): Promise<SearchVersion[]>;
  revertToVersion(searchId: string, versionId: string): Promise<SavedSearch>;
  compareVersions(versionId1: string, versionId2: string): Promise<SearchComparison>;
}

interface SavedSearch {
  id: string;
  name: string;
  description?: string;
  query: SearchQuery;
  filters: SearchFilters;
  isPublic: boolean;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
  lastExecutedAt?: Date;
  executionCount: number;
  tags: string[];
  collections: string[];
  metadata: SavedSearchMetadata;
}

interface SearchCollection {
  id: string;
  name: string;
  description?: string;
  color: string;
  icon: string;
  searches: string[];
  isShared: boolean;
  sharedWith: string[];
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

interface SearchSchedule {
  frequency: ScheduleFrequency;
  interval: number;
  dayOfWeek?: number[];
  timeOfDay: string;
  timezone: string;
  isActive: boolean;
  endDate?: Date;
}

enum ScheduleFrequency {
  HOURLY = 'hourly',
  DAILY = 'daily',
  WEEKLY = 'weekly',
  MONTHLY = 'monthly'
}
```

**Database Schema for Saved Searches**
```sql
CREATE TABLE saved_searches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  description TEXT,
  query_data JSONB NOT NULL,
  filters_data JSONB DEFAULT '{}',
  is_public BOOLEAN DEFAULT FALSE,
  created_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  last_executed_at TIMESTAMP,
  execution_count INTEGER DEFAULT 0,
  tags JSONB DEFAULT '[]',
  metadata JSONB DEFAULT '{}'
);

CREATE TABLE search_collections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  description TEXT,
  color VARCHAR(20) DEFAULT '#3B82F6',
  icon VARCHAR(50) DEFAULT 'folder',
  is_shared BOOLEAN DEFAULT FALSE,
  created_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE search_collection_items (
  collection_id UUID NOT NULL REFERENCES search_collections(id) ON DELETE CASCADE,
  search_id UUID NOT NULL REFERENCES saved_searches(id) ON DELETE CASCADE,
  added_at TIMESTAMP DEFAULT NOW(),
  added_by UUID NOT NULL REFERENCES users(id),
  PRIMARY KEY (collection_id, search_id)
);

CREATE TABLE scheduled_searches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  search_id UUID NOT NULL REFERENCES saved_searches(id) ON DELETE CASCADE,
  frequency VARCHAR(20) NOT NULL,
  interval_value INTEGER DEFAULT 1,
  days_of_week INTEGER[],
  time_of_day TIME NOT NULL,
  timezone VARCHAR(50) DEFAULT 'UTC',
  is_active BOOLEAN DEFAULT TRUE,
  end_date DATE,
  created_at TIMESTAMP DEFAULT NOW(),
  last_executed_at TIMESTAMP,
  next_execution_at TIMESTAMP,
  execution_count INTEGER DEFAULT 0
);

CREATE TABLE search_executions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scheduled_search_id UUID REFERENCES scheduled_searches(id) ON DELETE CASCADE,
  search_id UUID NOT NULL REFERENCES saved_searches(id) ON DELETE CASCADE,
  executed_at TIMESTAMP DEFAULT NOW(),
  execution_time_ms INTEGER,
  results_count INTEGER,
  status VARCHAR(20) DEFAULT 'success', -- success, error, timeout
  error_message TEXT,
  results_data JSONB
);

CREATE TABLE search_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  search_id UUID NOT NULL REFERENCES saved_searches(id) ON DELETE CASCADE,
  version_number INTEGER NOT NULL,
  query_data JSONB NOT NULL,
  filters_data JSONB DEFAULT '{}',
  change_description TEXT,
  created_by UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(search_id, version_number)
);

-- Indexes for performance
CREATE INDEX idx_saved_searches_user ON saved_searches(created_by);
CREATE INDEX idx_saved_searches_public ON saved_searches(is_public) WHERE is_public = TRUE;
CREATE INDEX idx_scheduled_searches_next_execution ON scheduled_searches(next_execution_at) WHERE is_active = TRUE;
CREATE INDEX idx_search_executions_scheduled ON search_executions(scheduled_search_id, executed_at);
```

**React Components for Search Management**
```typescript
interface SavedSearchManagerProps {
  userId: string;
  onSearchSelect: (search: SavedSearch) => void;
  onSearchRun: (search: SavedSearch) => void;
}

export const SavedSearchManager: React.FC<SavedSearchManagerProps> = ({
  userId,
  onSearchSelect,
  onSearchRun
}) => {
  const [searches, setSearches] = useState<SavedSearch[]>([]);
  const [collections, setCollections] = useState<SearchCollection[]>([]);
  const [selectedCollection, setSelectedCollection] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'list' | 'grid' | 'collections'>('collections');
  const [sortBy, setSortBy] = useState<'name' | 'created' | 'executed' | 'frequency'>('created');

  return (
    <div className="saved-search-manager">
      <div className="manager-header">
        <div className="header-title">
          <h2>Saved Searches</h2>
          <span className="search-count">
            {searches.length} searches in {collections.length} collections
          </span>
        </div>

        <div className="header-actions">
          <div className="view-controls">
            <button
              className={viewMode === 'list' ? 'active' : ''}
              onClick={() => setViewMode('list')}
            >
              <Icon name="list" />
            </button>
            <button
              className={viewMode === 'grid' ? 'active' : ''}
              onClick={() => setViewMode('grid')}
            >
              <Icon name="grid" />
            </button>
            <button
              className={viewMode === 'collections' ? 'active' : ''}
              onClick={() => setViewMode('collections')}
            >
              <Icon name="folder" />
            </button>
          </div>

          <div className="sort-controls">
            <select value={sortBy} onChange={(e) => setSortBy(e.target.value as any)}>
              <option value="created">Recently Created</option>
              <option value="executed">Recently Executed</option>
              <option value="name">Name</option>
              <option value="frequency">Most Used</option>
            </select>
          </div>

          <button
            className="create-collection-btn"
            onClick={() => openCreateCollectionModal()}
          >
            <Icon name="plus" />
            New Collection
          </button>
        </div>
      </div>

      <div className="manager-content">
        {viewMode === 'collections' ? (
          <div className="collections-view">
            <div className="collections-sidebar">
              <div className="collection-list">
                <div
                  className={`collection-item ${!selectedCollection ? 'active' : ''}`}
                  onClick={() => setSelectedCollection(null)}
                >
                  <Icon name="search" />
                  <span>All Searches</span>
                  <div className="collection-count">{searches.length}</div>
                </div>

                {collections.map(collection => (
                  <div
                    key={collection.id}
                    className={`collection-item ${selectedCollection === collection.id ? 'active' : ''}`}
                    onClick={() => setSelectedCollection(collection.id)}
                  >
                    <Icon name={collection.icon} color={collection.color} />
                    <span>{collection.name}</span>
                    <div className="collection-count">{collection.searches.length}</div>
                    
                    <div className="collection-actions">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          editCollection(collection);
                        }}
                      >
                        <Icon name="edit" />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          shareCollection(collection);
                        }}
                      >
                        <Icon name="share" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="collection-content">
              <SearchGrid
                searches={getFilteredSearches(selectedCollection)}
                onSearchSelect={onSearchSelect}
                onSearchRun={onSearchRun}
                onSearchEdit={openEditSearchModal}
                onSearchDelete={deleteSearch}
                onSearchShare={shareSearch}
              />
            </div>
          </div>
        ) : (
          <SearchGrid
            searches={getSortedSearches()}
            viewMode={viewMode}
            onSearchSelect={onSearchSelect}
            onSearchRun={onSearchRun}
            onSearchEdit={openEditSearchModal}
            onSearchDelete={deleteSearch}
            onSearchShare={shareSearch}
          />
        )}
      </div>
    </div>
  );
};

interface SearchCardProps {
  search: SavedSearch;
  onSelect: () => void;
  onRun: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onShare: () => void;
  compact?: boolean;
}

const SearchCard: React.FC<SearchCardProps> = ({
  search,
  onSelect,
  onRun,
  onEdit,
  onDelete,
  onShare,
  compact = false
}) => {
  const [isHovered, setIsHovered] = useState(false);
  const [executionHistory, setExecutionHistory] = useState<SearchExecution[]>([]);

  return (
    <div
      className={`search-card ${compact ? 'compact' : ''}`}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onClick={onSelect}
    >
      <div className="search-card-header">
        <div className="search-title">
          <h3>{search.name}</h3>
          {search.isPublic && (
            <div className="public-badge">
              <Icon name="globe" />
              Public
            </div>
          )}
        </div>

        <div className="search-actions">
          <button
            className="action-btn primary"
            onClick={(e) => {
              e.stopPropagation();
              onRun();
            }}
            title="Run Search"
          >
            <Icon name="play" />
          </button>
          <button
            className="action-btn"
            onClick={(e) => {
              e.stopPropagation();
              onEdit();
            }}
            title="Edit Search"
          >
            <Icon name="edit" />
          </button>
          <button
            className="action-btn"
            onClick={(e) => {
              e.stopPropagation();
              onShare();
            }}
            title="Share Search"
          >
            <Icon name="share" />
          </button>
          <button
            className="action-btn danger"
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            title="Delete Search"
          >
            <Icon name="trash" />
          </button>
        </div>
      </div>

      <div className="search-card-content">
        {search.description && (
          <p className="search-description">{search.description}</p>
        )}

        <div className="search-query-preview">
          <code>{formatQueryPreview(search.query)}</code>
        </div>

        <div className="search-tags">
          {search.tags.map(tag => (
            <span key={tag} className="search-tag">
              {tag}
            </span>
          ))}
        </div>
      </div>

      <div className="search-card-footer">
        <div className="search-stats">
          <div className="stat">
            <Icon name="calendar" />
            <span>{formatRelativeDate(search.createdAt)}</span>
          </div>
          <div className="stat">
            <Icon name="play" />
            <span>{search.executionCount} runs</span>
          </div>
          {search.lastExecutedAt && (
            <div className="stat">
              <Icon name="clock" />
              <span>Last run {formatRelativeDate(search.lastExecutedAt)}</span>
            </div>
          )}
        </div>

        {search.collections.length > 0 && (
          <div className="search-collections">
            {search.collections.slice(0, 3).map(collectionId => {
              const collection = collections.find(c => c.id === collectionId);
              return collection ? (
                <div key={collection.id} className="collection-badge">
                  <Icon name={collection.icon} color={collection.color} />
                  <span>{collection.name}</span>
                </div>
              ) : null;
            })}
            {search.collections.length > 3 && (
              <div className="more-collections">
                +{search.collections.length - 3} more
              </div>
            )}
          </div>
        )}
      </div>

      {isHovered && !compact && (
        <div className="search-preview">
          <div className="preview-header">Quick Preview</div>
          <div className="preview-filters">
            {Object.entries(search.filters).map(([key, value]) => (
              <div key={key} className="filter-preview">
                <span className="filter-key">{key}:</span>
                <span className="filter-value">{JSON.stringify(value)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
```

**Key Features**
- **Search Organization**: Collections and folders for search management
- **Team Collaboration**: Search sharing with permissions
- **Version Control**: Search history and change tracking
- **Scheduling**: Automated search execution
- **Analytics**: Usage statistics and performance metrics
- **Mobile Support**: Responsive search management interface

**Acceptance Criteria**
1. ✅ Save searches with metadata and organization
2. ✅ Search collections with drag-and-drop management
3. ✅ Team sharing with permission controls
4. ✅ Search version history and comparison
5. ✅ Usage analytics and execution statistics
6. ✅ Mobile-responsive management interface
7. ✅ Bulk operations and search templates

---

#### 3.3.2 Search Alerts & Notifications

**Agent**: nodejs-backend-engineer  
**Estimated Time**: 1.5 weeks  
**Priority**: Medium

**Description**  
Implement comprehensive alerting system for search criteria with real-time alerts, scheduled reports, threshold-based notifications, and multi-channel delivery.

**Technical Requirements**
- Real-time alert processing and delivery
- Scheduled search reports and digests
- Threshold-based alerting (result count, quality changes)
- Multi-channel notifications (email, webhook, in-app)
- Alert management dashboard and configuration
- Performance optimization for high-volume alerts

**Search Alert Service**
```typescript
interface SearchAlertService {
  // Alert management
  createAlert(alert: CreateAlertRequest): Promise<SearchAlert>;
  updateAlert(alertId: string, updates: Partial<SearchAlert>): Promise<SearchAlert>;
  deleteAlert(alertId: string): Promise<void>;
  getUserAlerts(userId: string): Promise<SearchAlert[]>;
  
  // Alert execution
  evaluateAlert(alertId: string): Promise<AlertEvaluation>;
  processAlerts(): Promise<AlertProcessingResult>;
  sendAlert(alertId: string, notification: AlertNotification): Promise<void>;
  
  // Alert history
  getAlertHistory(alertId: string, limit?: number): Promise<AlertExecution[]>;
  getAlertStats(alertId: string): Promise<AlertStatistics>;
  
  // Notification channels
  configureChannel(channel: NotificationChannel): Promise<void>;
  testChannel(channelId: string): Promise<ChannelTestResult>;
  getChannels(userId: string): Promise<NotificationChannel[]>;
  
  // Bulk operations
  pauseAllAlerts(userId: string): Promise<void>;
  resumeAllAlerts(userId: string): Promise<void>;
  bulkUpdateAlerts(alertIds: string[], updates: Partial<SearchAlert>): Promise<void>;
}

interface SearchAlert {
  id: string;
  name: string;
  description?: string;
  query: SearchQuery;
  filters: SearchFilters;
  conditions: AlertCondition[];
  schedule: AlertSchedule;
  channels: string[];
  isActive: boolean;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
  lastTriggeredAt?: Date;
  triggerCount: number;
  settings: AlertSettings;
}

interface AlertCondition {
  id: string;
  type: AlertConditionType;
  operator: ComparisonOperator;
  value: any;
  threshold?: number;
  description: string;
}

enum AlertConditionType {
  RESULT_COUNT = 'result_count',           // Number of results
  NEW_RESULTS = 'new_results',            // New results since last check
  QUALITY_CHANGE = 'quality_change',      // Average quality change
  CONTENT_CHANGE = 'content_change',      // Specific content updates
  NO_RESULTS = 'no_results',              // Alert when no results found
  PERFORMANCE = 'performance',            // Search performance issues
  ERROR_RATE = 'error_rate'               // Search error rate
}

interface AlertSchedule {
  frequency: AlertFrequency;
  interval: number;
  timezone: string;
  quietHours?: {
    start: string;
    end: string;
    days: number[];
  };
  maxNotificationsPerDay?: number;
}

enum AlertFrequency {
  REAL_TIME = 'realtime',
  EVERY_5_MINUTES = '5min',
  EVERY_15_MINUTES = '15min',
  HOURLY = 'hourly',
  DAILY = 'daily',
  WEEKLY = 'weekly'
}

interface NotificationChannel {
  id: string;
  type: ChannelType;
  name: string;
  config: ChannelConfig;
  isActive: boolean;
  lastUsedAt?: Date;
  errorCount: number;
}

enum ChannelType {
  EMAIL = 'email',
  WEBHOOK = 'webhook',
  SLACK = 'slack',
  TEAMS = 'teams',
  IN_APP = 'in_app',
  SMS = 'sms',
  PUSH = 'push'
}
```

**Alert Processing Engine**
```typescript
class AlertProcessingEngine {
  private alertQueue: Queue<AlertJob>;
  private notificationQueue: Queue<NotificationJob>;

  async processAlerts(): Promise<void> {
    const activeAlerts = await this.getActiveAlerts();
    
    for (const alert of activeAlerts) {
      if (this.shouldEvaluateAlert(alert)) {
        await this.alertQueue.add('evaluate-alert', {
          alertId: alert.id,
          scheduledAt: new Date()
        });
      }
    }
  }

  async evaluateAlert(alertId: string): Promise<AlertEvaluation> {
    const alert = await this.getAlert(alertId);
    if (!alert) {
      throw new Error(`Alert ${alertId} not found`);
    }

    // Execute search query
    const searchResults = await this.searchService.search({
      query: alert.query,
      filters: alert.filters
    });

    // Evaluate conditions
    const conditionResults = await Promise.all(
      alert.conditions.map(condition => 
        this.evaluateCondition(condition, searchResults, alert)
      )
    );

    // Determine if alert should trigger
    const shouldTrigger = this.shouldTriggerAlert(conditionResults, alert);

    if (shouldTrigger) {
      await this.triggerAlert(alert, conditionResults, searchResults);
    }

    return {
      alertId,
      evaluatedAt: new Date(),
      conditionResults,
      triggered: shouldTrigger,
      resultsCount: searchResults.total_count
    };
  }

  private async evaluateCondition(
    condition: AlertCondition,
    results: SearchResults,
    alert: SearchAlert
  ): Promise<ConditionResult> {
    const baseTime = Date.now();
    
    switch (condition.type) {
      case AlertConditionType.RESULT_COUNT:
        return {
          conditionId: condition.id,
          satisfied: this.compareValues(
            results.total_count,
            condition.operator,
            condition.value
          ),
          actualValue: results.total_count,
          expectedValue: condition.value
        };

      case AlertConditionType.NEW_RESULTS:
        const lastExecution = await this.getLastAlertExecution(alert.id);
        const newResults = await this.findNewResults(
          results,
          lastExecution?.evaluatedAt
        );
        
        return {
          conditionId: condition.id,
          satisfied: newResults.length >= (condition.threshold || 1),
          actualValue: newResults.length,
          expectedValue: condition.threshold || 1,
          metadata: { newResults }
        };

      case AlertConditionType.QUALITY_CHANGE:
        const previousQuality = await this.getPreviousAverageQuality(
          alert.query,
          alert.filters
        );
        const currentQuality = this.calculateAverageQuality(results.results);
        const qualityChange = currentQuality - previousQuality;
        
        return {
          conditionId: condition.id,
          satisfied: this.compareValues(
            qualityChange,
            condition.operator,
            condition.value
          ),
          actualValue: qualityChange,
          expectedValue: condition.value,
          metadata: { previousQuality, currentQuality }
        };

      case AlertConditionType.NO_RESULTS:
        return {
          conditionId: condition.id,
          satisfied: results.total_count === 0,
          actualValue: results.total_count,
          expectedValue: 0
        };

      default:
        throw new Error(`Unknown condition type: ${condition.type}`);
    }
  }

  private async triggerAlert(
    alert: SearchAlert,
    conditionResults: ConditionResult[],
    searchResults: SearchResults
  ): Promise<void> {
    // Update alert statistics
    await this.updateAlertStats(alert.id);

    // Generate notification content
    const notification = await this.generateNotificationContent(
      alert,
      conditionResults,
      searchResults
    );

    // Send notifications through configured channels
    for (const channelId of alert.channels) {
      await this.notificationQueue.add('send-notification', {
        alertId: alert.id,
        channelId,
        notification,
        priority: this.calculateNotificationPriority(alert, conditionResults)
      });
    }

    // Record alert execution
    await this.recordAlertExecution(alert.id, conditionResults, searchResults);
  }

  private async generateNotificationContent(
    alert: SearchAlert,
    conditionResults: ConditionResult[],
    searchResults: SearchResults
  ): Promise<AlertNotification> {
    const triggeredConditions = conditionResults.filter(r => r.satisfied);
    
    return {
      subject: `Alert: ${alert.name}`,
      title: alert.name,
      message: await this.generateAlertMessage(alert, triggeredConditions),
      data: {
        alertId: alert.id,
        triggeredConditions,
        resultsCount: searchResults.total_count,
        topResults: searchResults.results.slice(0, 5),
        searchUrl: this.generateSearchUrl(alert.query, alert.filters)
      },
      priority: this.calculateNotificationPriority(alert, conditionResults),
      actions: [
        {
          label: 'View Results',
          url: this.generateSearchUrl(alert.query, alert.filters)
        },
        {
          label: 'Modify Alert',
          url: `/alerts/${alert.id}/edit`
        },
        {
          label: 'Pause Alert',
          action: 'pause_alert',
          data: { alertId: alert.id }
        }
      ]
    };
  }
}
```

**React Components for Alert Management**
```typescript
interface AlertDashboardProps {
  userId: string;
}

export const AlertDashboard: React.FC<AlertDashboardProps> = ({ userId }) => {
  const [alerts, setAlerts] = useState<SearchAlert[]>([]);
  const [alertHistory, setAlertHistory] = useState<AlertExecution[]>([]);
  const [selectedAlert, setSelectedAlert] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'list' | 'stats' | 'history'>('list');

  return (
    <div className="alert-dashboard">
      <div className="dashboard-header">
        <div className="header-title">
          <h2>Search Alerts</h2>
          <div className="alert-summary">
            <span className="active-alerts">
              {alerts.filter(a => a.isActive).length} active
            </span>
            <span className="triggered-today">
              {getTodayTriggerCount()} triggered today
            </span>
          </div>
        </div>

        <div className="header-actions">
          <div className="view-tabs">
            <button
              className={viewMode === 'list' ? 'active' : ''}
              onClick={() => setViewMode('list')}
            >
              <Icon name="list" />
              Alerts
            </button>
            <button
              className={viewMode === 'stats' ? 'active' : ''}
              onClick={() => setViewMode('stats')}
            >
              <Icon name="chart" />
              Statistics
            </button>
            <button
              className={viewMode === 'history' ? 'active' : ''}
              onClick={() => setViewMode('history')}
            >
              <Icon name="clock" />
              History
            </button>
          </div>

          <button
            className="create-alert-btn"
            onClick={() => openCreateAlertModal()}
          >
            <Icon name="plus" />
            Create Alert
          </button>
        </div>
      </div>

      <div className="dashboard-content">
        {viewMode === 'list' && (
          <div className="alerts-list">
            <div className="list-controls">
              <div className="bulk-actions">
                <button onClick={() => pauseSelectedAlerts()}>
                  <Icon name="pause" />
                  Pause Selected
                </button>
                <button onClick={() => resumeSelectedAlerts()}>
                  <Icon name="play" />
                  Resume Selected
                </button>
                <button onClick={() => deleteSelectedAlerts()}>
                  <Icon name="trash" />
                  Delete Selected
                </button>
              </div>

              <div className="filter-controls">
                <select onChange={(e) => setStatusFilter(e.target.value)}>
                  <option value="">All Status</option>
                  <option value="active">Active</option>
                  <option value="paused">Paused</option>
                  <option value="error">Error</option>
                </select>
              </div>
            </div>

            <div className="alerts-grid">
              {alerts.map(alert => (
                <AlertCard
                  key={alert.id}
                  alert={alert}
                  onEdit={() => editAlert(alert)}
                  onPause={() => pauseAlert(alert.id)}
                  onResume={() => resumeAlert(alert.id)}
                  onDelete={() => deleteAlert(alert.id)}
                  onTest={() => testAlert(alert.id)}
                  selected={selectedAlert === alert.id}
                  onSelect={() => setSelectedAlert(alert.id)}
                />
              ))}
            </div>
          </div>
        )}

        {viewMode === 'stats' && (
          <AlertStatistics
            alerts={alerts}
            timeRange="30d"
            onDrillDown={(alertId) => setSelectedAlert(alertId)}
          />
        )}

        {viewMode === 'history' && (
          <AlertHistory
            history={alertHistory}
            selectedAlert={selectedAlert}
            onAlertSelect={setSelectedAlert}
          />
        )}
      </div>
    </div>
  );
};

interface AlertCardProps {
  alert: SearchAlert;
  onEdit: () => void;
  onPause: () => void;
  onResume: () => void;
  onDelete: () => void;
  onTest: () => void;
  selected: boolean;
  onSelect: () => void;
}

const AlertCard: React.FC<AlertCardProps> = ({
  alert,
  onEdit,
  onPause,
  onResume,
  onDelete,
  onTest,
  selected,
  onSelect
}) => {
  return (
    <div className={`alert-card ${alert.isActive ? 'active' : 'paused'} ${selected ? 'selected' : ''}`}>
      <div className="alert-card-header">
        <div className="alert-title">
          <input
            type="checkbox"
            checked={selected}
            onChange={() => onSelect()}
          />
          <h3>{alert.name}</h3>
          <div className={`status-indicator ${alert.isActive ? 'active' : 'paused'}`}>
            {alert.isActive ? 'Active' : 'Paused'}
          </div>
        </div>

        <div className="alert-actions">
          <button onClick={onTest} title="Test Alert">
            <Icon name="test-tube" />
          </button>
          <button onClick={onEdit} title="Edit Alert">
            <Icon name="edit" />
          </button>
          {alert.isActive ? (
            <button onClick={onPause} title="Pause Alert">
              <Icon name="pause" />
            </button>
          ) : (
            <button onClick={onResume} title="Resume Alert">
              <Icon name="play" />
            </button>
          )}
          <button onClick={onDelete} title="Delete Alert" className="danger">
            <Icon name="trash" />
          </button>
        </div>
      </div>

      <div className="alert-card-content">
        <div className="alert-query">
          <strong>Query:</strong> {alert.query.toString()}
        </div>

        <div className="alert-conditions">
          <strong>Conditions:</strong>
          {alert.conditions.map(condition => (
            <div key={condition.id} className="condition">
              {condition.description}
            </div>
          ))}
        </div>

        <div className="alert-schedule">
          <strong>Schedule:</strong> {formatSchedule(alert.schedule)}
        </div>

        <div className="alert-channels">
          <strong>Notifications:</strong>
          <div className="channel-list">
            {alert.channels.map(channelId => {
              const channel = getChannel(channelId);
              return channel ? (
                <div key={channelId} className="channel-badge">
                  <Icon name={getChannelIcon(channel.type)} />
                  {channel.name}
                </div>
              ) : null;
            })}
          </div>
        </div>
      </div>

      <div className="alert-card-footer">
        <div className="alert-stats">
          <div className="stat">
            <span className="stat-label">Triggered:</span>
            <span className="stat-value">{alert.triggerCount} times</span>
          </div>
          {alert.lastTriggeredAt && (
            <div className="stat">
              <span className="stat-label">Last:</span>
              <span className="stat-value">{formatRelativeDate(alert.lastTriggeredAt)}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
```

**Key Features**
- **Real-time Alerts**: Immediate notification of search result changes
- **Scheduled Reports**: Regular digest emails and summaries
- **Threshold Monitoring**: Custom conditions for triggering alerts
- **Multi-channel**: Email, webhook, Slack, Teams, SMS delivery
- **Alert Management**: Dashboard for configuration and monitoring
- **Performance**: Optimized for high-volume alert processing

**Acceptance Criteria**
1. ✅ Real-time alert processing with <1 minute latency
2. ✅ Multiple alert conditions (count, quality, new results)
3. ✅ Multi-channel notification delivery
4. ✅ Alert management dashboard with statistics
5. ✅ Scheduled report generation and delivery
6. ✅ Alert history and performance tracking
7. ✅ Bulk alert operations and management

---

### 3.4 Search Personalization

#### 3.4.1 User Behavior Learning

**Agent**: nodejs-backend-engineer  
**Estimated Time**: 2 weeks  
**Priority**: High

**Description**  
Implement comprehensive user behavior tracking and machine learning system to understand search patterns, preferences, and optimize search ranking based on individual user behavior.

**Technical Requirements**
- Privacy-compliant user behavior tracking
- Click-through rate and dwell time analysis  
- Search refinement pattern recognition
- Result relevance feedback learning
- Personalized ranking model training
- A/B testing framework for search improvements

**User Behavior Tracking Service**
```typescript
interface BehaviorTrackingService {
  // Event tracking
  trackSearchEvent(event: SearchEvent): Promise<void>;
  trackClickEvent(event: ClickEvent): Promise<void>;
  trackDwellTime(event: DwellTimeEvent): Promise<void>;
  trackRefinementEvent(event: RefinementEvent): Promise<void>;
  
  // Behavior analysis
  analyzeUserBehavior(userId: string, timeRange?: DateRange): Promise<BehaviorAnalysis>;
  generateUserProfile(userId: string): Promise<UserSearchProfile>;
  identifySearchPatterns(userId: string): Promise<SearchPattern[]>;
  detectAnomalies(userId: string): Promise<BehaviorAnomaly[]>;
  
  // Learning and optimization
  updatePersonalizationModel(userId: string): Promise<PersonalizationModel>;
  calculateRelevanceFeedback(userId: string, resultId: string): Promise<RelevanceScore>;
  trainGlobalModel(): Promise<ModelTrainingResult>;
  
  // Privacy and consent
  getUserConsent(userId: string): Promise<ConsentStatus>;
  anonymizeUserData(userId: string): Promise<void>;
  exportUserData(userId: string): Promise<UserDataExport>;
  deleteUserData(userId: string): Promise<void>;
}

interface SearchEvent {
  userId: string;
  sessionId: string;
  query: string;
  filters: SearchFilters;
  timestamp: Date;
  resultsCount: number;
  processingTime: number;
  searchSource: SearchSource;
  deviceInfo: DeviceInfo;
  context: SearchContext;
}

interface ClickEvent {
  userId: string;
  sessionId: string;
  searchId: string;
  resultId: string;
  resultPosition: number;
  resultScore: number;
  clickType: ClickType;
  timestamp: Date;
  metadata: ClickMetadata;
}

enum ClickType {
  RESULT_CLICK = 'result_click',
  RESULT_PREVIEW = 'result_preview',
  FACET_CLICK = 'facet_click',
  SUGGESTION_CLICK = 'suggestion_click',
  PAGINATION_CLICK = 'pagination_click',
  SHARE_CLICK = 'share_click'
}

interface DwellTimeEvent {
  userId: string;
  sessionId: string;
  resultId: string;
  dwellTime: number; // milliseconds
  interactions: InteractionEvent[];
  exitType: ExitType;
  timestamp: Date;
}

enum ExitType {
  BACK_TO_RESULTS = 'back_to_results',
  NEW_SEARCH = 'new_search',
  NAVIGATION = 'navigation',
  CLOSE_TAB = 'close_tab',
  TIMEOUT = 'timeout'
}

interface UserSearchProfile {
  userId: string;
  searchFrequency: SearchFrequency;
  preferredContentTypes: ContentTypePreference[];
  averageQueryLength: number;
  commonSearchTerms: TermFrequency[];
  searchTimePatterns: TimePattern[];
  devicePreferences: DevicePreference[];
  topicInterests: TopicInterest[];
  qualityPreference: number;
  personalizedRanking: RankingPreferences;
  lastUpdated: Date;
}

interface SearchPattern {
  patternId: string;
  type: PatternType;
  description: string;
  frequency: number;
  confidence: number;
  examples: string[];
  metadata: PatternMetadata;
}

enum PatternType {
  QUERY_REFINEMENT = 'query_refinement',
  TOPIC_EXPLORATION = 'topic_exploration',
  FACT_CHECKING = 'fact_checking',
  RESEARCH_SESSION = 'research_session',
  QUICK_LOOKUP = 'quick_lookup',
  COMPARISON_SEARCH = 'comparison_search'
}
```

**Machine Learning Pipeline**
```typescript
class PersonalizationMLPipeline {
  private behaviorAnalyzer: BehaviorAnalyzer;
  private featureExtractor: FeatureExtractor;
  private modelTrainer: ModelTrainer;
  private predictionService: PredictionService;

  async trainPersonalizationModel(userId: string): Promise<PersonalizationModel> {
    // Step 1: Extract user behavior data
    const behaviorData = await this.behaviorAnalyzer.getUserBehavior(userId, {
      timeRange: { days: 90 },
      includeImplicitFeedback: true,
      includeExplicitFeedback: true
    });

    // Step 2: Generate features
    const features = await this.featureExtractor.extractUserFeatures(behaviorData);

    // Step 3: Train or update model
    const model = await this.modelTrainer.trainUserModel(userId, features);

    // Step 4: Validate model performance
    const validation = await this.validateModel(model, behaviorData);

    if (validation.accuracy < 0.7) {
      // Fall back to global model
      return this.getGlobalModel();
    }

    return model;
  }

  async generatePersonalizedRanking(
    userId: string,
    searchResults: SearchResult[]
  ): Promise<PersonalizedRanking> {
    const userModel = await this.getUserModel(userId);
    const userProfile = await this.getUserProfile(userId);

    const rankedResults = await Promise.all(
      searchResults.map(async (result) => {
        const personalizedScore = await this.calculatePersonalizedScore(
          result,
          userModel,
          userProfile
        );

        return {
          ...result,
          originalScore: result.score.relevance,
          personalizedScore,
          rankingFactors: await this.explainRanking(result, userModel, userProfile)
        };
      })
    );

    // Sort by personalized score
    rankedResults.sort((a, b) => b.personalizedScore - a.personalizedScore);

    return {
      results: rankedResults,
      personalizationStrength: this.calculatePersonalizationStrength(userModel),
      explanations: await this.generateRankingExplanations(rankedResults, userProfile)
    };
  }

  private async calculatePersonalizedScore(
    result: SearchResult,
    model: PersonalizationModel,
    profile: UserSearchProfile
  ): Promise<number> {
    const baseScore = result.score.relevance;
    
    // Content type preference adjustment
    const contentTypeBoost = this.getContentTypeBoost(result.type, profile);
    
    // Quality preference adjustment
    const qualityBoost = this.getQualityBoost(result, profile);
    
    // Recency preference
    const recencyBoost = this.getRecencyBoost(result, profile);
    
    // Historical interaction boost
    const interactionBoost = await this.getInteractionBoost(result, profile.userId);
    
    // Topic interest boost
    const topicBoost = this.getTopicBoost(result, profile);

    // Combine factors using model weights
    const personalizedScore = model.combineFactors({
      baseScore,
      contentTypeBoost,
      qualityBoost,
      recencyBoost,
      interactionBoost,
      topicBoost
    });

    return Math.max(0, Math.min(1, personalizedScore));
  }

  private async explainRanking(
    result: SearchResult,
    model: PersonalizationModel,
    profile: UserSearchProfile
  ): Promise<RankingExplanation[]> {
    const explanations: RankingExplanation[] = [];

    // Analyze each ranking factor
    const factors = await this.analyzeRankingFactors(result, model, profile);

    for (const factor of factors) {
      if (Math.abs(factor.impact) > 0.1) { // Only explain significant factors
        explanations.push({
          factor: factor.name,
          impact: factor.impact,
          reason: factor.explanation,
          confidence: factor.confidence
        });
      }
    }

    return explanations.sort((a, b) => Math.abs(b.impact) - Math.abs(a.impact));
  }
}
```

**Database Schema for Behavior Tracking**
```sql
CREATE TABLE user_search_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  session_id VARCHAR(100) NOT NULL,
  query TEXT NOT NULL,
  query_hash VARCHAR(64) NOT NULL, -- For privacy-safe aggregation
  filters_data JSONB DEFAULT '{}',
  results_count INTEGER,
  processing_time_ms INTEGER,
  search_source VARCHAR(50),
  device_info JSONB DEFAULT '{}',
  context_data JSONB DEFAULT '{}',
  timestamp TIMESTAMP DEFAULT NOW()
);

CREATE TABLE user_click_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  session_id VARCHAR(100) NOT NULL,
  search_event_id UUID REFERENCES user_search_events(id) ON DELETE CASCADE,
  result_id VARCHAR(255) NOT NULL,
  result_position INTEGER NOT NULL,
  result_score DECIMAL(5,4),
  click_type VARCHAR(50) NOT NULL,
  timestamp TIMESTAMP DEFAULT NOW(),
  metadata JSONB DEFAULT '{}'
);

CREATE TABLE user_dwell_time_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  session_id VARCHAR(100) NOT NULL,
  click_event_id UUID REFERENCES user_click_events(id) ON DELETE CASCADE,
  result_id VARCHAR(255) NOT NULL,
  dwell_time_ms INTEGER NOT NULL,
  interactions JSONB DEFAULT '[]',
  exit_type VARCHAR(50),
  timestamp TIMESTAMP DEFAULT NOW()
);

CREATE TABLE user_search_profiles (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  search_frequency DECIMAL(8,2), -- searches per day
  preferred_content_types JSONB DEFAULT '[]',
  average_query_length DECIMAL(5,2),
  common_search_terms JSONB DEFAULT '[]',
  search_time_patterns JSONB DEFAULT '[]',
  device_preferences JSONB DEFAULT '[]',
  topic_interests JSONB DEFAULT '[]',
  quality_preference DECIMAL(3,2) DEFAULT 0.5,
  personalized_ranking JSONB DEFAULT '{}',
  last_updated TIMESTAMP DEFAULT NOW(),
  model_version VARCHAR(20)
);

CREATE TABLE personalization_models (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  model_type VARCHAR(50) NOT NULL, -- user, segment, global
  model_data JSONB NOT NULL,
  training_data_size INTEGER,
  accuracy_score DECIMAL(5,4),
  created_at TIMESTAMP DEFAULT NOW(),
  last_trained_at TIMESTAMP DEFAULT NOW(),
  version VARCHAR(20) NOT NULL,
  is_active BOOLEAN DEFAULT TRUE
);

-- Privacy and performance indexes
CREATE INDEX idx_search_events_user_time ON user_search_events(user_id, timestamp);
CREATE INDEX idx_click_events_user_time ON user_click_events(user_id, timestamp);
CREATE INDEX idx_dwell_events_result ON user_dwell_time_events(result_id, dwell_time_ms);

-- Partitioning for performance (by month)
CREATE TABLE user_search_events_y2024m01 PARTITION OF user_search_events
  FOR VALUES FROM ('2024-01-01') TO ('2024-02-01');
-- Additional partitions...
```

**Privacy-Compliant Implementation**
```typescript
class PrivacyCompliantTracker {
  private encryptionKey: string;
  private retentionDays: number = 90;

  async trackBehaviorEvent(event: BehaviorEvent): Promise<void> {
    // Check user consent
    const consent = await this.getUserConsent(event.userId);
    if (!consent.analytics) {
      return; // Don't track if user hasn't consented
    }

    // Anonymize sensitive data
    const anonymizedEvent = await this.anonymizeEvent(event);

    // Store with automatic expiration
    await this.storeEvent(anonymizedEvent, this.retentionDays);
  }

  private async anonymizeEvent(event: BehaviorEvent): Promise<AnonymizedEvent> {
    return {
      ...event,
      userId: await this.hashUserId(event.userId), // Consistent but anonymous
      query: this.sanitizeQuery(event.query),
      ipAddress: undefined, // Remove IP
      userAgent: this.generalizeUserAgent(event.deviceInfo?.userAgent),
      timestamp: this.roundTimestamp(event.timestamp, 5) // 5-minute precision
    };
  }

  private sanitizeQuery(query: string): string {
    // Remove potential PII from search queries
    return query
      .replace(/\b[\w._%+-]+@[\w.-]+\.[A-Z]{2,}\b/gi, '[EMAIL]') // Email addresses
      .replace(/\b\d{3}-?\d{2}-?\d{4}\b/g, '[SSN]') // SSN patterns
      .replace(/\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b/g, '[CARD]') // Credit card
      .replace(/\b\d{10,}\b/g, '[NUMBER]'); // Long numbers
  }

  async exportUserData(userId: string): Promise<UserDataExport> {
    // GDPR compliance - export all user data
    const searchEvents = await this.getUserSearchEvents(userId);
    const clickEvents = await this.getUserClickEvents(userId);
    const profile = await this.getUserProfile(userId);
    const models = await this.getUserModels(userId);

    return {
      userId,
      exportDate: new Date(),
      searchEvents: searchEvents.map(e => this.sanitizeForExport(e)),
      clickEvents: clickEvents.map(e => this.sanitizeForExport(e)),
      profile,
      models: models.map(m => ({ ...m, modelData: '[REDACTED]' })),
      retentionPolicy: `Data retained for ${this.retentionDays} days`
    };
  }

  async deleteUserData(userId: string): Promise<void> {
    // GDPR right to be forgotten
    await this.db.transaction(async (trx) => {
      await trx('user_search_events').where('user_id', userId).del();
      await trx('user_click_events').where('user_id', userId).del();
      await trx('user_dwell_time_events').where('user_id', userId).del();
      await trx('user_search_profiles').where('user_id', userId).del();
      await trx('personalization_models').where('user_id', userId).del();
    });
  }
}
```

**Key Features**
- **Behavior Tracking**: Comprehensive user interaction tracking
- **Privacy Compliance**: GDPR-compliant with anonymization
- **Pattern Recognition**: ML-powered behavior pattern detection
- **Personalization**: Individual ranking model training
- **A/B Testing**: Framework for testing personalization effectiveness
- **Real-time**: Live behavior tracking and model updates

**Acceptance Criteria**
1. ✅ Privacy-compliant behavior tracking with consent
2. ✅ Click-through and dwell time analysis
3. ✅ Search pattern recognition with ML
4. ✅ Personalized ranking model training
5. ✅ A/B testing framework for optimization
6. ✅ User data export and deletion (GDPR)
7. ✅ Real-time model updates and application

---

#### 3.4.2 Personalized Search Experience

**Agent**: fullstack-feature-developer  
**Estimated Time**: 2 weeks  
**Priority**: High

**Description**  
Create personalized search interface that adapts to user preferences with customized suggestions, result layouts, content type preferences, search shortcuts, and theme customization.

**Technical Requirements**
- Personalized search suggestions based on history
- Customizable result layouts and display preferences
- Content type prioritization and filtering preferences
- Personal search shortcuts and saved queries
- Theme and interface customization options
- Cross-device preference synchronization

**Personalized Search Service**
```typescript
interface PersonalizedSearchService {
  // Personalization
  getPersonalizedSuggestions(userId: string, query: string): Promise<PersonalizedSuggestion[]>;
  getPersonalizedResults(userId: string, results: SearchResult[]): Promise<PersonalizedResults>;
  getUserPreferences(userId: string): Promise<UserPreferences>;
  updateUserPreferences(userId: string, preferences: Partial<UserPreferences>): Promise<UserPreferences>;
  
  // Shortcuts and saved queries
  createSearchShortcut(userId: string, shortcut: SearchShortcut): Promise<SearchShortcut>;
  getUserShortcuts(userId: string): Promise<SearchShortcut[]>;
  executeShortcut(userId: string, shortcutId: string): Promise<SearchResult[]>;
  
  // Content recommendations
  getRecommendedContent(userId: string): Promise<ContentRecommendation[]>;
  getTopicSuggestions(userId: string): Promise<TopicSuggestion[]>;
  getTrendingForUser(userId: string): Promise<TrendingItem[]>;
  
  // Cross-device sync
  syncPreferences(userId: string, deviceId: string): Promise<void>;
  getDevicePreferences(userId: string, deviceId: string): Promise<DevicePreferences>;
}

interface UserPreferences {
  userId: string;
  searchPreferences: SearchPreferences;
  displayPreferences: DisplayPreferences;
  contentPreferences: ContentPreferences;
  notificationPreferences: NotificationPreferences;
  privacyPreferences: PrivacyPreferences;
  lastUpdated: Date;
  devicePreferences: Record<string, DevicePreferences>;
}

interface SearchPreferences {
  defaultSort: SortOption;
  resultsPerPage: number;
  autoComplete: boolean;
  searchSuggestions: boolean;
  recentSearches: boolean;
  savedSearches: boolean;
  instantSearch: boolean;
  searchHistory: boolean;
  voiceSearch: boolean;
  shortcuts: SearchShortcut[];
}

interface DisplayPreferences {
  theme: 'light' | 'dark' | 'auto';
  layout: 'compact' | 'comfortable' | 'spacious';
  resultView: 'list' | 'grid' | 'cards';
  showPreviews: boolean;
  showThumbnails: boolean;
  highlightMatches: boolean;
  showMetadata: boolean;
  showSimilar: boolean;
  animationsEnabled: boolean;
  accessibilityMode: boolean;
}

interface ContentPreferences {
  preferredTypes: ContentTypeWeight[];
  qualityThreshold: number;
  languagePreferences: string[];
  sourcePreferences: SourcePreference[];
  topicInterests: TopicInterest[];
  excludedSources: string[];
  contentFilters: ContentFilter[];
}

interface SearchShortcut {
  id: string;
  name: string;
  description?: string;
  query: string;
  filters: SearchFilters;
  icon: string;
  color: string;
  keyboardShortcut?: string;
  isPublic: boolean;
  usageCount: number;
  lastUsed?: Date;
  createdAt: Date;
}
```

**Personalized Search Components**
```typescript
interface PersonalizedSearchPageProps {
  userId: string;
  initialQuery?: string;
}

export const PersonalizedSearchPage: React.FC<PersonalizedSearchPageProps> = ({
  userId,
  initialQuery
}) => {
  const [userPreferences, setUserPreferences] = useState<UserPreferences | null>(null);
  const [personalizedSuggestions, setPersonalizedSuggestions] = useState<PersonalizedSuggestion[]>([]);
  const [searchShortcuts, setSearchShortcuts] = useState<SearchShortcut[]>([]);
  const [recommendedContent, setRecommendedContent] = useState<ContentRecommendation[]>([]);

  const {
    query,
    setQuery,
    results,
    isLoading,
    error,
    performSearch
  } = usePersonalizedSearch({
    userId,
    initialQuery,
    preferences: userPreferences
  });

  useEffect(() => {
    loadUserPreferences();
    loadSearchShortcuts();
    loadRecommendations();
  }, [userId]);

  const loadUserPreferences = async () => {
    const preferences = await personalizedSearchService.getUserPreferences(userId);
    setUserPreferences(preferences);
  };

  return (
    <div className={`personalized-search-page ${userPreferences?.displayPreferences.theme || 'light'}`}>
      {/* Personal Search Header */}
      <div className="search-header personalized">
        <PersonalizedSearchInput
          value={query}
          onChange={setQuery}
          onSubmit={performSearch}
          suggestions={personalizedSuggestions}
          shortcuts={searchShortcuts}
          preferences={userPreferences?.searchPreferences}
          userId={userId}
        />

        <SearchPersonalizationIndicator
          userId={userId}
          strength={getPersonalizationStrength()}
          onToggle={togglePersonalization}
        />
      </div>

      {/* Quick Actions & Shortcuts */}
      <div className="quick-actions">
        <SearchShortcuts
          shortcuts={searchShortcuts}
          onShortcutClick={executeShortcut}
          onShortcutEdit={editShortcut}
          onCreateShortcut={createShortcut}
        />

        <RecommendedTopics
          recommendations={recommendedContent}
          onTopicClick={searchTopic}
          onDismiss={dismissRecommendation}
        />
      </div>

      <div className="search-body">
        {/* Personalized Sidebar */}
        <aside className="personalized-sidebar">
          <PersonalizedFilters
            preferences={userPreferences?.contentPreferences}
            onPreferencesChange={updateContentPreferences}
            userId={userId}
          />

          <RecentSearchHistory
            userId={userId}
            onSearchSelect={performSearch}
            preferences={userPreferences?.searchPreferences}
          />

          <TrendingForYou
            trending={getTrendingForUser()}
            onItemClick={searchTrendingItem}
          />
        </aside>

        {/* Personalized Results */}
        <main className="search-results personalized">
          {isLoading ? (
            <PersonalizedSearchLoading
              preferences={userPreferences?.displayPreferences}
            />
          ) : error ? (
            <PersonalizedSearchError
              error={error}
              onRetry={performSearch}
              preferences={userPreferences?.displayPreferences}
            />
          ) : results.length === 0 ? (
            <PersonalizedSearchEmpty
              query={query}
              recommendations={recommendedContent}
              onRecommendationClick={searchRecommendation}
              preferences={userPreferences?.displayPreferences}
            />
          ) : (
            <PersonalizedResultsList
              results={results}
              query={query}
              preferences={userPreferences}
              onResultClick={handleResultClick}
              onResultSave={saveResult}
              onResultShare={shareResult}
              userId={userId}
            />
          )}
        </main>
      </div>

      {/* Floating Actions */}
      <PersonalizationFloatingActions
        onOpenSettings={() => setSettingsOpen(true)}
        onCreateShortcut={() => setShortcutModalOpen(true)}
        onExportPreferences={exportPreferences}
      />

      {/* Settings Modal */}
      <PersonalizationSettingsModal
        isOpen={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        preferences={userPreferences}
        onSave={savePreferences}
        userId={userId}
      />
    </div>
  );
};

interface PersonalizedSearchInputProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: (query: string) => void;
  suggestions: PersonalizedSuggestion[];
  shortcuts: SearchShortcut[];
  preferences?: SearchPreferences;
  userId: string;
}

export const PersonalizedSearchInput: React.FC<PersonalizedSearchInputProps> = ({
  value,
  onChange,
  onSubmit,
  suggestions,
  shortcuts,
  preferences,
  userId
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);

  return (
    <div className="personalized-search-input">
      <div className="input-container">
        <div className="input-wrapper">
          <Icon name="search" className="search-icon" />
          <input
            type="text"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={handleKeyDown}
            onFocus={() => setIsExpanded(true)}
            placeholder={getPersonalizedPlaceholder(userId)}
            className="search-input"
          />
          
          {/* Voice Search (if enabled in preferences) */}
          {preferences?.voiceSearch && (
            <button
              className="voice-search-btn"
              onClick={startVoiceSearch}
              title="Voice Search"
            >
              <Icon name="microphone" />
            </button>
          )}

          {/* Shortcuts Toggle */}
          <button
            className="shortcuts-toggle"
            onClick={() => setShowShortcuts(!showShortcuts)}
            title="Search Shortcuts (⌘K)"
          >
            <Icon name="command" />
          </button>
        </div>

        {/* Suggestions Dropdown */}
        {isExpanded && (
          <div className="suggestions-dropdown">
            {/* Personalized Suggestions */}
            {suggestions.length > 0 && (
              <div className="suggestion-group">
                <div className="suggestion-header">
                  <Icon name="user" />
                  <span>For You</span>
                </div>
                {suggestions.map(suggestion => (
                  <div
                    key={suggestion.id}
                    className="suggestion-item personalized"
                    onClick={() => selectSuggestion(suggestion.query)}
                  >
                    <Icon name={getSuggestionIcon(suggestion.type)} />
                    <span className="suggestion-text">{suggestion.query}</span>
                    <div className="suggestion-meta">
                      <span className="confidence">{Math.round(suggestion.confidence * 100)}%</span>
                      {suggestion.based_on && (
                        <span className="based-on">Based on {suggestion.based_on}</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Recent Searches */}
            {preferences?.recentSearches && recentSearches.length > 0 && (
              <div className="suggestion-group">
                <div className="suggestion-header">
                  <Icon name="clock" />
                  <span>Recent</span>
                </div>
                {recentSearches.slice(0, 5).map((recent, index) => (
                  <div
                    key={index}
                    className="suggestion-item recent"
                    onClick={() => selectSuggestion(recent)}
                  >
                    <Icon name="history" />
                    <span className="suggestion-text">{recent}</span>
                    <button
                      className="remove-recent"
                      onClick={(e) => {
                        e.stopPropagation();
                        removeFromRecent(recent);
                      }}
                    >
                      <Icon name="x" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Search Shortcuts */}
            {showShortcuts && shortcuts.length > 0 && (
              <div className="suggestion-group">
                <div className="suggestion-header">
                  <Icon name="zap" />
                  <span>Shortcuts</span>
                </div>
                {shortcuts.slice(0, 8).map(shortcut => (
                  <div
                    key={shortcut.id}
                    className="suggestion-item shortcut"
                    onClick={() => executeShortcut(shortcut)}
                  >
                    <Icon name={shortcut.icon} color={shortcut.color} />
                    <span className="shortcut-name">{shortcut.name}</span>
                    {shortcut.keyboardShortcut && (
                      <kbd className="shortcut-key">{shortcut.keyboardShortcut}</kbd>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Search Context Bar */}
      <div className="search-context-bar">
        <div className="active-filters">
          {getActivePersonalizedFilters().map(filter => (
            <div key={filter.id} className="filter-chip personalized">
              <Icon name={filter.icon} />
              <span>{filter.label}</span>
              <button onClick={() => removeFilter(filter.id)}>×</button>
            </div>
          ))}
        </div>

        <div className="search-modes">
          <button
            className={`mode-btn ${getSearchMode() === 'personal' ? 'active' : ''}`}
            onClick={() => setSearchMode('personal')}
            title="Personalized Results"
          >
            <Icon name="user" />
            Personal
          </button>
          <button
            className={`mode-btn ${getSearchMode() === 'global' ? 'active' : ''}`}
            onClick={() => setSearchMode('global')}
            title="Global Results"
          >
            <Icon name="globe" />
            Global
          </button>
        </div>
      </div>
    </div>
  );
};
```

**Personalization Settings Interface**
```typescript
interface PersonalizationSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  preferences: UserPreferences | null;
  onSave: (preferences: UserPreferences) => void;
  userId: string;
}

export const PersonalizationSettingsModal: React.FC<PersonalizationSettingsModalProps> = ({
  isOpen,
  onClose,
  preferences,
  onSave,
  userId
}) => {
  const [activeTab, setActiveTab] = useState<'search' | 'display' | 'content' | 'privacy'>('search');
  const [tempPreferences, setTempPreferences] = useState<UserPreferences | null>(preferences);

  if (!isOpen || !tempPreferences) return null;

  return (
    <div className="personalization-settings-modal">
      <div className="modal-content">
        <div className="modal-header">
          <h2>Personalization Settings</h2>
          <button onClick={onClose} className="close-btn">
            <Icon name="x" />
          </button>
        </div>

        <div className="settings-tabs">
          <button
            className={activeTab === 'search' ? 'active' : ''}
            onClick={() => setActiveTab('search')}
          >
            <Icon name="search" />
            Search
          </button>
          <button
            className={activeTab === 'display' ? 'active' : ''}
            onClick={() => setActiveTab('display')}
          >
            <Icon name="eye" />
            Display
          </button>
          <button
            className={activeTab === 'content' ? 'active' : ''}
            onClick={() => setActiveTab('content')}
          >
            <Icon name="filter" />
            Content
          </button>
          <button
            className={activeTab === 'privacy' ? 'active' : ''}
            onClick={() => setActiveTab('privacy')}
          >
            <Icon name="shield" />
            Privacy
          </button>
        </div>

        <div className="settings-content">
          {activeTab === 'search' && (
            <SearchPreferencesPanel
              preferences={tempPreferences.searchPreferences}
              onChange={(searchPrefs) =>
                setTempPreferences({
                  ...tempPreferences,
                  searchPreferences: searchPrefs
                })
              }
            />
          )}

          {activeTab === 'display' && (
            <DisplayPreferencesPanel
              preferences={tempPreferences.displayPreferences}
              onChange={(displayPrefs) =>
                setTempPreferences({
                  ...tempPreferences,
                  displayPreferences: displayPrefs
                })
              }
            />
          )}

          {activeTab === 'content' && (
            <ContentPreferencesPanel
              preferences={tempPreferences.contentPreferences}
              userId={userId}
              onChange={(contentPrefs) =>
                setTempPreferences({
                  ...tempPreferences,
                  contentPreferences: contentPrefs
                })
              }
            />
          )}

          {activeTab === 'privacy' && (
            <PrivacyPreferencesPanel
              preferences={tempPreferences.privacyPreferences}
              onChange={(privacyPrefs) =>
                setTempPreferences({
                  ...tempPreferences,
                  privacyPreferences: privacyPrefs
                })
              }
            />
          )}
        </div>

        <div className="modal-actions">
          <button onClick={onClose} className="cancel-btn">
            Cancel
          </button>
          <button
            onClick={() => {
              onSave(tempPreferences);
              onClose();
            }}
            className="save-btn"
          >
            Save Changes
          </button>
          <button
            onClick={() => exportPreferences(tempPreferences)}
            className="export-btn"
          >
            Export Settings
          </button>
        </div>
      </div>
    </div>
  );
};
```

**Key Features**
- **Personalized Suggestions**: History and behavior-based search suggestions
- **Custom Layouts**: User-configurable result display and layout preferences
- **Content Prioritization**: Preferred content types and source rankings
- **Search Shortcuts**: Personal shortcuts with keyboard bindings
- **Theme Customization**: Light/dark themes with accessibility options
- **Cross-device Sync**: Preference synchronization across devices

**Acceptance Criteria**
1. ✅ Personalized search suggestions based on user behavior
2. ✅ Customizable result layouts and display preferences
3. ✅ Content type and source preference configuration
4. ✅ Personal search shortcuts with keyboard support
5. ✅ Theme and accessibility customization options
6. ✅ Cross-device preference synchronization
7. ✅ Privacy controls and data export functionality

---

## Success Metrics

### AI Features Performance
- **Query Understanding**: 85%+ intent classification accuracy
- **Summary Quality**: 80%+ user satisfaction with AI summaries
- **Processing Speed**: <200ms for query processing, <2s for summaries
- **Fact Accuracy**: 90%+ factual accuracy in generated summaries

### Advanced Filtering Performance  
- **Facet Discovery**: 95%+ relevant facet identification
- **Filter Builder**: <500ms for complex filter generation
- **Query Optimization**: 30%+ improvement in filter query performance
- **User Adoption**: 60%+ of users utilize advanced filtering

### Saved Searches & Alerts
- **Alert Accuracy**: 95%+ accurate alert triggering
- **Delivery Speed**: <1 minute for real-time alerts
- **User Engagement**: 40%+ of users create saved searches
- **Alert Effectiveness**: 80%+ user satisfaction with alert relevance

### Personalization Impact
- **Relevance Improvement**: 25%+ improvement in personalized results
- **User Engagement**: 35%+ increase in click-through rate
- **Search Efficiency**: 20%+ reduction in search refinements
- **Privacy Compliance**: 100% GDPR compliance with user data

### Overall Experience Metrics
- **User Satisfaction**: 4.5+ out of 5 user rating
- **Feature Adoption**: 70%+ adoption of personalization features
- **Search Success Rate**: 85%+ successful search sessions
- **Performance**: <500ms average search response time

## Implementation Timeline

### Week 1-2: AI-Powered Features
- Natural Language Query Processing (3.1.1)
- AI-Generated Summaries (3.1.2)
- LLM integration and testing

### Week 3-4: Advanced Filtering
- Dynamic Facet Generation (3.2.1)
- Custom Filter Builder (3.2.2)  
- Visual query builder interface

### Week 5-6: Saved Searches
- Saved Search Management (3.3.1)
- Search Alerts & Notifications (3.3.2)
- Alert processing and delivery

### Week 7-8: Personalization
- User Behavior Learning (3.4.1)
- Personalized Search Experience (3.4.2)
- ML model training and interface

## Dependencies

### Technical Dependencies
- **Phase 1 & 2**: Complete unified search and code analysis infrastructure
- **LLM Services**: OpenAI GPT-4, Claude, or custom LLM deployment
- **ML Infrastructure**: Model training and inference capabilities
- **Real-time Processing**: Enhanced message queue for alerts and personalization

### External Dependencies
- **AI Services**: LLM API access for query processing and summaries
- **Notification Services**: Email, Slack, Teams API integrations
- **Analytics**: Enhanced tracking and privacy compliance tools
- **A/B Testing**: Experimentation framework for personalization

### Team Dependencies
- **Backend Engineers**: 2-3 engineers for services and ML pipeline
- **Frontend Engineers**: 2 engineers for personalization interface
- **AI/ML Specialists**: 1 specialist for model training and optimization
- **Privacy Officer**: Compliance review for personalization features

This comprehensive Phase 3 roadmap transforms the search experience into an intelligent, personalized platform that learns from user behavior and provides AI-enhanced results, positioning MCP Tools as a cutting-edge knowledge discovery platform.