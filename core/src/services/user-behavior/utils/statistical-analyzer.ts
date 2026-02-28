import { Logger } from '../../../shared/utils/logger.js';

export interface StatisticalResult {
  mean: number;
  median: number;
  mode: number[];
  stdDev: number;
  variance: number;
  min: number;
  max: number;
  count: number;
  quartiles: {
    q1: number;
    q2: number;
    q3: number;
  };
}

export interface CorrelationResult {
  coefficient: number;
  significance: number;
  strength: 'weak' | 'moderate' | 'strong';
  direction: 'positive' | 'negative' | 'none';
}

export interface TrendAnalysis {
  direction: 'increasing' | 'decreasing' | 'stable';
  strength: number;
  confidence: number;
  seasonality: boolean;
  changePoints: number[];
}

export class StatisticalAnalyzer {
  private logger: Logger;

  constructor() {
    this.logger = new Logger('StatisticalAnalyzer');
  }

  /**
   * Calculate descriptive statistics for a dataset
   */
  calculateDescriptiveStats(data: number[]): StatisticalResult {
    if (data.length === 0) {
      throw new Error('Cannot calculate statistics for empty dataset');
    }

    const sorted = [...data].sort((a, b) => a - b);
    const n = data.length;

    const mean = this.calculateMean(data);
    const variance = this.calculateVariance(data, mean);
    const stdDev = Math.sqrt(variance);

    return {
      mean,
      median: this.calculateMedian(sorted),
      mode: this.calculateMode(data),
      stdDev,
      variance,
      min: Math.min(...data),
      max: Math.max(...data),
      count: n,
      quartiles: this.calculateQuartiles(sorted),
    };
  }

  /**
   * Calculate correlation between two variables
   */
  calculateCorrelation(x: number[], y: number[]): CorrelationResult {
    if (x.length !== y.length || x.length === 0) {
      throw new Error('Arrays must have the same non-zero length');
    }

    const coefficient = this.calculatePearsonCorrelation(x, y);
    const significance = this.calculateCorrelationSignificance(coefficient, x.length);
    
    return {
      coefficient,
      significance,
      strength: this.interpretCorrelationStrength(Math.abs(coefficient)),
      direction: coefficient > 0 ? 'positive' : coefficient < 0 ? 'negative' : 'none',
    };
  }

  /**
   * Analyze time series trends
   */
  analyzeTrend(timeSeries: Array<{ timestamp: Date; value: number }>): TrendAnalysis {
    if (timeSeries.length < 3) {
      throw new Error('Need at least 3 data points for trend analysis');
    }

    // Sort by timestamp
    const sorted = timeSeries.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
    const values = sorted.map(point => point.value);
    const times = sorted.map(point => point.timestamp.getTime());

    // Calculate linear regression slope
    const slope = this.calculateLinearRegressionSlope(times, values);
    const correlation = this.calculatePearsonCorrelation(times, values);

    // Detect seasonality
    const seasonality = this.detectSeasonality(values);

    // Find change points
    const changePoints = this.detectChangePoints(values);

    return {
      direction: slope > 0 ? 'increasing' : slope < 0 ? 'decreasing' : 'stable',
      strength: Math.abs(slope),
      confidence: Math.abs(correlation),
      seasonality,
      changePoints,
    };
  }

  /**
   * Detect anomalies in data using statistical methods
   */
  detectAnomalies(data: number[], method: 'zscore' | 'iqr' | 'isolation' = 'zscore'): number[] {
    if (data.length === 0) return [];

    switch (method) {
      case 'zscore':
        return this.detectAnomaliesZScore(data);
      case 'iqr':
        return this.detectAnomaliesIQR(data);
      case 'isolation':
        return this.detectAnomaliesIsolation(data);
      default:
        return this.detectAnomaliesZScore(data);
    }
  }

  /**
   * Calculate confidence interval
   */
  calculateConfidenceInterval(
    data: number[], 
    confidence: number = 0.95
  ): { lower: number; upper: number; margin: number } {
    const stats = this.calculateDescriptiveStats(data);
    const alpha = 1 - confidence;
    const tValue = this.getTValue(alpha / 2, data.length - 1);
    const standardError = stats.stdDev / Math.sqrt(data.length);
    const margin = tValue * standardError;

    return {
      lower: stats.mean - margin,
      upper: stats.mean + margin,
      margin,
    };
  }

