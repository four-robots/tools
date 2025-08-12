'use client';

import React, { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Alert } from '@/components/ui/alert';
import { 
  Download,
  Upload,
  RefreshCw,
  Check,
  X,
  AlertTriangle,
  Clock,
  FileText,
  FileImage,
  Archive,
  Pause,
  Play,
  Trash2,
  Eye
} from 'lucide-react';

/**
 * Processing job types
 */
export interface ProcessingJob {
  id: string;
  type: 'export' | 'import' | 'batch_export' | 'batch_import';
  whiteboardId?: string;
  whiteboardName?: string;
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';
  progress: number;
  format?: string;
  filename?: string;
  downloadUrl?: string;
  fileSize?: number;
  elementsCreated?: string[];
  warnings?: string[];
  errorMessage?: string;
  createdAt: string;
  updatedAt: string;
  estimatedTimeRemaining?: number;
  processingRate?: number;
}

interface ProcessingStatusProps {
  userId: string;
  onJobComplete?: (jobId: string) => void;
  onJobError?: (jobId: string, error: string) => void;
  className?: string;
}

const JOB_TYPE_CONFIGS = {
  export: {
    name: 'Export',
    icon: Download,
    color: 'blue',
  },
  import: {
    name: 'Import',
    icon: Upload,
    color: 'green',
  },
  batch_export: {
    name: 'Batch Export',
    icon: Archive,
    color: 'purple',
  },
  batch_import: {
    name: 'Batch Import',
    icon: Archive,
    color: 'orange',
  },
};

const STATUS_CONFIGS = {
  pending: {
    name: 'Pending',
    icon: Clock,
    color: 'yellow',
    description: 'Waiting to start',
  },
  processing: {
    name: 'Processing',
    icon: RefreshCw,
    color: 'blue',
    description: 'Currently processing',
    animate: true,
  },
  completed: {
    name: 'Completed',
    icon: Check,
    color: 'green',
    description: 'Successfully completed',
  },
  failed: {
    name: 'Failed',
    icon: X,
    color: 'red',
    description: 'Processing failed',
  },
  cancelled: {
    name: 'Cancelled',
    icon: AlertTriangle,
    color: 'gray',
    description: 'Cancelled by user',
  },
};

