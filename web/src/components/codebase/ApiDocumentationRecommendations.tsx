import React, { useState, useEffect } from 'react';
import { 
  CheckIcon, 
  XMarkIcon, 
  ClockIcon, 
  DocumentTextIcon,
  ArrowTopRightOnSquareIcon,
  ChartBarIcon,
  PlayIcon,
  FunnelIcon
} from '@heroicons/react/24/outline';

// Types for API documentation recommendations
interface APIDocumentationRecommendation {
  id: string;
  packageName: string;
  packageVersion: string;
  language: string;
  documentationUrl: string;
  apiReferenceUrl?: string;
  examplesUrl?: string;
  changelogUrl?: string;
  repositoryUrl?: string;
  healthScore: number;
  relevanceScore: number;
  recommendationReason: string;
  usageConfidence: number;
  fileReferences: string[];
  estimatedIndexingTime: number;
  estimatedStorageSize: number;
}

interface ApiDocumentationRecommendationsProps {
  repositoryId: string;
}

export function ApiDocumentationRecommendations({ 
  repositoryId 
}: ApiDocumentationRecommendationsProps) {
  const [recommendations, setRecommendations] = useState<APIDocumentationRecommendation[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [filter, setFilter] = useState<'all' | 'high-confidence' | 'direct-deps'>('all');
  const [sortBy, setSortBy] = useState<'confidence' | 'health' | 'relevance'>('confidence');
  const [stats, setStats] = useState({
    totalRecommendations: 0,
    highConfidence: 0,
    estimatedIndexingTime: 0,
    estimatedStorageSize: 0
  });

  useEffect(() => {
    loadRecommendations();
  }, [repositoryId, filter, sortBy]);

  const loadRecommendations = async () => {
    setLoading(true);
    try {
      const response = await fetch(
        `/api/repositories/${repositoryId}/api-documentation-recommendations?filter=${filter}&sort=${sortBy}`
      );
      const data = await response.json();
      setRecommendations(data.recommendations);
      setStats(data.stats);
    } catch (error) {
      console.error('Failed to load API documentation recommendations:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAnalyzeRepository = async () => {
    setProcessing(true);
    try {
      const response = await fetch(
        `/api/repositories/${repositoryId}/api-documentation-recommendations/analyze`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ecosystems: ['npm', 'pypi', 'docs.rs', 'golang.org', 'maven', 'nuget'],
            minConfidence: 0.5,
            maxRecommendations: 100
          })
        }
      );
      
      if (response.ok) {
        await loadRecommendations();
      }
    } catch (error) {
      console.error('Failed to analyze repository:', error);
    } finally {
      setProcessing(false);
    }
  };

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedIds(new Set(recommendations.map(r => r.id)));
    } else {
      setSelectedIds(new Set());
    }
  };

  const handleApprove = async (recommendationIds: string[]) => {
    try {
      const response = await fetch(
        `/api/repositories/${repositoryId}/api-documentation-recommendations/approve`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ recommendationIds })
        }
      );
      
      if (response.ok) {
        await loadRecommendations();
      }
    } catch (error) {
      console.error('Failed to approve recommendations:', error);
    }
  };

  const handleReject = async (recommendationIds: string[]) => {
    try {
      const response = await fetch(
        `/api/repositories/${repositoryId}/api-documentation-recommendations/reject`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ recommendationIds })
        }
      );
      
      if (response.ok) {
        await loadRecommendations();
      }
    } catch (error) {
      console.error('Failed to reject recommendations:', error);
    }
  };

  const handleApproveSelected = async () => {
    if (selectedIds.size === 0) return;
    await handleApprove(Array.from(selectedIds));
    setSelectedIds(new Set());
  };

  const handleRejectSelected = async () => {
    if (selectedIds.size === 0) return;
    await handleReject(Array.from(selectedIds));
    setSelectedIds(new Set());
  };

  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 0.8) return 'text-green-600 bg-green-50';
    if (confidence >= 0.6) return 'text-yellow-600 bg-yellow-50';
    return 'text-red-600 bg-red-50';
  };

  const getHealthScoreColor = (score: number) => {
    if (score >= 80) return 'text-green-600';
    if (score >= 60) return 'text-yellow-600';
    return 'text-red-600';
  };

  const filteredRecommendations = recommendations.filter(rec => {
    switch (filter) {
      case 'high-confidence':
        return rec.usageConfidence >= 0.7;
      case 'direct-deps':
        return rec.recommendationReason.includes('Direct dependency');
      default:
        return true;
    }
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">
            API Documentation Recommendations
          </h2>
          <p className="mt-1 text-sm text-gray-600">
            Discover and index relevant API documentation based on your project dependencies
          </p>
        </div>
        <div className="flex items-center space-x-4">
          <button
            onClick={handleAnalyzeRepository}
            disabled={processing}
            className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
          >
            <PlayIcon className="h-4 w-4 mr-2" />
            {processing ? 'Analyzing...' : 'Analyze Repository'}
          </button>
          
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value as any)}
            className="block w-48 pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm rounded-md"
          >
            <option value="all">All Recommendations</option>
            <option value="high-confidence">High Confidence</option>
            <option value="direct-deps">Direct Dependencies</option>
          </select>
          
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as any)}
            className="block w-40 pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm rounded-md"
          >
            <option value="confidence">Sort by Confidence</option>
            <option value="health">Sort by Health Score</option>
            <option value="relevance">Sort by Relevance</option>
          </select>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white overflow-hidden shadow rounded-lg">
          <div className="p-5">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <DocumentTextIcon className="h-6 w-6 text-blue-600" />
              </div>
              <div className="ml-5 w-0 flex-1">
                <dl>
                  <dt className="text-sm font-medium text-gray-500 truncate">
                    Total Recommendations
                  </dt>
                  <dd className="text-lg font-medium text-gray-900">
                    {stats.totalRecommendations}
                  </dd>
                </dl>
              </div>
            </div>
          </div>
        </div>
        
        <div className="bg-white overflow-hidden shadow rounded-lg">
          <div className="p-5">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <CheckIcon className="h-6 w-6 text-green-600" />
              </div>
              <div className="ml-5 w-0 flex-1">
                <dl>
                  <dt className="text-sm font-medium text-gray-500 truncate">
                    High Confidence
                  </dt>
                  <dd className="text-lg font-medium text-gray-900">
                    {stats.highConfidence}
                  </dd>
                </dl>
              </div>
            </div>
          </div>
        </div>
        
        <div className="bg-white overflow-hidden shadow rounded-lg">
          <div className="p-5">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <ClockIcon className="h-6 w-6 text-yellow-600" />
              </div>
              <div className="ml-5 w-0 flex-1">
                <dl>
                  <dt className="text-sm font-medium text-gray-500 truncate">
                    Est. Indexing Time
                  </dt>
                  <dd className="text-lg font-medium text-gray-900">
                    {Math.round(stats.estimatedIndexingTime)}m
                  </dd>
                </dl>
              </div>
            </div>
          </div>
        </div>
        
        <div className="bg-white overflow-hidden shadow rounded-lg">
          <div className="p-5">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <ChartBarIcon className="h-6 w-6 text-purple-600" />
              </div>
              <div className="ml-5 w-0 flex-1">
                <dl>
                  <dt className="text-sm font-medium text-gray-500 truncate">
                    Est. Storage
                  </dt>
                  <dd className="text-lg font-medium text-gray-900">
                    {Math.round(stats.estimatedStorageSize)}MB
                  </dd>
                </dl>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Bulk Actions */}
      {selectedIds.size > 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-blue-900">
              {selectedIds.size} recommendation{selectedIds.size > 1 ? 's' : ''} selected
            </span>
            <div className="flex space-x-3">
              <button
                onClick={handleApproveSelected}
                className="inline-flex items-center px-3 py-1.5 border border-transparent text-xs font-medium rounded text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500"
              >
                <CheckIcon className="h-4 w-4 mr-1" />
                Approve & Index
              </button>
              <button
                onClick={handleRejectSelected}
                className="inline-flex items-center px-3 py-1.5 border border-transparent text-xs font-medium rounded text-white bg-red-600 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
              >
                <XMarkIcon className="h-4 w-4 mr-1" />
                Reject
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Recommendations Table */}
      <div className="bg-white shadow overflow-hidden sm:rounded-md">
        {filteredRecommendations.length === 0 ? (
          <div className="text-center py-12">
            <DocumentTextIcon className="mx-auto h-12 w-12 text-gray-400" />
            <h3 className="mt-2 text-sm font-medium text-gray-900">No recommendations found</h3>
            <p className="mt-1 text-sm text-gray-500">
              Try analyzing the repository or adjusting your filters.
            </p>
            <div className="mt-6">
              <button
                onClick={handleAnalyzeRepository}
                disabled={processing}
                className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
              >
                <PlayIcon className="h-4 w-4 mr-2" />
                {processing ? 'Analyzing...' : 'Analyze Repository'}
              </button>
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    <input
                      type="checkbox"
                      checked={selectedIds.size === filteredRecommendations.length && filteredRecommendations.length > 0}
                      onChange={(e) => handleSelectAll(e.target.checked)}
                      className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                    />
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Package
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Confidence
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Health Score
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Documentation
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Impact
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredRecommendations.map((recommendation) => (
                  <tr key={recommendation.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(recommendation.id)}
                        onChange={(e) => {
                          const newSelected = new Set(selectedIds);
                          if (e.target.checked) {
                            newSelected.add(recommendation.id);
                          } else {
                            newSelected.delete(recommendation.id);
                          }
                          setSelectedIds(newSelected);
                        }}
                        className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                      />
                    </td>
                    
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <div>
                          <div className="text-sm font-medium text-gray-900">
                            {recommendation.packageName}
                          </div>
                          <div className="text-sm text-gray-500">
                            v{recommendation.packageVersion} • {recommendation.language}
                          </div>
                        </div>
                      </div>
                    </td>
                    
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getConfidenceColor(recommendation.usageConfidence)}`}>
                        {Math.round(recommendation.usageConfidence * 100)}%
                      </span>
                    </td>
                    
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`text-sm font-medium ${getHealthScoreColor(recommendation.healthScore)}`}>
                        {recommendation.healthScore}/100
                      </span>
                    </td>
                    
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center space-x-2">
                        <a
                          href={recommendation.documentationUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-600 hover:text-blue-800 text-sm flex items-center"
                        >
                          Documentation
                          <ArrowTopRightOnSquareIcon className="h-3 w-3 ml-1" />
                        </a>
                        {recommendation.apiReferenceUrl && (
                          <>
                            <span className="text-gray-300">•</span>
                            <a
                              href={recommendation.apiReferenceUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-blue-600 hover:text-blue-800 text-sm flex items-center"
                            >
                              API Reference
                              <ArrowTopRightOnSquareIcon className="h-3 w-3 ml-1" />
                            </a>
                          </>
                        )}
                      </div>
                    </td>
                    
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      <div>
                        {recommendation.estimatedIndexingTime}min • {recommendation.estimatedStorageSize}MB
                      </div>
                      <div className="text-xs">
                        {recommendation.fileReferences.length} files
                      </div>
                    </td>
                    
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium space-x-2">
                      <button
                        onClick={() => handleApprove([recommendation.id])}
                        className="text-green-600 hover:text-green-900"
                        title="Approve and index this documentation"
                      >
                        <CheckIcon className="h-5 w-5" />
                      </button>
                      <button
                        onClick={() => handleReject([recommendation.id])}
                        className="text-red-600 hover:text-red-900"
                        title="Reject this recommendation"
                      >
                        <XMarkIcon className="h-5 w-5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}