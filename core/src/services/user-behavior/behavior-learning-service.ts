import { Kysely } from 'kysely';
import { EventEmitter } from 'events';
import {
  BehaviorEvent,
  UserSearchPattern,
  UserBehaviorSegment,
  UserBehaviorPrediction,
  MLModel,
  SegmentTypes,
  PredictionTypes,
} from '../../shared/types/user-behavior.js';
import { MLModelConfig } from './types.js';
import { MLFeatureExtractor, FeatureVector } from './utils/ml-feature-extractor.js';
import { StatisticalAnalyzer } from './utils/statistical-analyzer.js';
import { Logger } from '../../shared/utils/logger.js';

export interface ModelTrainingResult {
  modelId: string;
  performance: {
    accuracy: number;
    precision: number;
    recall: number;
    f1Score: number;
  };
  featureImportance: Record<string, number>;
  trainingMetrics: {
    trainingSize: number;
    validationSize: number;
    trainingTime: number;
    convergenceEpochs?: number;
  };
}

export interface PredictionResult {
  userId: string;
  predictions: UserBehaviorPrediction[];
  confidence: number;
  modelVersion: string;
  generatedAt: Date;
}

export interface SegmentationResult {
  userId: string;
  segments: UserBehaviorSegment[];
  confidence: number;
  modelVersion: string;
  assignedAt: Date;
}

export class BehaviorLearningService extends EventEmitter {
  private db: Kysely<any>;
  private config: MLModelConfig;
  private featureExtractor: MLFeatureExtractor;
  private statisticalAnalyzer: StatisticalAnalyzer;
  private trainedModels: Map<string, MLModel>;
  private logger: Logger;

  constructor(
    db: Kysely<any>,
    config: MLModelConfig = {
      modelType: 'classification',
      algorithm: 'random_forest',
      hyperparameters: {
        n_estimators: 100,
        max_depth: 10,
        min_samples_split: 5,
      },
      trainingSchedule: '0 2 * * *', // Daily at 2 AM
      retrainThreshold: 0.1, // Retrain if accuracy drops by 10%
      featureSet: ['temporal', 'behavioral', 'content', 'interaction'],
      maxTrainingDataAge: 90, // 90 days
    }
  ) {
    super();
    this.db = db;
    this.config = config;
    this.featureExtractor = new MLFeatureExtractor();
    this.statisticalAnalyzer = new StatisticalAnalyzer();
    this.trainedModels = new Map();
    this.logger = new Logger('BehaviorLearningService');
  }

  /**
   * Train user segmentation model
   */
  async trainSegmentationModel(): Promise<ModelTrainingResult> {
    try {
      this.logger.info('Starting segmentation model training');

      // Prepare training data
      const trainingData = await this.prepareSegmentationTrainingData();
      
      if (trainingData.length < 100) {
        throw new Error('Insufficient training data for segmentation model');
      }

      // Split into training and validation sets
      const { trainingSet, validationSet } = this.splitTrainingData(trainingData, 0.8);

      // Extract features
      const trainingFeatures = trainingSet.map(data => data.features);
      const trainingLabels = trainingSet.map(data => data.segment);
      const validationFeatures = validationSet.map(data => data.features);
      const validationLabels = validationSet.map(data => data.segment);

      // Train the model
      const startTime = Date.now();
      const model = await this.trainClassificationModel(
        trainingFeatures,
        trainingLabels,
        'user_segmentation',
        this.config.hyperparameters
      );
      const trainingTime = Date.now() - startTime;

      // Validate the model
      const performance = await this.evaluateModel(
        model,
        validationFeatures,
        validationLabels
      );

      // Calculate feature importance
      const featureImportance = this.calculateFeatureImportance(
        trainingFeatures,
        trainingLabels
      );

      // Store the trained model
      await this.storeModel(model);
      this.trainedModels.set(model.modelId, model);

      const result = {
        modelId: model.modelId,
        performance,
        featureImportance,
        trainingMetrics: {
          trainingSize: trainingSet.length,
          validationSize: validationSet.length,
          trainingTime,
        },
      };

      this.emit('model:trained', { modelType: 'segmentation', result });
      this.logger.info('Segmentation model training completed', { 
        modelId: model.modelId, 
        accuracy: performance.accuracy 
      });

      return result;

    } catch (error) {
      this.logger.error('Failed to train segmentation model', error);
      throw error;
    }
  }

