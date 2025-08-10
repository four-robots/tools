/**
 * Integration tests for personalization system
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { PersonalizationSystem } from '../index.js';
import { Database } from '@shared/utils/database.js';

// Mock database for testing
const mockDb = {
  selectFrom: () => mockDb,
  insertInto: () => mockDb,
  updateTable: () => mockDb,
  deleteFrom: () => mockDb,
  set: () => mockDb,
  values: () => mockDb,
  where: () => mockDb,
  execute: () => Promise.resolve([]),
  executeTakeFirst: () => Promise.resolve(null),
  returningAll: () => mockDb,
  selectAll: () => mockDb,
  orderBy: () => mockDb,
  limit: () => mockDb,
  groupBy: () => mockDb,
  having: () => mockDb,
  fn: {
    count: () => 'count(*)',
    avg: () => 'avg(column)'
  }
} as any;

describe('PersonalizationSystem Integration', () => {
  let system: PersonalizationSystem;
  const testUserId = 'test-user-123';

  beforeEach(async () => {
    // Mock database table existence check
    mockDb.selectFrom = () => ({
      select: () => ({
        where: () => ({
          executeTakeFirst: () => Promise.resolve({ table_name: 'user_personalization_profiles' })
        })
      })
    });

    system = new PersonalizationSystem(mockDb, PersonalizationSystem.getDefaultConfig());
  });

  describe('PersonalizationEngine', () => {
    it('should create default profile for new user', async () => {
      const profile = await system.engine.getPersonalizationProfile(testUserId);
      
      expect(profile).toBeDefined();
      expect(profile.userId).toBe(testUserId);
      expect(profile.personalizationLevel).toBe('medium');
      expect(profile.learningEnabled).toBe(true);
    });

    it('should personalize search results', async () => {
      const originalResults = [
        { id: '1', title: 'Test Result 1', score: 0.8 },
        { id: '2', title: 'Test Result 2', score: 0.6 }
      ];

      const personalizedResults = await system.engine.personalizeSearchResults(
        testUserId,
        originalResults,
        'test query'
      );

      expect(personalizedResults).toBeDefined();
      expect(personalizedResults.personalizedResults).toHaveLength(2);
    });
  });

  describe('RecommendationSystem', () => {
    it('should generate recommendations for user', async () => {
      const recommendations = await system.recommendations.generateRecommendations(
        testUserId,
        'content',
        5
      );

      expect(Array.isArray(recommendations)).toBe(true);
    });
  });

  describe('InterestModelingService', () => {
    it('should extract interests from behavior events', async () => {
      const mockEvents = [
        {
          eventType: 'search',
          eventAction: 'query_submitted',
          searchQuery: 'machine learning tutorial',
          eventTimestamp: new Date().toISOString()
        }
      ];

      const interests = await system.interests.extractInterestsFromBehavior(testUserId, mockEvents);
      
      expect(Array.isArray(interests)).toBe(true);
    });
  });

  describe('AdaptiveInterfaceService', () => {
    it('should generate adaptive layout', async () => {
      const layout = await system.adaptiveInterface.getAdaptiveLayout(testUserId);
      
      expect(layout).toBeDefined();
      expect(layout.components).toBeDefined();
      expect(layout.appearance).toBeDefined();
    });
  });

  describe('Complete Personalized Search Flow', () => {
    it('should execute full personalized search with all features', async () => {
      const searchQuery = 'artificial intelligence';
      const originalResults = [
        {
          id: '1',
          title: 'Introduction to AI',
          description: 'A comprehensive guide to AI',
          url: 'https://example.com/ai-intro',
          source: 'example.com',
          type: 'article',
          score: 0.9,
          timestamp: new Date().toISOString()
        },
        {
          id: '2', 
          title: 'Machine Learning Basics',
          description: 'Learn the fundamentals of ML',
          url: 'https://example.com/ml-basics',
          source: 'example.com',
          type: 'tutorial',
          score: 0.7,
          timestamp: new Date().toISOString()
        }
      ];

      const result = await system.personalizedSearch(testUserId, searchQuery, originalResults);

      expect(result).toBeDefined();
      expect(result.personalizedResults).toBeDefined();
      expect(result.recommendations).toBeDefined();
      expect(result.adaptiveInterface).toBeDefined();
    });
  });
});

describe('PersonalizationSystem Configuration', () => {
  it('should provide valid default configuration', () => {
    const config = PersonalizationSystem.getDefaultConfig();
    
    expect(config.personalizationEngine).toBeDefined();
    expect(config.recommendationSystem).toBeDefined();
    expect(config.interestModeling).toBeDefined();
    expect(config.adaptiveInterface).toBeDefined();
    
    // Validate configuration values
    expect(config.personalizationEngine.defaultPersonalizationLevel).toBe('medium');
    expect(config.recommendationSystem.maxRecommendationsPerType).toBe(10);
    expect(config.interestModeling.maxInterestsPerUser).toBe(50);
    expect(config.adaptiveInterface.enableLayoutAdaptation).toBe(true);
  });
});

describe('Error Handling', () => {
  it('should handle database errors gracefully', async () => {
    const errorDb = {
      ...mockDb,
      selectFrom: () => ({
        selectAll: () => ({
          where: () => ({
            execute: () => Promise.reject(new Error('Database error'))
          })
        })
      })
    } as any;

    const errorSystem = new PersonalizationSystem(errorDb, PersonalizationSystem.getDefaultConfig());
    
    await expect(
      errorSystem.engine.getPersonalizationProfile(testUserId)
    ).rejects.toThrow();
  });

  it('should handle missing user gracefully', async () => {
    mockDb.selectFrom = () => ({
      selectAll: () => ({
        where: () => ({
          execute: () => Promise.resolve([])
        })
      })
    });

    const interests = await system.interests.getUserInterests('non-existent-user');
    expect(interests).toEqual([]);
  });
});