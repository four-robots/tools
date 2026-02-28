'use client';

import React, { useState, useCallback, useRef, useEffect } from 'react';
import { Dialog } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Card } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Alert } from '@/components/ui/alert';
import { 
  Upload, 
  FileImage, 
  FileText, 
  Archive,
  AlertTriangle,
  Check,
  X,
  RefreshCw,
  Eye,
  Shield,
  Clock
} from 'lucide-react';

/**
 * Import format types and options
 */
export type ImportFormat = 'json' | 'svg' | 'png' | 'jpeg' | 'gif' | 'pdf' | 'zip' | 'template';

export interface ImportOptions {
  format: ImportFormat;
  autoPosition?: boolean;
  position?: { x: number; y: number };
  mergeWithExisting?: boolean;
  preserveIds?: boolean;
  importComments?: boolean;
  conflictResolution?: 'skip' | 'replace' | 'rename' | 'merge';
  maxWidth?: number;
  maxHeight?: number;
  scale?: number;
}

export interface UploadedFile {
  id: string;
  filename: string;
  fileType: string;
  fileSize: number;
  uploadedAt: string;
  scanStatus: 'pending' | 'scanning' | 'clean' | 'infected' | 'failed';
  metadata: Record<string, any>;
}

export interface ImportJob {
  id: string;
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';
  progress: number;
  format: ImportFormat;
  elementsCreated: string[];
  warnings: string[];
  errorMessage?: string;
  createdAt: string;
  estimatedTimeRemaining?: number;
}

interface ImportDialogProps {
  isOpen: boolean;
  onClose: () => void;
  whiteboardId: string;
  whiteboardName: string;
  onImportStart?: (jobId: string) => void;
  onImportComplete?: (jobId: string, elementsCreated: string[]) => void;
  onImportError?: (error: string) => void;
}

const FORMAT_CONFIGS = {
  json: {
    name: 'JSON Whiteboard',
    icon: FileText,
    description: 'Native whiteboard format with full data',
    accept: '.json',
    maxSize: '50MB',
    category: 'data',
  },
  svg: {
    name: 'SVG Vector',
    icon: FileImage,
    description: 'Scalable vector graphics file',
    accept: '.svg',
    maxSize: '10MB',
    category: 'image',
  },
  png: {
    name: 'PNG Image',
    icon: FileImage,
    description: 'Raster image with transparency support',
    accept: '.png',
    maxSize: '25MB',
    category: 'image',
  },
  jpeg: {
    name: 'JPEG Image',
    icon: FileImage,
    description: 'Compressed raster image',
    accept: '.jpg,.jpeg',
    maxSize: '25MB',
    category: 'image',
  },
  gif: {
    name: 'GIF Image',
    icon: FileImage,
    description: 'Animated or static image',
    accept: '.gif',
    maxSize: '25MB',
    category: 'image',
  },
  pdf: {
    name: 'PDF Document',
    icon: FileText,
    description: 'Multi-page document (converted to images)',
    accept: '.pdf',
    maxSize: '100MB',
    category: 'document',
  },
  zip: {
    name: 'ZIP Archive',
    icon: Archive,
    description: 'Multiple files in compressed archive',
    accept: '.zip',
    maxSize: '200MB',
    category: 'archive',
  },
  template: {
    name: 'Whiteboard Template',
    icon: FileText,
    description: 'Reusable whiteboard template',
    accept: '.json,.template',
    maxSize: '50MB',
    category: 'template',
  },
};

