'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Dialog } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Tabs } from '@/components/ui/tabs';
import { Card } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Alert } from '@/components/ui/alert';
import { 
  Download, 
  FileImage, 
  FileText, 
  Archive,
  Settings,
  Eye,
  AlertTriangle,
  Check,
  X,
  RefreshCw
} from 'lucide-react';

/**
 * Export format types and options
 */
export type ExportFormat = 'pdf' | 'png' | 'jpeg' | 'svg' | 'json' | 'markdown' | 'zip';

export interface ExportOptions {
  format: ExportFormat;
  quality?: 'low' | 'medium' | 'high' | 'ultra';
  scale?: number;
  paperSize?: 'A4' | 'A3' | 'A5' | 'Letter' | 'Legal' | 'Custom';
  orientation?: 'portrait' | 'landscape';
  includeComments?: boolean;
  includeMetadata?: boolean;
  backgroundTransparent?: boolean;
  customFilename?: string;
}

export interface ExportJob {
  id: string;
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';
  progress: number;
  format: ExportFormat;
  downloadUrl?: string;
  fileSize?: number;
  errorMessage?: string;
  createdAt: string;
  estimatedTimeRemaining?: number;
}

interface ExportDialogProps {
  isOpen: boolean;
  onClose: () => void;
  whiteboardId: string;
  whiteboardName: string;
  onExportStart?: (jobId: string) => void;
  onExportComplete?: (jobId: string, downloadUrl: string) => void;
  onExportError?: (error: string) => void;
}

const FORMAT_CONFIGS = {
  pdf: {
    name: 'PDF Document',
    icon: FileText,
    description: 'Vector-based document with scalable graphics',
    extension: 'pdf',
    category: 'document',
    options: ['paperSize', 'orientation', 'includeMetadata'],
  },
  png: {
    name: 'PNG Image',
    icon: FileImage,
    description: 'High-quality raster image with transparency',
    extension: 'png',
    category: 'image',
    options: ['quality', 'scale', 'backgroundTransparent'],
  },
  jpeg: {
    name: 'JPEG Image',
    icon: FileImage,
    description: 'Compressed raster image, smaller file size',
    extension: 'jpg',
    category: 'image',
    options: ['quality', 'scale'],
  },
  svg: {
    name: 'SVG Vector',
    icon: FileImage,
    description: 'Scalable vector graphics, web-friendly',
    extension: 'svg',
    category: 'image',
    options: ['backgroundTransparent'],
  },
  json: {
    name: 'JSON Data',
    icon: FileText,
    description: 'Complete whiteboard data for backup/migration',
    extension: 'json',
    category: 'data',
    options: ['includeComments', 'includeMetadata'],
  },
  markdown: {
    name: 'Markdown Document',
    icon: FileText,
    description: 'Text-based documentation format',
    extension: 'md',
    category: 'document',
    options: ['includeComments', 'includeMetadata'],
  },
  zip: {
    name: 'ZIP Archive',
    icon: Archive,
    description: 'Multiple formats in a compressed archive',
    extension: 'zip',
    category: 'archive',
    options: ['includeComments', 'includeMetadata'],
  },
};

