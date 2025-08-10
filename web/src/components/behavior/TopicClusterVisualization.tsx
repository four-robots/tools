'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { Badge } from '@/components/ui/badge';

interface TopicClusterVisualizationProps {
  userId?: string;
  apiUrl: string;
  dateRange: {
    start: Date;
    end: Date;
  };
}

interface TopicCluster {
  clusterId: string;
  clusterName: string;
  size: number;
  centroid: string[];
  coherenceScore: number;
  topTerms: Array<{
    term: string;
    weight: number;
    frequency: number;
  }>;
  relatedQueries: Array<{
    query: string;
    frequency: number;
    relevanceScore: number;
  }>;
  subClusters?: TopicCluster[];
}

interface ClusterVisualizationData {
  clusters: TopicCluster[];
  totalQueries: number;
  totalClusters: number;
  averageCoherence: number;
  clusterDistribution: Array<{
    size: string;
    count: number;
    percentage: number;
  }>;
}

export const TopicClusterVisualization: React.FC<TopicClusterVisualizationProps> = ({
  userId,
  apiUrl,
  dateRange,
}) => {
  const [loading, setLoading] = useState(true);
  const [clusterData, setClusterData] = useState<ClusterVisualizationData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedCluster, setSelectedCluster] = useState<TopicCluster | null>(null);
  const [viewMode, setViewMode] = useState<'overview' | 'detailed'>('overview');

  useEffect(() => {
    const fetchClusterData = async () => {
      try {
        if (!userId) {
          setLoading(false);
          return;
        }

        const params = new URLSearchParams({
          userId,
          startDate: dateRange.start.toISOString(),
          endDate: dateRange.end.toISOString(),
          includeSubclusters: 'true',
        });

        const response = await fetch(`${apiUrl}/analytics/topic-clusters?${params}`);
        const result = await response.json();
        
        if (result.success) {
          setClusterData(result.data);
        } else {
          setError(result.message || 'Failed to load cluster data');
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to fetch cluster data');
        console.error('Failed to fetch cluster data:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchClusterData();
  }, [userId, apiUrl, dateRange]);

  if (loading) {
    return <LoadingSpinner />;
  }

  if (error) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center h-32">
          <p className="text-red-500 text-sm">{error}</p>
        </CardContent>
      </Card>
    );
  }

  if (!clusterData || clusterData.clusters.length === 0) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center h-32">
          <p className="text-muted-foreground">No topic clusters found. Try searching more to build topic patterns.</p>
        </CardContent>
      </Card>
    );
  }

  const getClusterSizeColor = (size: number) => {
    const maxSize = Math.max(...clusterData.clusters.map(c => c.size));
    const ratio = size / maxSize;
    
    if (ratio >= 0.8) return 'bg-blue-600 text-white';
    if (ratio >= 0.6) return 'bg-blue-500 text-white';
    if (ratio >= 0.4) return 'bg-blue-400 text-white';
    if (ratio >= 0.2) return 'bg-blue-300 text-blue-900';
    return 'bg-blue-100 text-blue-800';
  };

  const getCoherenceColor = (score: number) => {
    if (score >= 0.8) return 'text-green-600';
    if (score >= 0.6) return 'text-yellow-600';
    return 'text-red-600';
  };

  const renderOverviewMode = () => (
    <div className="space-y-6">
      {/* Summary Stats */}
      <div className="grid gap-4 md:grid-cols-4">
        <div className="text-center">
          <div className="text-2xl font-bold">{clusterData.totalClusters}</div>
          <div className="text-xs text-muted-foreground">Topic Clusters</div>
        </div>
        <div className="text-center">
          <div className="text-2xl font-bold">{clusterData.totalQueries}</div>
          <div className="text-xs text-muted-foreground">Total Queries</div>
        </div>
        <div className="text-center">
          <div className="text-2xl font-bold">
            {Math.round(clusterData.averageCoherence * 100)}%
          </div>
          <div className="text-xs text-muted-foreground">Avg Coherence</div>
        </div>
        <div className="text-center">
          <div className="text-2xl font-bold">
            {Math.round(clusterData.clusters.reduce((sum, c) => sum + c.size, 0) / clusterData.clusters.length)}
          </div>
          <div className="text-xs text-muted-foreground">Avg Cluster Size</div>
        </div>
      </div>

      {/* Cluster Grid Visualization */}
      <div>
        <h3 className="text-lg font-medium mb-4">Topic Clusters</h3>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {clusterData.clusters.map((cluster) => (
            <div
              key={cluster.clusterId}
              className={`p-4 rounded-lg border cursor-pointer transition-all hover:shadow-md ${
                selectedCluster?.clusterId === cluster.clusterId 
                  ? 'border-blue-500 bg-blue-50' 
                  : 'border-gray-200 hover:border-gray-300'
              }`}
              onClick={() => {
                setSelectedCluster(cluster);
                setViewMode('detailed');
              }}
            >
              <div className="flex items-start justify-between mb-2">
                <h4 className="font-medium text-sm truncate flex-1 pr-2">
                  {cluster.clusterName}
                </h4>
                <Badge 
                  variant="secondary" 
                  className={`text-xs ${getClusterSizeColor(cluster.size)}`}
                >
                  {cluster.size}
                </Badge>
              </div>
              
              <div className="space-y-2">
                <div className="flex flex-wrap gap-1">
                  {cluster.topTerms.slice(0, 3).map((term) => (
                    <Badge key={term.term} variant="outline" className="text-xs">
                      {term.term}
                    </Badge>
                  ))}
                  {cluster.topTerms.length > 3 && (
                    <Badge variant="outline" className="text-xs">
                      +{cluster.topTerms.length - 3}
                    </Badge>
                  )}
                </div>
                
                <div className="flex justify-between items-center text-xs">
                  <span className="text-muted-foreground">
                    {cluster.relatedQueries.length} queries
                  </span>
                  <span className={`font-medium ${getCoherenceColor(cluster.coherenceScore)}`}>
                    {Math.round(cluster.coherenceScore * 100)}% coherent
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Cluster Size Distribution */}
      <div>
        <h3 className="text-lg font-medium mb-4">Cluster Size Distribution</h3>
        <div className="space-y-2">
          {clusterData.clusterDistribution.map((dist) => (
            <div key={dist.size} className="flex items-center justify-between">
              <span className="text-sm capitalize">{dist.size} clusters</span>
              <div className="flex items-center gap-2">
                <div className="w-32 bg-gray-200 rounded-full h-2">
                  <div 
                    className="bg-blue-500 h-2 rounded-full"
                    style={{ width: `${dist.percentage}%` }}
                  ></div>
                </div>
                <span className="text-sm font-medium w-12 text-right">
                  {dist.count}
                </span>
                <span className="text-xs text-muted-foreground w-12 text-right">
                  {dist.percentage}%
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  const renderDetailedMode = () => {
    if (!selectedCluster) return null;

    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-medium">
            {selectedCluster.clusterName}
          </h3>
          <div className="flex items-center gap-2">
            <Badge 
              variant="secondary"
              className={getClusterSizeColor(selectedCluster.size)}
            >
              {selectedCluster.size} queries
            </Badge>
            <button
              onClick={() => {
                setViewMode('overview');
                setSelectedCluster(null);
              }}
              className="text-sm text-blue-600 hover:underline"
            >
              ← Back to overview
            </button>
          </div>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          {/* Top Terms */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Key Terms</CardTitle>
              <CardDescription>
                Most important terms in this topic cluster
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {selectedCluster.topTerms.map((term, index) => (
                  <div key={term.term} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-xs w-6 justify-center">
                        {index + 1}
                      </Badge>
                      <span className="text-sm font-medium">{term.term}</span>
                    </div>
                    <div className="text-right">
                      <div className="text-sm">
                        Weight: {Math.round(term.weight * 100)}%
                      </div>
                      <div className="text-xs text-muted-foreground">
                        Used {term.frequency} times
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Related Queries */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Related Queries</CardTitle>
              <CardDescription>
                Queries that belong to this topic cluster
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {selectedCluster.relatedQueries.slice(0, 8).map((query, index) => (
                  <div key={query.query} className="flex items-start justify-between">
                    <div className="flex-1 pr-2">
                      <div className="text-sm">{query.query}</div>
                      <div className="text-xs text-muted-foreground">
                        Relevance: {Math.round(query.relevanceScore * 100)}%
                      </div>
                    </div>
                    <Badge variant="outline" className="text-xs">
                      {query.frequency}x
                    </Badge>
                  </div>
                ))}
                {selectedCluster.relatedQueries.length > 8 && (
                  <div className="text-xs text-muted-foreground text-center pt-2">
                    + {selectedCluster.relatedQueries.length - 8} more queries
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Cluster Metrics */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Cluster Metrics</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-3">
              <div>
                <div className="text-sm text-muted-foreground">Coherence Score</div>
                <div className={`text-2xl font-bold ${getCoherenceColor(selectedCluster.coherenceScore)}`}>
                  {Math.round(selectedCluster.coherenceScore * 100)}%
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2 mt-1">
                  <div 
                    className="bg-blue-500 h-2 rounded-full"
                    style={{ width: `${selectedCluster.coherenceScore * 100}%` }}
                  ></div>
                </div>
              </div>
              
              <div>
                <div className="text-sm text-muted-foreground">Unique Terms</div>
                <div className="text-2xl font-bold">{selectedCluster.topTerms.length}</div>
              </div>
              
              <div>
                <div className="text-sm text-muted-foreground">Query Coverage</div>
                <div className="text-2xl font-bold">
                  {Math.round((selectedCluster.size / clusterData.totalQueries) * 100)}%
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Sub-clusters if available */}
        {selectedCluster.subClusters && selectedCluster.subClusters.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Sub-clusters</CardTitle>
              <CardDescription>
                More specific topics within this cluster
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-2 sm:grid-cols-2">
                {selectedCluster.subClusters.map((subCluster) => (
                  <div key={subCluster.clusterId} className="border rounded p-3">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium">{subCluster.clusterName}</span>
                      <Badge variant="outline" className="text-xs">
                        {subCluster.size}
                      </Badge>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {subCluster.topTerms.slice(0, 3).map((term) => (
                        <Badge key={term.term} variant="secondary" className="text-xs">
                          {term.term}
                        </Badge>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    );
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Topic Cluster Visualization</CardTitle>
        <CardDescription>
          Analysis of your search topics and how they cluster together
        </CardDescription>
      </CardHeader>
      <CardContent>
        {viewMode === 'overview' ? renderOverviewMode() : renderDetailedMode()}
      </CardContent>
    </Card>
  );
};