  /**
   * Train behavior prediction model
   */
  async trainPredictionModel(predictionType: string): Promise<ModelTrainingResult> {
    try {
      this.logger.info('Starting prediction model training', { predictionType });

      // Prepare training data specific to prediction type
      const trainingData = await this.preparePredictionTrainingData(predictionType);
      
      if (trainingData.length < 50) {
        throw new Error(`Insufficient training data for ${predictionType} prediction model`);
      }

      // Split data
      const { trainingSet, validationSet } = this.splitTrainingData(trainingData, 0.8);

      // Extract features and targets
      const trainingFeatures = trainingSet.map(data => data.features);
      const trainingTargets = trainingSet.map(data => data.target);
      const validationFeatures = validationSet.map(data => data.features);
      const validationTargets = validationSet.map(data => data.target);

      // Train model based on prediction type
      const model = await this.trainPredictionModelForType(
        predictionType,
        trainingFeatures,
        trainingTargets
      );

      // Evaluate model
      const performance = await this.evaluateModel(
        model,
        validationFeatures,
        validationTargets
      );

      // Calculate feature importance
      const featureImportance = this.calculateFeatureImportance(
        trainingFeatures,
        trainingTargets
      );

      // Store model
      await this.storeModel(model);
      this.trainedModels.set(model.modelId, model);

      const result = {
        modelId: model.modelId,
        performance,
        featureImportance,
        trainingMetrics: {
          trainingSize: trainingSet.length,
          validationSize: validationSet.length,
          trainingTime: Date.now(),
        },
      };

      this.emit('model:trained', { modelType: 'prediction', predictionType, result });
      return result;

    } catch (error) {
      this.logger.error('Failed to train prediction model', error, { predictionType });
      throw error;
    }
  }

  /**
   * Segment users based on behavior patterns
   */
  async segmentUser(userId: string): Promise<SegmentationResult> {
    try {
      // Get segmentation model
      const model = await this.getModel('user_segmentation');
      if (!model) {
        throw new Error('User segmentation model not found');
      }

      // Get user data and extract features
      const userEvents = await this.getUserEvents(userId, 30);
      const userPatterns = await this.getUserPatterns(userId);
      
      if (userEvents.length === 0) {
        return {
          userId,
          segments: [],
          confidence: 0,
          modelVersion: '1.0',
          assignedAt: new Date(),
        };
      }

      const featureVector = this.featureExtractor.extractSegmentationFeatures(
        userId,
        userEvents,
        userPatterns
      );

      // Predict segments
      const segmentPredictions = await this.predictSegments(model, featureVector);
      
      // Convert predictions to segment objects
      const segments = await this.createSegmentObjects(userId, segmentPredictions, model);

      // Store segments in database
      await this.storeUserSegments(userId, segments);

      const result = {
        userId,
        segments,
        confidence: this.calculateSegmentationConfidence(segmentPredictions),
        modelVersion: model.version,
        assignedAt: new Date(),
      };

      this.emit('user:segmented', result);
      this.logger.debug('User segmented', { userId, segmentCount: segments.length });

      return result;

    } catch (error) {
      this.logger.error('Failed to segment user', error, { userId });
      throw error;
    }
  }

  /**
   * Generate predictions for user behavior
   */
  async predictUserBehavior(
    userId: string,
    predictionTypes: string[] = Object.values(PredictionTypes)
  ): Promise<PredictionResult> {
    try {
      const predictions: UserBehaviorPrediction[] = [];
      let totalConfidence = 0;

      for (const predictionType of predictionTypes) {
        try {
          const prediction = await this.generateSinglePrediction(userId, predictionType);
          if (prediction) {
            predictions.push(prediction);
            totalConfidence += prediction.confidenceScore || 0;
          }
        } catch (error) {
          this.logger.warn('Failed to generate prediction', { userId, predictionType, error });
        }
      }

      // Store predictions in database
      if (predictions.length > 0) {
        await this.storePredictions(predictions);
      }

      const result = {
        userId,
        predictions,
        confidence: predictions.length > 0 ? totalConfidence / predictions.length : 0,
        modelVersion: '1.0',
        generatedAt: new Date(),
      };

      this.emit('predictions:generated', result);
      this.logger.debug('Predictions generated', { userId, count: predictions.length });

      return result;

    } catch (error) {
      this.logger.error('Failed to predict user behavior', error, { userId });
      throw error;
    }
  }