export function ExportDialog({ 
  isOpen, 
  onClose, 
  whiteboardId, 
  whiteboardName,
  onExportStart,
  onExportComplete,
  onExportError 
}: ExportDialogProps) {
  const [selectedFormat, setSelectedFormat] = useState<ExportFormat>('png');
  const [options, setOptions] = useState<ExportOptions>({
    format: 'png',
    quality: 'high',
    scale: 1,
    paperSize: 'A4',
    orientation: 'portrait',
    includeComments: true,
    includeMetadata: true,
    backgroundTransparent: true,
  });
  const [filename, setFilename] = useState('');
  const [activeTab, setActiveTab] = useState('format');
  const [currentJob, setCurrentJob] = useState<ExportJob | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const pollCleanupRef = useRef<(() => void) | null>(null);

  // Cleanup polling interval on unmount
  useEffect(() => {
    return () => {
      if (pollCleanupRef.current) {
        pollCleanupRef.current();
      }
    };
  }, []);

  // Initialize filename based on whiteboard name
  useEffect(() => {
    if (whiteboardName && !filename) {
      const sanitized = whiteboardName.replace(/[^a-zA-Z0-9-_\s]/g, '').replace(/\s+/g, '_');
      setFilename(sanitized);
    }
  }, [whiteboardName, filename]);

  // Update options when format changes
  useEffect(() => {
    setOptions(prev => ({ ...prev, format: selectedFormat }));
  }, [selectedFormat]);

  const handleFormatSelect = (format: ExportFormat) => {
    setSelectedFormat(format);
    setActiveTab('options');
  };

  const handleOptionChange = (key: keyof ExportOptions, value: any) => {
    setOptions(prev => ({ ...prev, [key]: value }));
  };

  const generatePreview = async () => {
    try {
      // Mock preview generation - in real implementation, call API
      setPreview('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==');
    } catch (error) {
      console.error('Failed to generate preview:', error);
    }
  };

  const startExport = async () => {
    try {
      setIsExporting(true);
      
      // Create export job
      const jobResponse = await fetch('/api/whiteboards/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          whiteboardId,
          format: selectedFormat,
          options,
          filename: filename || undefined,
        }),
      });

      if (!jobResponse.ok) {
        throw new Error('Failed to start export');
      }

      const job: ExportJob = await jobResponse.json();
      setCurrentJob(job);
      
      if (onExportStart) {
        onExportStart(job.id);
      }

      // Poll for job status
      pollCleanupRef.current = pollJobStatus(job.id);

    } catch (error) {
      setIsExporting(false);
      const errorMessage = error instanceof Error ? error.message : 'Export failed';
      if (onExportError) {
        onExportError(errorMessage);
      }
    }
  };

  const pollJobStatus = (jobId: string): (() => void) => {
    const pollInterval = setInterval(async () => {
      try {
        const response = await fetch(`/api/whiteboards/export/${jobId}`);
        if (!response.ok) {
          throw new Error('Failed to get job status');
        }

        const job: ExportJob = await response.json();
        setCurrentJob(job);

        if (job.status === 'completed' && job.downloadUrl) {
          clearInterval(pollInterval);
          pollCleanupRef.current = null;
          setIsExporting(false);

          if (onExportComplete) {
            onExportComplete(job.id, job.downloadUrl);
          }
        } else if (job.status === 'failed') {
          clearInterval(pollInterval);
          pollCleanupRef.current = null;
          setIsExporting(false);

          if (onExportError) {
            onExportError(job.errorMessage || 'Export failed');
          }
        }
      } catch (error) {
        clearInterval(pollInterval);
        pollCleanupRef.current = null;
        setIsExporting(false);

        if (onExportError) {
          onExportError('Failed to check export status');
        }
      }
    }, 1000);

    return () => clearInterval(pollInterval);
  };

  const cancelExport = async () => {
    if (!currentJob) return;

    try {
      await fetch(`/api/whiteboards/export/${currentJob.id}/cancel`, {
        method: 'POST',
      });
      
      setCurrentJob(null);
      setIsExporting(false);
    } catch (error) {
      console.error('Failed to cancel export:', error);
    }
  };

  const downloadFile = () => {
    if (currentJob?.downloadUrl) {
      window.open(currentJob.downloadUrl, '_blank');
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

  const getEstimatedTime = (timeMs?: number) => {
    if (!timeMs) return '';
    
    if (timeMs < 60000) {
      return `${Math.round(timeMs / 1000)}s remaining`;
    } else {
      return `${Math.round(timeMs / 60000)}m remaining`;
    }
  };

  const config = FORMAT_CONFIGS[selectedFormat];
  const IconComponent = config.icon;

  return (
    <Dialog open={isOpen} onClose={onClose}>
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
        <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-hidden">
          {/* Header */}
          <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Download className="h-5 w-5 text-blue-600" />
              <div>
                <h2 className="text-lg font-semibold text-gray-900">Export Whiteboard</h2>
                <p className="text-sm text-gray-500">{whiteboardName}</p>
              </div>
            </div>
            <Button variant="ghost" size="sm" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          </div>

          {/* Content */}
          <div className="flex flex-col h-[calc(90vh-80px)]">
            {!isExporting ? (
              <Tabs value={activeTab} onValueChange={setActiveTab}>
                <div className="border-b border-gray-200 px-6">
                  <div className="flex space-x-8">
                    <button
                      onClick={() => setActiveTab('format')}
                      className={`py-3 px-1 border-b-2 font-medium text-sm ${
                        activeTab === 'format'
                          ? 'border-blue-500 text-blue-600'
                          : 'border-transparent text-gray-500 hover:text-gray-700'
                      }`}
                    >
                      Format
                    </button>
                    <button
                      onClick={() => setActiveTab('options')}
                      className={`py-3 px-1 border-b-2 font-medium text-sm ${
                        activeTab === 'options'
                          ? 'border-blue-500 text-blue-600'
                          : 'border-transparent text-gray-500 hover:text-gray-700'
                      }`}
                    >
                      <Settings className="h-4 w-4 inline mr-2" />
                      Options
                    </button>
                    <button
                      onClick={() => setActiveTab('preview')}
                      className={`py-3 px-1 border-b-2 font-medium text-sm ${
                        activeTab === 'preview'
                          ? 'border-blue-500 text-blue-600'
                          : 'border-transparent text-gray-500 hover:text-gray-700'
                      }`}
                    >
                      <Eye className="h-4 w-4 inline mr-2" />
                      Preview
                    </button>
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto p-6">
                  {/* Format Selection */}
                  {activeTab === 'format' && (
                    <div className="space-y-4">
                      <div>
                        <h3 className="text-lg font-medium text-gray-900 mb-4">Choose Export Format</h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          {Object.entries(FORMAT_CONFIGS).map(([format, config]) => {
                            const IconComp = config.icon;
                            const isSelected = selectedFormat === format;
                            
                            return (
                              <Card
                                key={format}
                                className={`p-4 cursor-pointer transition-all ${
                                  isSelected
                                    ? 'ring-2 ring-blue-500 bg-blue-50'
                                    : 'hover:bg-gray-50'
                                }`}
                                onClick={() => handleFormatSelect(format as ExportFormat)}
                              >
                                <div className="flex items-start gap-3">
                                  <IconComp className={`h-6 w-6 mt-1 ${
                                    isSelected ? 'text-blue-600' : 'text-gray-400'
                                  }`} />
                                  <div className="flex-1">
                                    <div className="flex items-center gap-2">
                                      <h4 className="font-medium text-gray-900">{config.name}</h4>
                                      <Badge variant="outline" size="sm">
                                        .{config.extension}
                                      </Badge>
                                    </div>
                                    <p className="text-sm text-gray-600 mt-1">{config.description}</p>
                                  </div>
                                  {isSelected && (
                                    <Check className="h-5 w-5 text-blue-600" />
                                  )}
                                </div>
                              </Card>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Options Configuration */}
                  {activeTab === 'options' && (
                    <div className="space-y-6">
                      <div className="flex items-center gap-3 mb-4">
                        <IconComponent className="h-5 w-5 text-blue-600" />
                        <h3 className="text-lg font-medium text-gray-900">{config.name} Options</h3>
                      </div>

                      {/* Filename */}
                      <div className="space-y-2">
                        <Label htmlFor="filename">Filename</Label>
                        <div className="flex gap-2">
                          <Input
                            id="filename"
                            value={filename}
                            onChange={(e) => setFilename(e.target.value)}
                            placeholder="Enter filename"
                            className="flex-1"
                          />
                          <span className="flex items-center px-3 py-2 bg-gray-50 border border-l-0 rounded-r-md text-sm text-gray-500">
                            .{config.extension}
                          </span>
                        </div>
                      </div>

                      {/* Format-specific options */}
                      {config.options.includes('quality') && (
                        <div className="space-y-2">
                          <Label htmlFor="quality">Quality</Label>
                          <Select
                            value={options.quality}
                            onValueChange={(value) => handleOptionChange('quality', value)}
                          >
                            <option value="low">Low (Faster, smaller file)</option>
                            <option value="medium">Medium (Balanced)</option>
                            <option value="high">High (Better quality)</option>
                            <option value="ultra">Ultra (Best quality, larger file)</option>
                          </Select>
                        </div>
                      )}

                      {config.options.includes('scale') && (
                        <div className="space-y-2">
                          <Label htmlFor="scale">Scale</Label>
                          <Select
                            value={options.scale?.toString()}
                            onValueChange={(value) => handleOptionChange('scale', parseFloat(value))}
                          >
                            <option value="0.5">0.5x (Smaller file)</option>
                            <option value="1">1x (Original size)</option>
                            <option value="2">2x (High resolution)</option>
                            <option value="4">4x (Very high resolution)</option>
                          </Select>
                        </div>
                      )}

                      {config.options.includes('paperSize') && (
                        <div className="space-y-2">
                          <Label htmlFor="paperSize">Paper Size</Label>
                          <Select
                            value={options.paperSize}
                            onValueChange={(value) => handleOptionChange('paperSize', value)}
                          >
                            <option value="A4">A4</option>
                            <option value="A3">A3</option>
                            <option value="A5">A5</option>
                            <option value="Letter">Letter</option>
                            <option value="Legal">Legal</option>
                          </Select>
                        </div>
                      )}

                      {config.options.includes('orientation') && (
                        <div className="space-y-2">
                          <Label htmlFor="orientation">Orientation</Label>
                          <Select
                            value={options.orientation}
                            onValueChange={(value) => handleOptionChange('orientation', value)}
                          >
                            <option value="portrait">Portrait</option>
                            <option value="landscape">Landscape</option>
                          </Select>
                        </div>
                      )}

                      {/* Boolean options */}
                      <div className="space-y-3">
                        {config.options.includes('includeComments') && (
                          <label className="flex items-center space-x-2">
                            <input
                              type="checkbox"
                              checked={options.includeComments}
                              onChange={(e) => handleOptionChange('includeComments', e.target.checked)}
                              className="rounded border-gray-300"
                            />
                            <span className="text-sm text-gray-700">Include comments</span>
                          </label>
                        )}

                        {config.options.includes('includeMetadata') && (
                          <label className="flex items-center space-x-2">
                            <input
                              type="checkbox"
                              checked={options.includeMetadata}
                              onChange={(e) => handleOptionChange('includeMetadata', e.target.checked)}
                              className="rounded border-gray-300"
                            />
                            <span className="text-sm text-gray-700">Include metadata</span>
                          </label>
                        )}

                        {config.options.includes('backgroundTransparent') && (
                          <label className="flex items-center space-x-2">
                            <input
                              type="checkbox"
                              checked={options.backgroundTransparent}
                              onChange={(e) => handleOptionChange('backgroundTransparent', e.target.checked)}
                              className="rounded border-gray-300"
                            />
                            <span className="text-sm text-gray-700">Transparent background</span>
                          </label>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Preview */}
                  {activeTab === 'preview' && (
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <h3 className="text-lg font-medium text-gray-900">Export Preview</h3>
                        <Button variant="outline" onClick={generatePreview}>
                          <RefreshCw className="h-4 w-4 mr-2" />
                          Refresh Preview
                        </Button>
                      </div>

                      <div className="border rounded-lg p-4 bg-gray-50 min-h-[200px] flex items-center justify-center">
                        {preview ? (
                          <img src={preview} alt="Export preview" className="max-w-full max-h-64 rounded shadow" />
                        ) : (
                          <div className="text-center text-gray-500">
                            <Eye className="h-12 w-12 mx-auto mb-2" />
                            <p>Preview will appear here</p>
                            <Button variant="link" onClick={generatePreview}>
                              Generate Preview
                            </Button>
                          </div>
                        )}
                      </div>

                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <div>
                          <span className="font-medium">Format:</span> {config.name}
                        </div>
                        <div>
                          <span className="font-medium">Filename:</span> {filename}.{config.extension}
                        </div>
                        <div>
                          <span className="font-medium">Estimated size:</span> ~2.4 MB
                        </div>
                        <div>
                          <span className="font-medium">Estimated time:</span> ~5 seconds
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </Tabs>
            ) : (
              // Export Progress
              <div className="flex-1 p-6 flex items-center justify-center">
                <div className="text-center max-w-md">
                  <div className="mb-6">
                    <IconComponent className="h-16 w-16 text-blue-600 mx-auto mb-4" />
                    <h3 className="text-lg font-medium text-gray-900 mb-2">
                      Exporting {config.name}
                    </h3>
                    <p className="text-sm text-gray-600">
                      {filename}.{config.extension}
                    </p>
                  </div>

                  {currentJob && (
                    <>
                      <div className="mb-4">
                        <Progress value={currentJob.progress} className="mb-2" />
                        <div className="flex justify-between text-sm text-gray-600">
                          <span>{currentJob.progress}% complete</span>
                          <span>{getEstimatedTime(currentJob.estimatedTimeRemaining)}</span>
                        </div>
                      </div>

                      {currentJob.status === 'completed' && currentJob.downloadUrl && (
                        <div className="space-y-3">
                          <Alert className="border-green-200 bg-green-50">
                            <Check className="h-4 w-4 text-green-600" />
                            <div className="ml-2">
                              <p className="font-medium text-green-800">Export completed successfully!</p>
                              {currentJob.fileSize && (
                                <p className="text-sm text-green-600 mt-1">
                                  File size: {formatFileSize(currentJob.fileSize)}
                                </p>
                              )}
                            </div>
                          </Alert>
                          <Button onClick={downloadFile} className="w-full">
                            <Download className="h-4 w-4 mr-2" />
                            Download File
                          </Button>
                        </div>
                      )}

                      {currentJob.status === 'failed' && (
                        <Alert className="border-red-200 bg-red-50">
                          <AlertTriangle className="h-4 w-4 text-red-600" />
                          <div className="ml-2">
                            <p className="font-medium text-red-800">Export failed</p>
                            <p className="text-sm text-red-600 mt-1">
                              {currentJob.errorMessage || 'An unexpected error occurred'}
                            </p>
                          </div>
                        </Alert>
                      )}

                      {currentJob.status === 'processing' && (
                        <Button variant="outline" onClick={cancelExport}>
                          Cancel Export
                        </Button>
                      )}
                    </>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          {!isExporting && (
            <div className="px-6 py-4 border-t border-gray-200 flex justify-between">
              <Button variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button 
                onClick={startExport}
                disabled={!selectedFormat || !filename}
              >
                <Download className="h-4 w-4 mr-2" />
                Start Export
              </Button>
            </div>
          )}
        </div>
      </div>
    </Dialog>
  );
}