export function ImportDialog({ 
  isOpen, 
  onClose, 
  whiteboardId, 
  whiteboardName,
  onImportStart,
  onImportComplete,
  onImportError 
}: ImportDialogProps) {
  const [dragActive, setDragActive] = useState(false);
  const [uploadedFile, setUploadedFile] = useState<UploadedFile | null>(null);
  const [detectedFormat, setDetectedFormat] = useState<ImportFormat | null>(null);
  const [options, setOptions] = useState<ImportOptions>({
    format: 'json',
    autoPosition: true,
    mergeWithExisting: false,
    preserveIds: false,
    importComments: true,
    conflictResolution: 'rename',
    scale: 1,
  });
  const [currentJob, setCurrentJob] = useState<ImportJob | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [previewData, setPreviewData] = useState<any>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pollCleanupRef = useRef<(() => void) | null>(null);

  // Cleanup polling interval on unmount
  useEffect(() => {
    return () => {
      if (pollCleanupRef.current) {
        pollCleanupRef.current();
      }
    };
  }, []);

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  }, []);

  const detectFileFormat = (filename: string, mimeType: string): ImportFormat => {
    const ext = filename.toLowerCase().split('.').pop();
    const type = mimeType.toLowerCase();

    if (type.includes('json') || ext === 'json') return 'json';
    if (type.includes('svg') || ext === 'svg') return 'svg';
    if (type.includes('png') || ext === 'png') return 'png';
    if (type.includes('jpeg') || type.includes('jpg') || ext === 'jpg' || ext === 'jpeg') return 'jpeg';
    if (type.includes('gif') || ext === 'gif') return 'gif';
    if (type.includes('pdf') || ext === 'pdf') return 'pdf';
    if (type.includes('zip') || ext === 'zip') return 'zip';
    if (ext === 'template') return 'template';

    return 'json'; // Default fallback
  };

  const validateFile = (file: File): string | null => {
    const format = detectFileFormat(file.name, file.type);
    const config = FORMAT_CONFIGS[format];
    
    // Check file size
    const maxSizeBytes = parseFloat(config.maxSize) * (config.maxSize.includes('MB') ? 1024 * 1024 : 1024);
    if (file.size > maxSizeBytes) {
      return `File size exceeds maximum limit of ${config.maxSize}`;
    }

    // Check file type
    if (config.accept && !config.accept.split(',').some(ext => 
      file.name.toLowerCase().endsWith(ext.trim())
    )) {
      return `Unsupported file type. Expected: ${config.accept}`;
    }

    return null;
  };

  const handleFiles = async (files: FileList) => {
    if (files.length === 0) return;
    
    const file = files[0];
    const validationError = validateFile(file);
    
    if (validationError) {
      if (onImportError) {
        onImportError(validationError);
      }
      return;
    }

    setIsUploading(true);

    try {
      // Upload file
      const formData = new FormData();
      formData.append('file', file);
      formData.append('whiteboardId', whiteboardId);

      const uploadResponse = await fetch('/api/whiteboards/upload', {
        method: 'POST',
        body: formData,
      });

      if (!uploadResponse.ok) {
        throw new Error('Failed to upload file');
      }

      const uploadResult = await uploadResponse.json();
      const format = detectFileFormat(file.name, file.type);
      
      setUploadedFile(uploadResult);
      setDetectedFormat(format);
      setOptions(prev => ({ ...prev, format }));

      // Generate preview for supported formats
      if (['json', 'svg'].includes(format)) {
        generatePreview(uploadResult.id, format);
      }

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Upload failed';
      if (onImportError) {
        onImportError(errorMessage);
      }
    } finally {
      setIsUploading(false);
    }
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFiles(e.dataTransfer.files);
    }
  }, []);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      handleFiles(e.target.files);
    }
  };

  const generatePreview = async (uploadId: string, format: ImportFormat) => {
    try {
      const response = await fetch(`/api/whiteboards/upload/${uploadId}/preview`);
      if (response.ok) {
        const preview = await response.json();
        setPreviewData(preview);
      }
    } catch (error) {
      console.error('Failed to generate preview:', error);
    }
  };

  const startImport = async () => {
    if (!uploadedFile || !detectedFormat) return;

    try {
      setIsImporting(true);
      
      const jobResponse = await fetch('/api/whiteboards/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          whiteboardId,
          uploadId: uploadedFile.id,
          options,
        }),
      });

      if (!jobResponse.ok) {
        throw new Error('Failed to start import');
      }

      const job: ImportJob = await jobResponse.json();
      setCurrentJob(job);
      
      if (onImportStart) {
        onImportStart(job.id);
      }

      // Poll for job status
      pollCleanupRef.current = pollJobStatus(job.id);

    } catch (error) {
      setIsImporting(false);
      const errorMessage = error instanceof Error ? error.message : 'Import failed';
      if (onImportError) {
        onImportError(errorMessage);
      }
    }
  };

  const pollJobStatus = (jobId: string): (() => void) => {
    const pollInterval = setInterval(async () => {
      try {
        const response = await fetch(`/api/whiteboards/import/${jobId}`);
        if (!response.ok) {
          throw new Error('Failed to get job status');
        }

        const job: ImportJob = await response.json();
        setCurrentJob(job);

        if (job.status === 'completed') {
          clearInterval(pollInterval);
          pollCleanupRef.current = null;
          setIsImporting(false);

          if (onImportComplete) {
            onImportComplete(job.id, job.elementsCreated);
          }
        } else if (job.status === 'failed') {
          clearInterval(pollInterval);
          pollCleanupRef.current = null;
          setIsImporting(false);

          if (onImportError) {
            onImportError(job.errorMessage || 'Import failed');
          }
        }
      } catch (error) {
        clearInterval(pollInterval);
        pollCleanupRef.current = null;
        setIsImporting(false);

        if (onImportError) {
          onImportError('Failed to check import status');
        }
      }
    }, 1000);

    return () => clearInterval(pollInterval);
  };

  const cancelImport = async () => {
    if (!currentJob) return;

    try {
      await fetch(`/api/whiteboards/import/${currentJob.id}/cancel`, {
        method: 'POST',
      });
      
      setCurrentJob(null);
      setIsImporting(false);
    } catch (error) {
      console.error('Failed to cancel import:', error);
    }
  };

  const resetDialog = () => {
    setUploadedFile(null);
    setDetectedFormat(null);
    setPreviewData(null);
    setCurrentJob(null);
    setIsUploading(false);
    setIsImporting(false);
  };

  const formatFileSize = (bytes: number) => {
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

  const getScanStatusBadge = (status: string) => {
    switch (status) {
      case 'clean':
        return <Badge variant="success" size="sm"><Shield className="h-3 w-3 mr-1" />Clean</Badge>;
      case 'scanning':
        return <Badge variant="secondary" size="sm"><RefreshCw className="h-3 w-3 mr-1 animate-spin" />Scanning</Badge>;
      case 'infected':
        return <Badge variant="destructive" size="sm"><AlertTriangle className="h-3 w-3 mr-1" />Infected</Badge>;
      case 'failed':
        return <Badge variant="destructive" size="sm"><X className="h-3 w-3 mr-1" />Scan Failed</Badge>;
      default:
        return <Badge variant="secondary" size="sm"><Clock className="h-3 w-3 mr-1" />Pending</Badge>;
    }
  };

  const config = detectedFormat ? FORMAT_CONFIGS[detectedFormat] : null;
  const IconComponent = config?.icon || Upload;

  return (
    <Dialog open={isOpen} onClose={onClose}>
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
        <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-hidden">
          {/* Header */}
          <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Upload className="h-5 w-5 text-blue-600" />
              <div>
                <h2 className="text-lg font-semibold text-gray-900">Import to Whiteboard</h2>
                <p className="text-sm text-gray-500">{whiteboardName}</p>
              </div>
            </div>
            <Button variant="ghost" size="sm" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          </div>

          {/* Content */}
          <div className="flex flex-col h-[calc(90vh-80px)]">
            {!isImporting ? (
              <div className="flex-1 overflow-y-auto p-6 space-y-6">
                {/* File Upload */}
                {!uploadedFile ? (
                  <div className="space-y-4">
                    <h3 className="text-lg font-medium text-gray-900">Choose File to Import</h3>
                    
                    {/* Drag and Drop Area */}
                    <div
                      className={`relative border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
                        dragActive
                          ? 'border-blue-500 bg-blue-50'
                          : 'border-gray-300 hover:border-gray-400'
                      }`}
                      onDragEnter={handleDrag}
                      onDragLeave={handleDrag}
                      onDragOver={handleDrag}
                      onDrop={handleDrop}
                    >
                      <input
                        ref={fileInputRef}
                        type="file"
                        multiple={false}
                        onChange={handleFileSelect}
                        accept=".json,.svg,.png,.jpg,.jpeg,.gif,.pdf,.zip,.template"
                        className="hidden"
                      />
                      
                      {isUploading ? (
                        <div className="space-y-4">
                          <RefreshCw className="h-12 w-12 text-blue-600 mx-auto animate-spin" />
                          <div>
                            <p className="text-lg font-medium text-gray-900">Uploading file...</p>
                            <p className="text-sm text-gray-600">Please wait while we process your file</p>
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-4">
                          <Upload className="h-12 w-12 text-gray-400 mx-auto" />
                          <div>
                            <p className="text-lg font-medium text-gray-900">
                              Drop your file here, or{' '}
                              <button
                                onClick={() => fileInputRef.current?.click()}
                                className="text-blue-600 hover:text-blue-500"
                              >
                                browse
                              </button>
                            </p>
                            <p className="text-sm text-gray-600 mt-1">
                              Supports JSON, SVG, PNG, JPEG, GIF, PDF, ZIP files up to 200MB
                            </p>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Format Information */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      {Object.entries(FORMAT_CONFIGS).map(([format, config]) => {
                        const IconComp = config.icon;
                        return (
                          <div
                            key={format}
                            className="flex items-center gap-2 p-3 bg-gray-50 rounded-lg"
                          >
                            <IconComp className="h-4 w-4 text-gray-500" />
                            <div>
                              <div className="text-xs font-medium text-gray-900">
                                {config.name}
                              </div>
                              <div className="text-xs text-gray-500">
                                {config.maxSize}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  /* File Uploaded - Configure Import */
                  <div className="space-y-6">
                    {/* File Info */}
                    <Card className="p-4">
                      <div className="flex items-start gap-4">
                        <IconComponent className="h-8 w-8 text-blue-600 mt-1" />
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <h4 className="font-medium text-gray-900">{uploadedFile.filename}</h4>
                            {getScanStatusBadge(uploadedFile.scanStatus)}
                          </div>
                          <div className="grid grid-cols-2 gap-4 text-sm text-gray-600">
                            <div>
                              <span className="font-medium">Format:</span> {config?.name}
                            </div>
                            <div>
                              <span className="font-medium">Size:</span> {formatFileSize(uploadedFile.fileSize)}
                            </div>
                          </div>
                          
                          {uploadedFile.scanStatus === 'infected' && (
                            <Alert className="mt-3 border-red-200 bg-red-50">
                              <AlertTriangle className="h-4 w-4 text-red-600" />
                              <div className="ml-2">
                                <p className="font-medium text-red-800">Security Alert</p>
                                <p className="text-sm text-red-600">
                                  This file contains malicious content and cannot be imported.
                                </p>
                              </div>
                            </Alert>
                          )}
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={resetDialog}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    </Card>

                    {/* Import Options */}
                    {uploadedFile.scanStatus === 'clean' && (
                      <>
                        <div className="space-y-4">
                          <h3 className="text-lg font-medium text-gray-900">Import Options</h3>
                          
                          {/* Position Options */}
                          <div className="space-y-3">
                            <Label>Positioning</Label>
                            <div className="space-y-2">
                              <label className="flex items-center space-x-2">
                                <input
                                  type="radio"
                                  name="position"
                                  checked={options.autoPosition}
                                  onChange={() => setOptions(prev => ({ ...prev, autoPosition: true }))}
                                  className="text-blue-600"
                                />
                                <span className="text-sm">Auto-position (recommended)</span>
                              </label>
                              <label className="flex items-center space-x-2">
                                <input
                                  type="radio"
                                  name="position"
                                  checked={!options.autoPosition}
                                  onChange={() => setOptions(prev => ({ ...prev, autoPosition: false }))}
                                  className="text-blue-600"
                                />
                                <span className="text-sm">Custom position</span>
                              </label>
                            </div>
                          </div>

                          {/* Merge Options for JSON */}
                          {detectedFormat === 'json' && (
                            <div className="space-y-3">
                              <Label>Import Mode</Label>
                              <div className="space-y-2">
                                <label className="flex items-center space-x-2">
                                  <input
                                    type="checkbox"
                                    checked={options.mergeWithExisting}
                                    onChange={(e) => setOptions(prev => ({ 
                                      ...prev, 
                                      mergeWithExisting: e.target.checked 
                                    }))}
                                    className="text-blue-600"
                                  />
                                  <span className="text-sm">Merge with existing elements</span>
                                </label>
                                <label className="flex items-center space-x-2">
                                  <input
                                    type="checkbox"
                                    checked={options.importComments}
                                    onChange={(e) => setOptions(prev => ({ 
                                      ...prev, 
                                      importComments: e.target.checked 
                                    }))}
                                    className="text-blue-600"
                                  />
                                  <span className="text-sm">Import comments</span>
                                </label>
                              </div>
                            </div>
                          )}

                          {/* Conflict Resolution */}
                          <div className="space-y-2">
                            <Label htmlFor="conflict">Conflict Resolution</Label>
                            <Select
                              value={options.conflictResolution}
                              onValueChange={(value: any) => setOptions(prev => ({ 
                                ...prev, 
                                conflictResolution: value 
                              }))}
                            >
                              <option value="skip">Skip conflicting items</option>
                              <option value="replace">Replace existing items</option>
                              <option value="rename">Rename conflicting items</option>
                              <option value="merge">Merge when possible</option>
                            </Select>
                          </div>

                          {/* Scale for Images */}
                          {['png', 'jpeg', 'gif', 'svg'].includes(detectedFormat || '') && (
                            <div className="space-y-2">
                              <Label htmlFor="scale">Scale</Label>
                              <Select
                                value={options.scale?.toString()}
                                onValueChange={(value) => setOptions(prev => ({ 
                                  ...prev, 
                                  scale: parseFloat(value) 
                                }))}
                              >
                                <option value="0.5">50% (Smaller)</option>
                                <option value="1">100% (Original)</option>
                                <option value="1.5">150% (Larger)</option>
                                <option value="2">200% (Much larger)</option>
                              </Select>
                            </div>
                          )}
                        </div>

                        {/* Preview */}
                        {previewData && (
                          <Card className="p-4">
                            <div className="flex items-center gap-2 mb-3">
                              <Eye className="h-4 w-4 text-gray-500" />
                              <h4 className="font-medium text-gray-900">Preview</h4>
                            </div>
                            <div className="bg-gray-50 rounded border p-4 max-h-48 overflow-auto">
                              <pre className="text-xs text-gray-700">
                                {JSON.stringify(previewData, null, 2)}
                              </pre>
                            </div>
                          </Card>
                        )}
                      </>
                    )}
                  </div>
                )}
              </div>
            ) : (
              /* Import Progress */
              <div className="flex-1 p-6 flex items-center justify-center">
                <div className="text-center max-w-md">
                  <div className="mb-6">
                    <IconComponent className="h-16 w-16 text-blue-600 mx-auto mb-4" />
                    <h3 className="text-lg font-medium text-gray-900 mb-2">
                      Importing {config?.name}
                    </h3>
                    <p className="text-sm text-gray-600">
                      {uploadedFile?.filename}
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

                      {currentJob.status === 'completed' && (
                        <div className="space-y-3">
                          <Alert className="border-green-200 bg-green-50">
                            <Check className="h-4 w-4 text-green-600" />
                            <div className="ml-2">
                              <p className="font-medium text-green-800">Import completed successfully!</p>
                              <p className="text-sm text-green-600 mt-1">
                                Created {currentJob.elementsCreated.length} elements
                              </p>
                            </div>
                          </Alert>

                          {currentJob.warnings.length > 0 && (
                            <Alert className="border-yellow-200 bg-yellow-50">
                              <AlertTriangle className="h-4 w-4 text-yellow-600" />
                              <div className="ml-2">
                                <p className="font-medium text-yellow-800">Import completed with warnings</p>
                                <ul className="text-sm text-yellow-600 mt-1 list-disc list-inside">
                                  {currentJob.warnings.map((warning, index) => (
                                    <li key={index}>{warning}</li>
                                  ))}
                                </ul>
                              </div>
                            </Alert>
                          )}
                        </div>
                      )}

                      {currentJob.status === 'failed' && (
                        <Alert className="border-red-200 bg-red-50">
                          <AlertTriangle className="h-4 w-4 text-red-600" />
                          <div className="ml-2">
                            <p className="font-medium text-red-800">Import failed</p>
                            <p className="text-sm text-red-600 mt-1">
                              {currentJob.errorMessage || 'An unexpected error occurred'}
                            </p>
                          </div>
                        </Alert>
                      )}

                      {currentJob.status === 'processing' && (
                        <Button variant="outline" onClick={cancelImport}>
                          Cancel Import
                        </Button>
                      )}
                    </>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          {!isImporting && (
            <div className="px-6 py-4 border-t border-gray-200 flex justify-between">
              <Button variant="outline" onClick={onClose}>
                Cancel
              </Button>
              {uploadedFile && uploadedFile.scanStatus === 'clean' && (
                <Button 
                  onClick={startImport}
                  disabled={!uploadedFile || !detectedFormat}
                >
                  <Upload className="h-4 w-4 mr-2" />
                  Start Import
                </Button>
              )}
            </div>
          )}
        </div>
      </div>
    </Dialog>
  );
}