  /**
   * Retrain models based on new data
   */
  async retrainModels(): Promise<Array<ModelTrainingResult>> {
    try {
      this.logger.info('Starting model retraining');
      
      const results: ModelTrainingResult[] = [];

      // Retrain segmentation model
      const segmentationResult = await this.trainSegmentationModel();
      results.push(segmentationResult);

      // Retrain prediction models for each type
      for (const predictionType of Object.values(PredictionTypes)) {
        try {
          const predictionResult = await this.trainPredictionModel(predictionType);
          results.push(predictionResult);
        } catch (error) {
          this.logger.warn('Failed to retrain prediction model', { predictionType, error });
        }
      }

      this.emit('models:retrained', results);
      this.logger.info('Model retraining completed', { modelsRetrained: results.length });

      return results;

    } catch (error) {
      this.logger.error('Failed to retrain models', error);
      throw error;
    }
  }

  /**
   * Evaluate model performance
   */
  async evaluateModelPerformance(modelId: string): Promise<{
    accuracy: number;
    precision: number;
    recall: number;
    f1Score: number;
    confusionMatrix?: number[][];
  }> {
    try {
      const model = await this.getModel(modelId);
      if (!model) {
        throw new Error(`Model ${modelId} not found`);
      }

      // Get test data
      const testData = await this.getTestData(model.modelType);
      
      // Make predictions
      const predictions = await this.makeBatchPredictions(model, testData.features);
      
      // Calculate metrics
      return this.calculatePerformanceMetrics(predictions, testData.labels);

    } catch (error) {
      this.logger.error('Failed to evaluate model performance', error, { modelId });
      throw error;
    }
  }

  /**
   * Get model insights and interpretability
   */
  async getModelInsights(modelId: string): Promise<{
    featureImportance: Record<string, number>;
    modelComplexity: number;
    trainingHistory: any[];
    biasAnalysis: Record<string, number>;
  }> {
    try {
      const model = await this.getModel(modelId);
      if (!model) {
        throw new Error(`Model ${modelId} not found`);
      }

      return {
        featureImportance: model.performance.featureImportance || {},
        modelComplexity: this.calculateModelComplexity(model),
        trainingHistory: await this.getModelTrainingHistory(modelId),
        biasAnalysis: await this.analyzeModelBias(model),
      };

    } catch (error) {
      this.logger.error('Failed to get model insights', error, { modelId });
      throw error;
    }
  }

  // Private methods

  private async prepareSegmentationTrainingData(): Promise<Array<{
    userId: string;
    features: FeatureVector;
    segment: string;
  }>> {
    // Get users with sufficient behavior data
    const users = await this.getUsersForTraining();
    const trainingData: Array<{
      userId: string;
      features: FeatureVector;
      segment: string;
    }> = [];

    for (const user of users) {
      const events = await this.getUserEvents(user.userId, this.config.maxTrainingDataAge);
      const patterns = await this.getUserPatterns(user.userId);

      if (events.length >= 10) { // Minimum events for meaningful segmentation
        const features = this.featureExtractor.extractSegmentationFeatures(
          user.userId,
          events,
          patterns
        );

        // Determine ground truth segment (simplified approach)
        const segment = this.determineGroundTruthSegment(events, patterns);

        trainingData.push({
          userId: user.userId,
          features,
          segment,
        });
      }
    }

    return trainingData;
  }

  private async preparePredictionTrainingData(predictionType: string): Promise<Array<{
    userId: string;
    features: FeatureVector;
    target: number;
  }>> {
    const users = await this.getUsersForTraining();
    const trainingData: Array<{
      userId: string;
      features: FeatureVector;
      target: number;
    }> = [];

    for (const user of users) {
      const events = await this.getUserEvents(user.userId, this.config.maxTrainingDataAge);
      
      if (events.length >= 5) {
        const features = this.featureExtractor.extractPredictionFeatures(events, 7);
        const target = await this.getGroundTruthTarget(user.userId, predictionType, events);

        if (target !== null) {
          trainingData.push({
            userId: user.userId,
            features,
            target,
          });
        }
      }
    }

    return trainingData;
  }