  /**
   * Perform hypothesis test (t-test)
   */
  performTTest(
    sample: number[], 
    populationMean: number, 
    alpha: number = 0.05
  ): {
    tStatistic: number;
    pValue: number;
    reject: boolean;
    confidence: number;
  } {
    const stats = this.calculateDescriptiveStats(sample);
    const standardError = stats.stdDev / Math.sqrt(sample.length);
    const tStatistic = (stats.mean - populationMean) / standardError;
    const degreesOfFreedom = sample.length - 1;
    const pValue = this.calculateTTestPValue(Math.abs(tStatistic), degreesOfFreedom);

    return {
      tStatistic,
      pValue,
      reject: pValue < alpha,
      confidence: 1 - pValue,
    };
  }

  /**
   * Calculate entropy for measuring information content
   */
  calculateEntropy(data: any[]): number {
    const frequencies = new Map<any, number>();
    
    // Count frequencies
    for (const item of data) {
      frequencies.set(item, (frequencies.get(item) || 0) + 1);
    }

    const total = data.length;
    let entropy = 0;

    for (const frequency of frequencies.values()) {
      const probability = frequency / total;
      if (probability > 0) {
        entropy -= probability * Math.log2(probability);
      }
    }

    return entropy;
  }

  /**
   * Calculate diversity index (Shannon diversity)
   */
  calculateDiversityIndex(categories: string[]): number {
    return this.calculateEntropy(categories);
  }

  // Private helper methods

  private calculateMean(data: number[]): number {
    if (data.length === 0) return 0;
    return data.reduce((sum, value) => sum + value, 0) / data.length;
  }

  private calculateMedian(sortedData: number[]): number {
    const n = sortedData.length;
    if (n % 2 === 0) {
      return (sortedData[n / 2 - 1] + sortedData[n / 2]) / 2;
    } else {
      return sortedData[Math.floor(n / 2)];
    }
  }

  private calculateMode(data: number[]): number[] {
    const frequencies = new Map<number, number>();
    
    for (const value of data) {
      frequencies.set(value, (frequencies.get(value) || 0) + 1);
    }

    const maxFrequency = Math.max(...frequencies.values());
    return Array.from(frequencies.entries())
      .filter(([_, frequency]) => frequency === maxFrequency)
      .map(([value, _]) => value);
  }

  private calculateVariance(data: number[], mean: number): number {
    return data.reduce((sum, value) => sum + Math.pow(value - mean, 2), 0) / (data.length - 1);
  }

  private calculateQuartiles(sortedData: number[]): { q1: number; q2: number; q3: number } {
    const n = sortedData.length;
    
    return {
      q1: this.calculatePercentile(sortedData, 25),
      q2: this.calculateMedian(sortedData),
      q3: this.calculatePercentile(sortedData, 75),
    };
  }

  private calculatePercentile(sortedData: number[], percentile: number): number {
    const index = (percentile / 100) * (sortedData.length - 1);
    const lower = Math.floor(index);
    const upper = Math.ceil(index);
    
    if (lower === upper) {
      return sortedData[lower];
    }
    
    const weight = index - lower;
    return sortedData[lower] * (1 - weight) + sortedData[upper] * weight;
  }

  private calculatePearsonCorrelation(x: number[], y: number[]): number {
    const n = x.length;
    const sumX = x.reduce((a, b) => a + b, 0);
    const sumY = y.reduce((a, b) => a + b, 0);
    const sumXY = x.reduce((sum, xi, i) => sum + xi * y[i], 0);
    const sumX2 = x.reduce((sum, xi) => sum + xi * xi, 0);
    const sumY2 = y.reduce((sum, yi) => sum + yi * yi, 0);

    const numerator = n * sumXY - sumX * sumY;
    const denominator = Math.sqrt((n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY));

    return denominator === 0 ? 0 : numerator / denominator;
  }

