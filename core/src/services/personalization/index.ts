/**
 * Personalization services index
 * 
 * Export all personalization services and their configurations
 */

// Core services
export { PersonalizationEngine, type PersonalizationConfig } from './personalization-engine.js';
export { RecommendationSystem, type RecommendationConfig } from './recommendation-system.js';
export { InterestModelingService, type InterestModelingConfig } from './interest-modeling-service.js';
export { AdaptiveInterfaceService, type AdaptiveInterfaceConfig } from './adaptive-interface-service.js';

// Service factory for easy instantiation
import { Database } from '@shared/utils/database.js';
import { PersonalizationEngine, PersonalizationConfig } from './personalization-engine.js';
import { RecommendationSystem, RecommendationConfig } from './recommendation-system.js';
import { InterestModelingService, InterestModelingConfig } from './interest-modeling-service.js';
import { AdaptiveInterfaceService, AdaptiveInterfaceConfig } from './adaptive-interface-service.js';

export interface PersonalizationSystemConfig {
  personalizationEngine: PersonalizationConfig;
  recommendationSystem: RecommendationConfig;
  interestModeling: InterestModelingConfig;
  adaptiveInterface: AdaptiveInterfaceConfig;
}

export class PersonalizationSystem {
  public readonly engine: PersonalizationEngine;
  public readonly recommendations: RecommendationSystem;
  public readonly interests: InterestModelingService;
  public readonly adaptiveInterface: AdaptiveInterfaceService;

  constructor(database: Database, config: PersonalizationSystemConfig) {
    this.engine = new PersonalizationEngine(database, config.personalizationEngine);
    this.recommendations = new RecommendationSystem(database, config.recommendationSystem);
    this.interests = new InterestModelingService(database, config.interestModeling);
    this.adaptiveInterface = new AdaptiveInterfaceService(database, config.adaptiveInterface);
  }

  /**
   * Get default configuration for personalization system
   */
  static getDefaultConfig(): PersonalizationSystemConfig {
    return {
      personalizationEngine: {
        defaultPersonalizationLevel: 'medium',
        minConfidenceThreshold: 0.3,
        maxPersonalizationBoost: 0.5,
        behaviorSignalWeights: {
          clickWeight: 0.4,
          dwellTimeWeight: 0.3,
          saveWeight: 0.8,
          shareWeight: 0.9,
          queryRefinementWeight: 0.2,
          returnVisitWeight: 0.6
        },
        temporalDecayRate: 0.1,
        diversityThreshold: 0.3,
        enableRealTimeAdaptation: true,
        cachePersonalizationResults: true
      },
      recommendationSystem: {
        maxRecommendationsPerType: 10,
        minConfidenceThreshold: 0.4,
        diversityThreshold: 0.4,
        noveltyWeight: 0.2,
        popularityWeight: 0.1,
        personalRelevanceWeight: 0.7,
        enableCollaborativeFiltering: true,
        enableContentBasedFiltering: true,
        enableHybridRecommendations: true,
        recommendationTTL: 60 // 1 hour
      },
      interestModeling: {
        minAffinityThreshold: 0.2,
        maxInterestsPerUser: 50,
        interestDecayRate: 0.05,
        confidenceThreshold: 0.3,
        trendAnalysisWindow: 30, // 30 days
        enableAutoDiscovery: true,
        enableTrendAnalysis: true,
        keywordExtractionEnabled: true
      },
      adaptiveInterface: {
        enableLayoutAdaptation: true,
        enableDeviceOptimization: true,
        enableUsagePatternAdaptation: true,
        enableAccessibilityAdaptations: true,
        enablePerformanceOptimization: true,
        enableCrossDeviceSync: true,
        cacheAdaptationResults: true,
        adaptationRefreshInterval: 30, // 30 minutes
        maxLayoutVariants: 5
      }
    };
  }

  /**
   * Initialize personalization system with database migration check
   */
  static async initialize(database: Database, config?: Partial<PersonalizationSystemConfig>): Promise<PersonalizationSystem> {
    const fullConfig = {
      ...PersonalizationSystem.getDefaultConfig(),
      ...config
    };

    // Check if personalization tables exist
    const tablesExist = await PersonalizationSystem.checkTablesExist(database);
    if (!tablesExist) {
      throw new Error('Personalization tables not found. Please run migration 026 first.');
    }

    return new PersonalizationSystem(database, fullConfig);
  }

  /**
   * Check if required personalization tables exist
   */
  private static async checkTablesExist(database: Database): Promise<boolean> {
    try {
      const tables = [
        'user_personalization_profiles',
        'personalized_search_results',
        'user_interest_profiles',
        'personalized_recommendations',
        'personalization_experiments'
      ];

      for (const table of tables) {
        const result = await database.selectFrom('information_schema.tables')
          .select('table_name')
          .where('table_name', '=', table)
          .executeTakeFirst();

        if (!result) {
          return false;
        }
      }

      return true;

    } catch (error) {
      return false;
    }
  }

  /**
   * Perform comprehensive user personalization analysis
   */
  async analyzeUser(userId: string): Promise<{
    profile: any;
    interests: any[];
    recommendations: any[];
    adaptiveLayout: any;
  }> {
    const [profile, interests, recommendations, adaptiveLayout] = await Promise.all([
      this.engine.getPersonalizationProfile(userId),
      this.interests.getUserInterests(userId, true),
      this.recommendations.getActiveRecommendations(userId),
      this.adaptiveInterface.getAdaptiveLayout(userId)
    ]);

    return {
      profile,
      interests,
      recommendations,
      adaptiveLayout
    };
  }

  /**
   * Perform complete personalized search with all features
   */
  async personalizedSearch(
    userId: string,
    query: string,
    originalResults: any[],
    context?: Record<string, any>
  ): Promise<{
    personalizedResults: any;
    recommendations: any[];
    adaptiveInterface: any;
  }> {
    const [personalizedResults, recommendations, adaptiveInterface] = await Promise.all([
      this.engine.personalizeSearchResults(userId, originalResults, query, context),
      this.recommendations.generateRecommendations(userId, 'search_query', 5, context),
      this.adaptiveInterface.getAdaptiveLayout(userId, context)
    ]);

    return {
      personalizedResults,
      recommendations,
      adaptiveInterface
    };
  }

  /**
   * Update user interests from behavior events
   */
  async updateUserFromBehavior(userId: string, events: any[]): Promise<{
    newInterests: any[];
    updatedProfile: any;
  }> {
    const newInterests = await this.interests.extractInterestsFromBehavior(userId, events);
    
    // Update interest trends
    await this.interests.updateInterestTrends(userId);
    
    const updatedProfile = await this.engine.getPersonalizationProfile(userId);

    return {
      newInterests,
      updatedProfile
    };
  }
}