  private splitTrainingData<T>(data: T[], trainRatio: number): {
    trainingSet: T[];
    validationSet: T[];
  } {
    const shuffled = [...data].sort(() => Math.random() - 0.5);
    const splitIndex = Math.floor(data.length * trainRatio);
    
    return {
      trainingSet: shuffled.slice(0, splitIndex),
      validationSet: shuffled.slice(splitIndex),
    };
  }

  private async trainClassificationModel(
    features: FeatureVector[],
    labels: string[],
    modelType: string,
    hyperparameters: Record<string, any>
  ): Promise<MLModel> {
    // Simplified classification model training
    // In production, integrate with proper ML libraries like scikit-learn or TensorFlow
    
    const modelId = `${modelType}_${Date.now()}`;
    const model: MLModel = {
      modelId,
      modelType: 'classification',
      algorithm: this.config.algorithm,
      version: '1.0',
      trainingDate: new Date(),
      features: Object.keys(features[0]?.features || {}),
      hyperparameters,
      performance: {
        accuracy: 0.85, // Placeholder - would be calculated from actual training
        precision: 0.82,
        recall: 0.88,
        f1Score: 0.85,
      },
      isActive: true,
      description: `${modelType} classification model`,
    };

    return model;
  }

  private async trainPredictionModelForType(
    predictionType: string,
    features: FeatureVector[],
    targets: number[]
  ): Promise<MLModel> {
    // Simplified prediction model training
    const modelId = `prediction_${predictionType}_${Date.now()}`;
    
    const model: MLModel = {
      modelId,
      modelType: this.getPredictionModelType(predictionType),
      algorithm: this.config.algorithm,
      version: '1.0',
      trainingDate: new Date(),
      features: Object.keys(features[0]?.features || {}),
      hyperparameters: this.config.hyperparameters,
      performance: {
        accuracy: 0.8, // Placeholder
        rmse: 0.15, // For regression models
        mae: 0.12, // For regression models
      },
      isActive: true,
      description: `${predictionType} prediction model`,
    };

    return model;
  }

  private async evaluateModel(
    model: MLModel,
    validationFeatures: FeatureVector[],
    validationLabels: any[]
  ): Promise<{
    accuracy: number;
    precision: number;
    recall: number;
    f1Score: number;
  }> {
    // Simplified model evaluation
    // In production, use proper evaluation metrics
    
    return {
      accuracy: 0.85,
      precision: 0.82,
      recall: 0.88,
      f1Score: 0.85,
    };
  }

  private calculateFeatureImportance(
    features: FeatureVector[],
    labels: any[]
  ): Record<string, number> {
    // Simplified feature importance calculation
    // In production, this would come from the trained model
    
    const importance: Record<string, number> = {};
    const featureKeys = Object.keys(features[0]?.features || {});
    
    featureKeys.forEach(key => {
      importance[key] = Math.random() * 0.3 + 0.1; // Placeholder values
    });

    return importance;
  }

  private async predictSegments(
    model: MLModel,
    featureVector: FeatureVector
  ): Promise<Array<{
    segmentType: string;
    segmentName: string;
    confidence: number;
    attributes: Record<string, any>;
  }>> {
    // Simplified segment prediction
    // In production, use actual model inference
    
    return [
      {
        segmentType: 'search_style',
        segmentName: 'Power User',
        confidence: 0.85,
        attributes: {
          searchExpertise: 'expert',
          usageFrequency: 'heavy',
          queryComplexity: 'complex',
        },
      },
      {
        segmentType: 'engagement_level',
        segmentName: 'Highly Engaged',
        confidence: 0.78,
        attributes: {
          engagementLevel: 'high',
          sessionLength: 'long',
        },
      },
    ];
  }