  private calculateLinearRegressionSlope(x: number[], y: number[]): number {
    const n = x.length;
    const sumX = x.reduce((a, b) => a + b, 0);
    const sumY = y.reduce((a, b) => a + b, 0);
    const sumXY = x.reduce((sum, xi, i) => sum + xi * y[i], 0);
    const sumX2 = x.reduce((sum, xi) => sum + xi * xi, 0);

    return (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
  }

  private calculateCorrelationSignificance(r: number, n: number): number {
    const t = r * Math.sqrt((n - 2) / (1 - r * r));
    return this.calculateTTestPValue(Math.abs(t), n - 2);
  }

  private interpretCorrelationStrength(absCorr: number): 'weak' | 'moderate' | 'strong' {
    if (absCorr < 0.3) return 'weak';
    if (absCorr < 0.7) return 'moderate';
    return 'strong';
  }

  private detectSeasonality(data: number[]): boolean {
    // Simple seasonal detection using autocorrelation
    if (data.length < 24) return false; // Need sufficient data

    // Check for patterns at common seasonal periods
    const periods = [7, 24, 30]; // daily, hourly, monthly patterns
    
    for (const period of periods) {
      if (data.length > 2 * period) {
        const correlation = this.calculateAutocorrelation(data, period);
        if (Math.abs(correlation) > 0.3) {
          return true;
        }
      }
    }

    return false;
  }

  private calculateAutocorrelation(data: number[], lag: number): number {
    if (lag >= data.length) return 0;

    const x = data.slice(0, -lag);
    const y = data.slice(lag);
    
    return this.calculatePearsonCorrelation(x, y);
  }

  private detectChangePoints(data: number[]): number[] {
    const changePoints: number[] = [];
    const windowSize = Math.max(5, Math.floor(data.length / 10));
    
    for (let i = windowSize; i < data.length - windowSize; i++) {
      const before = data.slice(i - windowSize, i);
      const after = data.slice(i, i + windowSize);
      
      const beforeMean = this.calculateMean(before);
      const afterMean = this.calculateMean(after);
      const beforeStd = Math.sqrt(this.calculateVariance(before, beforeMean));
      const afterStd = Math.sqrt(this.calculateVariance(after, afterMean));
      
      // Detect significant change in mean
      const tStat = Math.abs(beforeMean - afterMean) / Math.sqrt((beforeStd * beforeStd + afterStd * afterStd) / 2);
      
      if (tStat > 2) { // Threshold for significance
        changePoints.push(i);
      }
    }
    
    return changePoints;
  }

  private detectAnomaliesZScore(data: number[]): number[] {
    const stats = this.calculateDescriptiveStats(data);
    const threshold = 2.5; // Z-score threshold
    
    return data
      .map((value, index) => ({
        index,
        zscore: Math.abs((value - stats.mean) / stats.stdDev),
      }))
      .filter(item => item.zscore > threshold)
      .map(item => item.index);
  }

  private detectAnomaliesIQR(data: number[]): number[] {
    const sorted = [...data].sort((a, b) => a - b);
    const stats = this.calculateDescriptiveStats(data);
    const iqr = stats.quartiles.q3 - stats.quartiles.q1;
    const lowerBound = stats.quartiles.q1 - 1.5 * iqr;
    const upperBound = stats.quartiles.q3 + 1.5 * iqr;
    
    return data
      .map((value, index) => ({ value, index }))
      .filter(item => item.value < lowerBound || item.value > upperBound)
      .map(item => item.index);
  }

  private detectAnomaliesIsolation(data: number[]): number[] {
    // Simplified isolation forest approach
    // In production, you'd want a more sophisticated implementation
    const threshold = -0.5;
    const scores = this.calculateIsolationScores(data);
    
    return scores
      .map((score, index) => ({ score, index }))
      .filter(item => item.score < threshold)
      .map(item => item.index);
  }

  private calculateIsolationScores(data: number[]): number[] {
    // Simplified implementation - in practice use a proper isolation forest
    const mean = this.calculateMean(data);
    const std = Math.sqrt(this.calculateVariance(data, mean));
    
    return data.map(value => {
      const zscore = Math.abs((value - mean) / std);
      return -zscore; // Negative score for anomalies
    });
  }

  private getTValue(alpha: number, degreesOfFreedom: number): number {
    // Simplified t-table lookup - in production use a proper statistical library
    const tTable: Record<string, number> = {
      '0.025': 1.96, // approximation for large df
      '0.05': 1.645,
    };
    
    return tTable[alpha.toString()] || 1.96;
  }

  private calculateTTestPValue(tStat: number, df: number): number {
    // Simplified p-value calculation - in production use a proper statistical library
    // This is a rough approximation
    if (tStat > 3) return 0.001;
    if (tStat > 2.5) return 0.01;
    if (tStat > 2) return 0.05;
    if (tStat > 1.5) return 0.1;
    return 0.2;
  }
}