export function ProcessingStatus({ 
  userId, 
  onJobComplete, 
  onJobError, 
  className = '' 
}: ProcessingStatusProps) {
  const [jobs, setJobs] = useState<ProcessingJob[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'active' | 'completed' | 'failed'>('all');
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Fetch jobs on mount and set up polling for active jobs
  useEffect(() => {
    fetchJobs();
    
    // Set up polling interval for active jobs
    const pollInterval = setInterval(() => {
      const hasActiveJobs = jobs.some(job => 
        job.status === 'pending' || job.status === 'processing'
      );
      
      if (hasActiveJobs) {
        fetchJobs(false); // Don't show loading for polls
      }
    }, 2000);

    return () => clearInterval(pollInterval);
  }, [userId, jobs.length]);

  const fetchJobs = async (showLoading = true) => {
    try {
      if (showLoading) {
        setIsLoading(true);
      }

      const response = await fetch(`/api/users/${userId}/jobs?limit=50`);
      if (!response.ok) {
        throw new Error('Failed to fetch jobs');
      }

      const data = await response.json();
      const previousJobs = jobs.reduce((acc, job) => {
        acc[job.id] = job;
        return acc;
      }, {} as Record<string, ProcessingJob>);

      setJobs(data.jobs);

      // Check for newly completed or failed jobs
      data.jobs.forEach((job: ProcessingJob) => {
        const previousJob = previousJobs[job.id];
        
        if (previousJob) {
          // Job completed
          if (previousJob.status !== 'completed' && job.status === 'completed') {
            if (onJobComplete) {
              onJobComplete(job.id);
            }
          }
          
          // Job failed
          if (previousJob.status !== 'failed' && job.status === 'failed') {
            if (onJobError) {
              onJobError(job.id, job.errorMessage || 'Processing failed');
            }
          }
        }
      });

    } catch (error) {
      console.error('Failed to fetch jobs:', error);
    } finally {
      if (showLoading) {
        setIsLoading(false);
      }
    }
  };

  const refreshJobs = async () => {
    setIsRefreshing(true);
    await fetchJobs();
    setIsRefreshing(false);
  };

  const cancelJob = async (jobId: string) => {
    try {
      const response = await fetch(`/api/jobs/${jobId}/cancel`, {
        method: 'POST',
      });

      if (!response.ok) {
        throw new Error('Failed to cancel job');
      }

      // Refresh jobs to get updated status
      fetchJobs(false);
    } catch (error) {
      console.error('Failed to cancel job:', error);
    }
  };

  const deleteJob = async (jobId: string) => {
    try {
      const response = await fetch(`/api/jobs/${jobId}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        throw new Error('Failed to delete job');
      }

      // Remove job from local state
      setJobs(prev => prev.filter(job => job.id !== jobId));
    } catch (error) {
      console.error('Failed to delete job:', error);
    }
  };

  const downloadFile = (job: ProcessingJob) => {
    if (job.downloadUrl) {
      window.open(job.downloadUrl, '_blank');
    }
  };

  const formatFileSize = (bytes?: number) => {
    if (!bytes) return '';
    const units = ['B', 'KB', 'MB', 'GB'];
    let size = bytes;
    let unitIndex = 0;
    
    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }
    
    return `${size.toFixed(1)} ${units[unitIndex]}`;
  };

  const formatTimeRemaining = (ms?: number) => {
    if (!ms) return '';
    
    if (ms < 60000) {
      return `${Math.round(ms / 1000)}s`;
    } else if (ms < 3600000) {
      return `${Math.round(ms / 60000)}m`;
    } else {
      return `${Math.round(ms / 3600000)}h`;
    }
  };

  const formatProcessingRate = (rate?: number) => {
    if (!rate) return '';
    return `${rate.toFixed(1)}/min`;
  };

  const getFilteredJobs = () => {
    switch (filter) {
      case 'active':
        return jobs.filter(job => job.status === 'pending' || job.status === 'processing');
      case 'completed':
        return jobs.filter(job => job.status === 'completed');
      case 'failed':
        return jobs.filter(job => job.status === 'failed' || job.status === 'cancelled');
      default:
        return jobs;
    }
  };

  const filteredJobs = getFilteredJobs();
  const activeJobsCount = jobs.filter(job => 
    job.status === 'pending' || job.status === 'processing'
  ).length;

  if (isLoading) {
    return (
      <Card className={`p-6 ${className}`}>
        <div className="flex items-center justify-center">
          <RefreshCw className="h-6 w-6 text-gray-400 animate-spin mr-2" />
          <span className="text-gray-600">Loading processing status...</span>
        </div>
      </Card>
    );
  }

  return (
    <Card className={`${className}`}>
      {/* Header */}
      <div className="p-4 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h3 className="text-lg font-medium text-gray-900">Processing Status</h3>
            {activeJobsCount > 0 && (
              <Badge variant="secondary" size="sm">
                {activeJobsCount} active
              </Badge>
            )}
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={refreshJobs}
            disabled={isRefreshing}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${isRefreshing ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>

        {/* Filter Tabs */}
        <div className="flex space-x-1 mt-3">
          {(['all', 'active', 'completed', 'failed'] as const).map((filterType) => (
            <button
              key={filterType}
              onClick={() => setFilter(filterType)}
              className={`px-3 py-1 text-sm rounded-md transition-colors ${
                filter === filterType
                  ? 'bg-blue-100 text-blue-700'
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              {filterType.charAt(0).toUpperCase() + filterType.slice(1)}
              {filterType === 'active' && activeJobsCount > 0 && (
                <span className="ml-1 text-xs">({activeJobsCount})</span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Jobs List */}
      <div className="divide-y divide-gray-200">
        {filteredJobs.length === 0 ? (
          <div className="p-6 text-center text-gray-500">
            <FileText className="h-12 w-12 mx-auto mb-2 text-gray-300" />
            <p className="text-lg font-medium">No {filter !== 'all' ? filter : ''} jobs</p>
            <p className="text-sm">
              {filter === 'active' 
                ? 'No active processing jobs at the moment.'
                : 'Processing jobs will appear here.'
              }
            </p>
          </div>
        ) : (
          filteredJobs.map((job) => {
            const jobConfig = JOB_TYPE_CONFIGS[job.type];
            const statusConfig = STATUS_CONFIGS[job.status];
            const JobIcon = jobConfig.icon;
            const StatusIcon = statusConfig.icon;

            return (
              <div key={job.id} className="p-4">
                <div className="flex items-start gap-4">
                  {/* Job Icon */}
                  <div className={`p-2 rounded-lg bg-${jobConfig.color}-50`}>
                    <JobIcon className={`h-5 w-5 text-${jobConfig.color}-600`} />
                  </div>

                  {/* Job Details */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-2">
                      <h4 className="font-medium text-gray-900 truncate">
                        {jobConfig.name}
                        {job.whiteboardName && (
                          <span className="text-gray-600"> • {job.whiteboardName}</span>
                        )}
                      </h4>
                      <Badge
                        variant={statusConfig.color as any}
                        size="sm"
                        className="flex items-center gap-1"
                      >
                        <StatusIcon 
                          className={`h-3 w-3 ${
                            statusConfig.animate ? 'animate-spin' : ''
                          }`} 
                        />
                        {statusConfig.name}
                      </Badge>
                    </div>

                    {/* Progress Bar */}
                    {job.status === 'processing' && (
                      <div className="mb-3">
                        <Progress value={job.progress} className="h-2" />
                        <div className="flex justify-between items-center mt-1 text-xs text-gray-600">
                          <span>{job.progress}% complete</span>
                          <div className="flex items-center gap-2">
                            {job.estimatedTimeRemaining && (
                              <span>{formatTimeRemaining(job.estimatedTimeRemaining)} remaining</span>
                            )}
                            {job.processingRate && (
                              <span>{formatProcessingRate(job.processingRate)}</span>
                            )}
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Job Info */}
                    <div className="flex items-center gap-4 text-sm text-gray-600 mb-2">
                      {job.format && (
                        <span>Format: {job.format.toUpperCase()}</span>
                      )}
                      {job.fileSize && (
                        <span>Size: {formatFileSize(job.fileSize)}</span>
                      )}
                      {job.elementsCreated && job.elementsCreated.length > 0 && (
                        <span>Elements: {job.elementsCreated.length}</span>
                      )}
                      <span>
                        {new Date(job.createdAt).toLocaleString()}
                      </span>
                    </div>

                    {/* Warnings */}
                    {job.warnings && job.warnings.length > 0 && (
                      <Alert className="mb-2 border-yellow-200 bg-yellow-50">
                        <AlertTriangle className="h-4 w-4 text-yellow-600" />
                        <div className="ml-2">
                          <p className="text-sm font-medium text-yellow-800">
                            Completed with {job.warnings.length} warning(s)
                          </p>
                          {job.warnings.slice(0, 2).map((warning, index) => (
                            <p key={index} className="text-xs text-yellow-600 mt-1">
                              • {warning}
                            </p>
                          ))}
                          {job.warnings.length > 2 && (
                            <p className="text-xs text-yellow-600 mt-1">
                              +{job.warnings.length - 2} more warnings
                            </p>
                          )}
                        </div>
                      </Alert>
                    )}

                    {/* Error Message */}
                    {job.status === 'failed' && job.errorMessage && (
                      <Alert className="mb-2 border-red-200 bg-red-50">
                        <X className="h-4 w-4 text-red-600" />
                        <div className="ml-2">
                          <p className="text-sm font-medium text-red-800">Error</p>
                          <p className="text-xs text-red-600 mt-1">{job.errorMessage}</p>
                        </div>
                      </Alert>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2">
                    {job.status === 'completed' && job.downloadUrl && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => downloadFile(job)}
                      >
                        <Download className="h-4 w-4" />
                      </Button>
                    )}

                    {(job.status === 'pending' || job.status === 'processing') && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => cancelJob(job.id)}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    )}

                    {(job.status === 'completed' || job.status === 'failed' || job.status === 'cancelled') && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => deleteJob(job.id)}
                        className="text-gray-400 hover:text-red-600"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </Card>
  );
}