  private async createSegmentObjects(
    userId: string,
    predictions: Array<{
      segmentType: string;
      segmentName: string;
      confidence: number;
      attributes: Record<string, any>;
    }>,
    model: MLModel
  ): Promise<UserBehaviorSegment[]> {
    return predictions.map(pred => ({
      userId,
      segmentType: pred.segmentType as any,
      segmentName: pred.segmentName,
      segmentDescription: `User classified as ${pred.segmentName}`,
      segmentAttributes: pred.attributes,
      confidenceScore: pred.confidence,
      stabilityScore: 0.8,
      classificationModel: model.algorithm,
      modelVersion: model.version,
      featureImportance: model.performance.featureImportance || {},
      isActive: true,
      isPrimary: pred.confidence > 0.8,
    }));
  }

  private async generateSinglePrediction(
    userId: string,
    predictionType: string
  ): Promise<UserBehaviorPrediction | null> {
    try {
      const model = await this.getModel(`prediction_${predictionType}`);
      if (!model) {
        return null;
      }

      const userEvents = await this.getUserEvents(userId, 7);
      if (userEvents.length === 0) {
        return null;
      }

      const features = this.featureExtractor.extractPredictionFeatures(userEvents);
      
      // Simplified prediction
      const predictionValue = this.makePredictionForType(predictionType, features);
      
      return {
        userId,
        predictionType: predictionType as any,
        predictionTarget: `${predictionType}_prediction`,
        predictionValue,
        confidenceScore: 0.75,
        probabilityScore: 0.8,
        modelName: model.modelId,
        modelVersion: model.version,
        algorithmUsed: model.algorithm,
        predictionHorizonDays: 7,
      };

    } catch (error) {
      this.logger.warn('Failed to generate single prediction', { userId, predictionType, error });
      return null;
    }
  }

  private makePredictionForType(predictionType: string, features: FeatureVector): any {
    // Simplified prediction logic based on type
    switch (predictionType) {
      case PredictionTypes.CHURN_RISK:
        return { riskScore: 0.25, timeToChurn: 30 };
      case PredictionTypes.ENGAGEMENT_LEVEL:
        return { expectedEngagement: 0.8, engagementCategory: 'high' };
      case PredictionTypes.NEXT_SEARCH:
        return { predictedQuery: 'machine learning', timeToAction: 2 };
      default:
        return { value: 0.5 };
    }
  }

  private calculateSegmentationConfidence(predictions: any[]): number {
    if (predictions.length === 0) return 0;
    return predictions.reduce((sum, pred) => sum + pred.confidence, 0) / predictions.length;
  }

  // Utility methods and placeholders

  private async getUsersForTraining(): Promise<Array<{ userId: string }>> {
    const results = await this.db
      .selectFrom('user_behavior_events')
      .select('user_id')
      .distinct()
      .execute();

    return results.map(row => ({ userId: row.user_id }));
  }

