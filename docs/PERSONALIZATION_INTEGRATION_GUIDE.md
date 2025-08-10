# Personalization System Integration Guide

## Overview

The Personalized Search Experience system (Work Item 3.4.2) is now fully implemented, providing comprehensive personalization capabilities to enhance user search experiences through intelligent adaptation based on behavior patterns, interests, and preferences.

## System Components

### 1. Database Schema (Migration 026)
- **user_personalization_profiles**: Core user preferences and settings
- **personalized_search_results**: Search result tracking with personalization factors
- **user_interest_profiles**: User interests and topic affinities
- **personalized_recommendations**: Content and query recommendations
- **personalization_experiments**: A/B testing framework

### 2. Core Services (`core/src/services/personalization/`)
- **PersonalizationEngine**: Multi-factor result scoring and ranking
- **RecommendationSystem**: Content-based and collaborative filtering
- **InterestModelingService**: Automatic interest discovery and management
- **AdaptiveInterfaceService**: Dynamic UI customization

### 3. API Routes (`gateway/src/routes/personalization.routes.ts`)
- Profile management endpoints
- Personalized search execution
- Interest management
- Recommendation generation
- Interface adaptation
- Analytics and insights

### 4. React Components (`web/src/components/personalization/`)
- **PersonalizationDashboard**: Main control center
- **AdaptiveSearchInterface**: Personalized search experience
- **InterestProfileManager**: Interest management interface
- **RecommendationPanel**: Content discovery panel

## Integration Steps

### 1. Database Setup

First, run the personalization migration:

```bash
cd migrations
POSTGRES_PASSWORD=password POSTGRES_HOST=localhost POSTGRES_PORT=5432 POSTGRES_DB=mcp_tools POSTGRES_USER=postgres node dist/migrate.js
```

This creates all required tables with proper constraints and indexes.

### 2. Core Services Integration

Initialize the personalization system in your application:

```typescript
import { PersonalizationSystem } from '@mcp-tools/core';
import { getDatabaseConnection } from './database';

// Initialize with default configuration
const db = getDatabaseConnection();
const personalizationSystem = await PersonalizationSystem.initialize(db);

// Or with custom configuration
const customConfig = {
  ...PersonalizationSystem.getDefaultConfig(),
  personalizationEngine: {
    ...PersonalizationSystem.getDefaultConfig().personalizationEngine,
    defaultPersonalizationLevel: 'high',
    maxPersonalizationBoost: 0.7
  }
};
const customSystem = new PersonalizationSystem(db, customConfig);
```

### 3. API Routes Integration

The personalization routes are already implemented. To integrate with your gateway:

```typescript
// In gateway/src/index.ts
import personalizationRoutes from './routes/personalization.routes.js';

app.use('/api/v1/personalization', personalizationRoutes);
```

All routes require authentication and provide comprehensive personalization features.

### 4. Frontend Integration

#### Basic Search Integration

Replace your existing search interface with the adaptive version:

```tsx
import { AdaptiveSearchInterface } from '@/components/personalization';

export default function SearchPage() {
  return (
    <div className="container mx-auto py-8">
      <AdaptiveSearchInterface
        initialQuery=""
        onSearchResults={(results) => {
          console.log('Personalized results:', results);
        }}
        onQueryChange={(query) => {
          // Update URL or state
        }}
      />
    </div>
  );
}
```

#### Personalization Dashboard

Add the dashboard to user settings:

```tsx
import { PersonalizationDashboard } from '@/components/personalization';

export default function PersonalizationPage() {
  return (
    <div className="container mx-auto py-8">
      <PersonalizationDashboard />
    </div>
  );
}
```

### 5. Behavior Tracking Integration

Integrate with the existing behavior tracking system:

```typescript
// Send behavior events to personalization system
const updatePersonalization = async (events: BehaviorEvent[]) => {
  try {
    const response = await fetch('/api/v1/personalization/behavior-update', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ events })
    });
    
    const data = await response.json();
    console.log(`Processed ${events.length} events, discovered ${data.data.newInterests.length} new interests`);
  } catch (error) {
    console.error('Error updating personalization:', error);
  }
};
```

## Usage Examples

### 1. Execute Personalized Search

```typescript
// Backend service
const personalizedResults = await personalizationSystem.personalizedSearch(
  userId,
  'machine learning',
  originalResults,
  { deviceType: 'mobile', location: 'US' }
);

// Frontend API call
const response = await fetch('/api/v1/personalization/search', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    query: 'machine learning',
    originalResults: searchResults,
    context: { deviceType: 'mobile' }
  })
});
```

### 2. Manage User Interests

```typescript
// Add explicit interest
const response = await fetch('/api/v1/personalization/interests', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    interestType: 'topic',
    interestName: 'React Development',
    interestDescription: 'Modern React patterns and best practices',
    interestKeywords: ['react', 'hooks', 'jsx', 'components']
  })
});

// Get user interests
const interests = await fetch('/api/v1/personalization/interests').then(r => r.json());
```

### 3. Generate Recommendations

```typescript
// Get content recommendations
const recommendations = await fetch(
  '/api/v1/personalization/recommendations?type=content&count=10'
).then(r => r.json());

// Get query suggestions
const suggestions = await fetch(
  '/api/v1/personalization/suggestions?count=5'
).then(r => r.json());
```