  private async getUserEvents(userId: string, days: number): Promise<BehaviorEvent[]> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);

    const results = await this.db
      .selectFrom('user_behavior_events')
      .selectAll()
      .where('user_id', '=', userId)
      .where('event_timestamp', '>=', cutoffDate)
      .execute();

    return results.map(row => ({
      id: row.id,
      userId: row.user_id,
      sessionId: row.session_id,
      eventType: row.event_type,
      eventCategory: row.event_category,
      eventAction: row.event_action,
      searchQuery: row.search_query,
      searchContext: row.search_context,
      resultData: row.result_data,
      pageContext: row.page_context,
      eventTimestamp: row.event_timestamp,
      sessionSequence: row.session_sequence,
      pageSequence: row.page_sequence,
      userAgent: row.user_agent,
      ipAddress: row.ip_address,
      referrer: row.referrer,
      deviceInfo: row.device_info,
      responseTimeMs: row.response_time_ms,
      searchDurationMs: row.search_duration_ms,
      interactionDurationMs: row.interaction_duration_ms,
      createdAt: row.created_at,
    }));
  }

  private async getUserPatterns(userId: string): Promise<UserSearchPattern[]> {
    const results = await this.db
      .selectFrom('user_search_patterns')
      .selectAll()
      .where('user_id', '=', userId)
      .where('is_active', '=', true)
      .execute();

    return results.map(row => ({
      id: row.id,
      userId: row.user_id,
      patternType: row.pattern_type,
      patternName: row.pattern_name,
      patternDescription: row.pattern_description,
      patternData: row.pattern_data,
      confidenceScore: row.confidence_score ? parseFloat(row.confidence_score) : undefined,
      frequencyScore: row.frequency_score ? parseFloat(row.frequency_score) : undefined,
      occurrences: row.occurrences,
      lastOccurrenceAt: row.last_occurrence_at,
      firstDetectedAt: row.first_detected_at,
      modelVersion: row.model_version,
      learningAlgorithm: row.learning_algorithm,
      trainingDataSize: row.training_data_size,
      isActive: row.is_active,
      isSignificant: row.is_significant,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));
  }

  private async storeModel(model: MLModel): Promise<void> {
    // In production, store model in a model registry
    this.logger.debug('Model stored', { modelId: model.modelId });
  }

  private async getModel(modelId: string): Promise<MLModel | null> {
    return this.trainedModels.get(modelId) || null;
  }

  private async storeUserSegments(userId: string, segments: UserBehaviorSegment[]): Promise<void> {
    for (const segment of segments) {
      await this.db
        .insertInto('user_behavior_segments')
        .values({
          id: crypto.randomUUID(),
          user_id: segment.userId,
          segment_type: segment.segmentType,
          segment_name: segment.segmentName,
          segment_description: segment.segmentDescription,
          segment_attributes: segment.segmentAttributes,
          segment_scores: segment.segmentScores,
          confidence_score: segment.confidenceScore,
          stability_score: segment.stabilityScore,
          classification_model: segment.classificationModel,
          model_version: segment.modelVersion,
          feature_importance: segment.featureImportance,
          is_active: segment.isActive,
          is_primary: segment.isPrimary,
          created_at: new Date(),
        })
        .execute();
    }
  }

  private async storePredictions(predictions: UserBehaviorPrediction[]): Promise<void> {
    for (const prediction of predictions) {
      await this.db
        .insertInto('user_behavior_predictions')
        .values({
          id: crypto.randomUUID(),
          user_id: prediction.userId,
          prediction_type: prediction.predictionType,
          prediction_target: prediction.predictionTarget,
          prediction_value: prediction.predictionValue,
          confidence_score: prediction.confidenceScore,
          probability_score: prediction.probabilityScore,
          expected_outcome: prediction.expectedOutcome,
          model_name: prediction.modelName,
          model_version: prediction.modelVersion,
          algorithm_used: prediction.algorithmUsed,
          feature_set: prediction.featureSet,
          prediction_expires_at: prediction.predictionExpiresAt,
          prediction_horizon_days: prediction.predictionHorizonDays,
          created_at: new Date(),
        })
        .execute();
    }
  }

  // Placeholder methods for complete implementation

  private determineGroundTruthSegment(events: BehaviorEvent[], patterns: UserSearchPattern[]): string {
    // Simplified ground truth determination
    return 'power_user';
  }

  private async getGroundTruthTarget(userId: string, predictionType: string, events: BehaviorEvent[]): Promise<number | null> {
    // Simplified ground truth target
    return Math.random();
  }

  private getPredictionModelType(predictionType: string): 'classification' | 'clustering' | 'regression' | 'recommendation' {
    switch (predictionType) {
      case PredictionTypes.CHURN_RISK:
      case PredictionTypes.ENGAGEMENT_LEVEL:
        return 'classification';
      case PredictionTypes.NEXT_SEARCH:
      case PredictionTypes.PREFERRED_CONTENT:
        return 'recommendation';
      default:
        return 'regression';
    }
  }

  private async getTestData(modelType: string): Promise<{ features: FeatureVector[]; labels: any[] }> {
    return { features: [], labels: [] };
  }

  private async makeBatchPredictions(model: MLModel, features: FeatureVector[]): Promise<any[]> {
    return [];
  }

  private calculatePerformanceMetrics(predictions: any[], labels: any[]): any {
    return { accuracy: 0.85, precision: 0.82, recall: 0.88, f1Score: 0.85 };
  }

  private calculateModelComplexity(model: MLModel): number {
    return 0.5;
  }

  private async getModelTrainingHistory(modelId: string): Promise<any[]> {
    return [];
  }

  private async analyzeModelBias(model: MLModel): Promise<Record<string, number>> {
    return {};
  }
}