### 4. Adaptive Interface

```typescript
// Get personalized layout
const layout = await fetch('/api/v1/personalization/interface/layout?' + 
  new URLSearchParams({
    device: JSON.stringify({
      screenWidth: window.innerWidth,
      touchCapable: 'ontouchstart' in window
    })
  })
).then(r => r.json());

// Apply layout adaptations
const adaptedInterface = {
  ...baseInterface,
  ...layout.data
};
```

## Configuration Options

### PersonalizationEngine Config
```typescript
{
  defaultPersonalizationLevel: 'medium', // 'low' | 'medium' | 'high' | 'custom'
  minConfidenceThreshold: 0.3,           // Minimum confidence for personalization
  maxPersonalizationBoost: 0.5,          // Maximum score boost/penalty
  behaviorSignalWeights: {               // Weight different user signals
    clickWeight: 0.4,
    saveWeight: 0.8,
    shareWeight: 0.9
  },
  enableRealTimeAdaptation: true,        // Real-time learning
  cachePersonalizationResults: true      // Cache results for analytics
}
```

### RecommendationSystem Config
```typescript
{
  maxRecommendationsPerType: 10,         // Max recommendations per type
  diversityThreshold: 0.4,               // Diversity vs relevance balance
  enableCollaborativeFiltering: true,    // Similar user recommendations
  enableContentBasedFiltering: true,     // Interest-based recommendations
  enableHybridRecommendations: true,     // Combined approach
  recommendationTTL: 60                  // Cache time in minutes
}
```

### InterestModeling Config
```typescript
{
  minAffinityThreshold: 0.2,             // Minimum interest strength
  maxInterestsPerUser: 50,               // Maximum tracked interests
  enableAutoDiscovery: true,             // Automatic interest detection
  enableTrendAnalysis: true,             // Interest evolution tracking
  keywordExtractionEnabled: true        // Extract keywords from content
}
```

### AdaptiveInterface Config
```typescript
{
  enableLayoutAdaptation: true,          // Dynamic layout changes
  enableDeviceOptimization: true,        // Device-specific adaptations
  enableAccessibilityAdaptations: true,  // Accessibility improvements
  enableCrossDeviceSync: true,           // Sync across devices
  adaptationRefreshInterval: 30          // Refresh interval in minutes
}
```

## Performance Considerations

1. **Caching**: Personalization results are cached to improve performance
2. **Lazy Loading**: Services are initialized only when needed
3. **Background Processing**: Interest modeling happens asynchronously
4. **Database Indexes**: Optimized queries with strategic indexes
5. **Rate Limiting**: API endpoints have built-in rate limiting

## Privacy and Control

1. **User Control**: Complete control over personalization levels
2. **Transparency**: Users can see why results were personalized
3. **Opt-out**: Users can disable personalization entirely
4. **Data Management**: Users can view and delete their data
5. **Privacy Levels**: Configurable privacy settings

## Monitoring and Analytics

Track personalization effectiveness:

```typescript
// Get personalization analytics
const analytics = await fetch('/api/v1/personalization/analytics').then(r => r.json());

console.log('Analytics:', {
  totalInterests: analytics.data.metrics.totalInterests,
  personalizationLevel: analytics.data.metrics.personalizationLevel,
  averageAffinityScore: analytics.data.metrics.averageAffinityScore
});
```

## Testing

Run the integration tests:

```bash
cd core
npm test -- personalization-integration.test.ts
```

The test suite covers:
- Service initialization
- Personalized search flow
- Interest extraction
- Recommendation generation
- Error handling
- Configuration validation

## Troubleshooting

### Common Issues

1. **Migration Fails**: Ensure PostgreSQL is running and credentials are correct
2. **Service Not Initialized**: Check database table existence
3. **No Personalization**: Verify user has behavior data and interests
4. **Poor Recommendations**: Allow time for interest modeling to learn
5. **UI Not Adapting**: Check device context and user preferences

### Debug Mode

Enable debug logging:

```typescript
const config = {
  ...PersonalizationSystem.getDefaultConfig(),
  debug: true
};
```

### Performance Issues

1. Check database query performance with `EXPLAIN ANALYZE`
2. Monitor cache hit rates
3. Verify index usage
4. Check recommendation generation time

## Future Enhancements

The system is designed for extensibility:

1. **ML Models**: Advanced machine learning for better recommendations
2. **Real-time**: WebSocket-based real-time personalization updates  
3. **Cross-platform**: Mobile app integration
4. **Advanced Analytics**: Detailed personalization effectiveness metrics
5. **Enterprise Features**: Multi-tenant support and advanced controls

## Conclusion

The Personalized Search Experience system is now fully integrated and ready for production use. It provides:

✅ **Intelligent Personalization**: Multi-factor result ranking based on user behavior
✅ **Smart Recommendations**: Content-based and collaborative filtering 
✅ **Adaptive Interface**: Dynamic UI that adapts to user preferences
✅ **Interest Management**: Automatic discovery and manual control of user interests
✅ **Privacy Controls**: Complete user control and transparency
✅ **A/B Testing**: Built-in experimentation framework
✅ **Analytics**: Comprehensive insights into personalization effectiveness
✅ **Performance**: Optimized for scale with caching and efficient queries

The system significantly enhances the search experience by learning from user behavior and adapting to individual preferences while maintaining privacy and user control.