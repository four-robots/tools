'use client';

import React, { useState, useEffect, useRef } from 'react';
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
  Archive,
  Download,
  Upload,
  FolderOpen,
  FileText,
  FileImage,
  Check,
  X,
  RefreshCw,
  AlertTriangle,
  Eye,
  Settings
} from 'lucide-react';

/**
 * Batch operation types
 */
export type BatchOperationType = 'batch_export' | 'batch_import';

export interface BatchOperationConfig {
  type: BatchOperationType;
  workspaceId: string;
  whiteboardIds?: string[]; // For export
  format: string;
  options: Record<string, any>;
  archiveFilename?: string;
}

export interface BatchOperationItem {
  id: string;
  whiteboardId?: string;
  whiteboardName?: string;
  sourcePath?: string;
  targetPath?: string;
  itemName: string;
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'skipped';
  errorMessage?: string;
  fileSize?: number;
  processingTimeMs?: number;
}

export interface BatchOperation {
  id: string;
  workspaceId: string;
  userId: string;
  operationType: BatchOperationType;
  format: string;
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';
  totalItems: number;
  processedItems: number;
  failedItems: number;
  archivePath?: string;
  archiveSize?: number;
  downloadUrl?: string;
  batchOptions: Record<string, any>;
  errorSummary: Record<string, any>;
  processingTimeMs?: number;
  expiresAt?: string;
  startedAt?: string;
  completedAt?: string;
  createdAt: string;
  updatedAt: string;
  items?: BatchOperationItem[];
}

interface BatchManagerProps {
  isOpen: boolean;
  onClose: () => void;
  operationType: BatchOperationType;
  workspaceId: string;
  workspaceName: string;
  availableWhiteboards?: Array<{ id: string; name: string }>;
  onBatchStart?: (batchId: string) => void;
  onBatchComplete?: (batchId: string, downloadUrl: string) => void;
  onBatchError?: (error: string) => void;
}

const FORMAT_OPTIONS = {
  batch_export: [
    { value: 'pdf', label: 'PDF Documents', icon: FileText },
    { value: 'png', label: 'PNG Images', icon: FileImage },
    { value: 'svg', label: 'SVG Vectors', icon: FileImage },
    { value: 'json', label: 'JSON Data', icon: FileText },
    { value: 'mixed', label: 'Mixed Formats', icon: Archive },
  ],
  batch_import: [
    { value: 'json', label: 'JSON Files', icon: FileText },
    { value: 'images', label: 'Image Files', icon: FileImage },
    { value: 'mixed', label: 'Mixed Formats', icon: Archive },
  ],
};

export function BatchManager({
  isOpen,
  onClose,
  operationType,
  workspaceId,
  workspaceName,
  availableWhiteboards = [],
  onBatchStart,
  onBatchComplete,
  onBatchError
}: BatchManagerProps) {
  const [selectedWhiteboards, setSelectedWhiteboards] = useState<string[]>([]);
  const [selectedFormat, setSelectedFormat] = useState('pdf');
  const [archiveFilename, setArchiveFilename] = useState('');
  const [options, setOptions] = useState<Record<string, any>>({
    includeComments: true,
    includeMetadata: true,
    compressionLevel: 6,
  });
  const [uploadedFiles, setUploadedFiles] = useState<File[]>([]);
  const [currentOperation, setCurrentOperation] = useState<BatchOperation | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [activeTab, setActiveTab] = useState('selection');
  const pollCleanupRef = useRef<(() => void) | null>(null);

  // Cleanup polling interval on unmount
  useEffect(() => {
    return () => {
      if (pollCleanupRef.current) {
        pollCleanupRef.current();
      }
    };
  }, []);

  // Initialize filename based on workspace name
  useEffect(() => {
    if (workspaceName && !archiveFilename) {
      const sanitized = workspaceName.replace(/[^a-zA-Z0-9-_\s]/g, '').replace(/\s+/g, '_');
      const timestamp = new Date().toISOString().split('T')[0];
      const suffix = operationType === 'batch_export' ? 'export' : 'import';
      setArchiveFilename(`${sanitized}_${suffix}_${timestamp}`);
    }
  }, [workspaceName, archiveFilename, operationType]);

  const handleWhiteboardToggle = (whiteboardId: string) => {
    setSelectedWhiteboards(prev => 
      prev.includes(whiteboardId)
        ? prev.filter(id => id !== whiteboardId)
        : [...prev, whiteboardId]
    );
  };

  const handleSelectAll = () => {
    setSelectedWhiteboards(
      selectedWhiteboards.length === availableWhiteboards.length
        ? []
        : availableWhiteboards.map(wb => wb.id)
    );
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    setUploadedFiles(prev => [...prev, ...files]);
  };

  const removeUploadedFile = (index: number) => {
    setUploadedFiles(prev => prev.filter((_, i) => i !== index));
  };

  const startBatchOperation = async () => {
    try {
      setIsProcessing(true);

      const config: BatchOperationConfig = {
        type: operationType,
        workspaceId,
        format: selectedFormat,
        options,
        archiveFilename,
      };

      if (operationType === 'batch_export') {
        config.whiteboardIds = selectedWhiteboards;
      }

      // For batch import, upload files first
      let uploadIds: string[] = [];
      if (operationType === 'batch_import' && uploadedFiles.length > 0) {
        const formData = new FormData();
        uploadedFiles.forEach((file, index) => {
          formData.append(`files`, file);
        });
        formData.append('workspaceId', workspaceId);

        const uploadResponse = await fetch('/api/whiteboards/batch-upload', {
          method: 'POST',
          body: formData,
        });

        if (!uploadResponse.ok) {
          throw new Error('Failed to upload files');
        }

        const uploadResult = await uploadResponse.json();
        uploadIds = uploadResult.uploadIds;
      }

      // Start batch operation
      const operationResponse = await fetch('/api/whiteboards/batch-operation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...config,
          uploadIds: uploadIds.length > 0 ? uploadIds : undefined,
        }),
      });

      if (!operationResponse.ok) {
        throw new Error('Failed to start batch operation');
      }

      const operation: BatchOperation = await operationResponse.json();
      setCurrentOperation(operation);
      
      if (onBatchStart) {
        onBatchStart(operation.id);
      }

      // Start polling for progress
      pollCleanupRef.current = pollOperationStatus(operation.id);

    } catch (error) {
      setIsProcessing(false);
      const errorMessage = error instanceof Error ? error.message : 'Batch operation failed';
      if (onBatchError) {
        onBatchError(errorMessage);
      }
    }
  };

  const pollOperationStatus = (operationId: string): (() => void) => {
    const pollInterval = setInterval(async () => {
      try {
        const response = await fetch(`/api/whiteboards/batch-operation/${operationId}`);
        if (!response.ok) {
          throw new Error('Failed to get operation status');
        }

        const operation: BatchOperation = await response.json();
        setCurrentOperation(operation);

        if (operation.status === 'completed' && operation.downloadUrl) {
          clearInterval(pollInterval);
          pollCleanupRef.current = null;
          setIsProcessing(false);

          if (onBatchComplete) {
            onBatchComplete(operation.id, operation.downloadUrl);
          }
        } else if (operation.status === 'failed') {
          clearInterval(pollInterval);
          pollCleanupRef.current = null;
          setIsProcessing(false);

          if (onBatchError) {
            onBatchError('Batch operation failed');
          }
        }
      } catch (error) {
        clearInterval(pollInterval);
        pollCleanupRef.current = null;
        setIsProcessing(false);

        if (onBatchError) {
          onBatchError('Failed to check operation status');
        }
      }
    }, 2000);

    return () => clearInterval(pollInterval);
  };

  const cancelOperation = async () => {
    if (!currentOperation) return;

    try {
      await fetch(`/api/whiteboards/batch-operation/${currentOperation.id}/cancel`, {
        method: 'POST',
      });
      
      setCurrentOperation(null);
      setIsProcessing(false);
    } catch (error) {
      console.error('Failed to cancel operation:', error);
    }
  };

  const downloadArchive = () => {
    if (currentOperation?.downloadUrl) {
      window.open(currentOperation.downloadUrl, '_blank');
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

  const getProgressPercentage = () => {
    if (!currentOperation || currentOperation.totalItems === 0) return 0;
    return Math.round((currentOperation.processedItems / currentOperation.totalItems) * 100);
  };

  const isExport = operationType === 'batch_export';
  const formatOptions = FORMAT_OPTIONS[operationType];

  return (
    <Dialog open={isOpen} onClose={onClose}>
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
        <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-hidden">
          {/* Header */}
          <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Archive className="h-5 w-5 text-blue-600" />
              <div>
                <h2 className="text-lg font-semibold text-gray-900">
                  {isExport ? 'Batch Export' : 'Batch Import'}
                </h2>
                <p className="text-sm text-gray-500">{workspaceName}</p>
              </div>
            </div>
            <Button variant="ghost" size="sm" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          </div>

          {/* Content */}
          <div className="flex flex-col h-[calc(90vh-80px)]">
            {!isProcessing ? (
              <>
                {/* Tabs */}
                <div className="border-b border-gray-200 px-6">
                  <div className="flex space-x-8">
                    <button
                      onClick={() => setActiveTab('selection')}
                      className={`py-3 px-1 border-b-2 font-medium text-sm ${
                        activeTab === 'selection'
                          ? 'border-blue-500 text-blue-600'
                          : 'border-transparent text-gray-500 hover:text-gray-700'
                      }`}
                    >
                      {isExport ? 'Select Whiteboards' : 'Upload Files'}
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
                  {/* Selection Tab */}
                  {activeTab === 'selection' && (
                    <div className="space-y-6">
                      {isExport ? (
                        <>
                          <div className="flex items-center justify-between">
                            <h3 className="text-lg font-medium text-gray-900">
                              Select Whiteboards to Export
                            </h3>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={handleSelectAll}
                            >
                              {selectedWhiteboards.length === availableWhiteboards.length 
                                ? 'Deselect All' 
                                : 'Select All'
                              }
                            </Button>
                          </div>

                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-64 overflow-y-auto">
                            {availableWhiteboards.map((whiteboard) => (
                              <Card
                                key={whiteboard.id}
                                className={`p-3 cursor-pointer transition-all ${
                                  selectedWhiteboards.includes(whiteboard.id)
                                    ? 'ring-2 ring-blue-500 bg-blue-50'
                                    : 'hover:bg-gray-50'
                                }`}
                                onClick={() => handleWhiteboardToggle(whiteboard.id)}
                              >
                                <div className="flex items-center gap-3">
                                  <input
                                    type="checkbox"
                                    checked={selectedWhiteboards.includes(whiteboard.id)}
                                    onChange={() => {}}
                                    className="text-blue-600"
                                  />
                                  <div className="flex-1">
                                    <h4 className="font-medium text-gray-900 truncate">
                                      {whiteboard.name}
                                    </h4>
                                  </div>
                                  {selectedWhiteboards.includes(whiteboard.id) && (
                                    <Check className="h-5 w-5 text-blue-600" />
                                  )}
                                </div>
                              </Card>
                            ))}
                          </div>

                          <div className="text-sm text-gray-600">
                            Selected: {selectedWhiteboards.length} of {availableWhiteboards.length} whiteboards
                          </div>
                        </>
                      ) : (
                        <>
                          <h3 className="text-lg font-medium text-gray-900">
                            Upload Files to Import
                          </h3>

                          {/* File Upload Area */}
                          <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center">
                            <input
                              type="file"
                              multiple
                              onChange={handleFileUpload}
                              accept=".json,.svg,.png,.jpg,.jpeg,.gif,.pdf,.zip"
                              className="hidden"
                              id="file-upload"
                            />
                            <label
                              htmlFor="file-upload"
                              className="cursor-pointer"
                            >
                              <Upload className="h-12 w-12 text-gray-400 mx-auto mb-2" />
                              <p className="text-lg font-medium text-gray-900">
                                Drop files here or click to browse
                              </p>
                              <p className="text-sm text-gray-600">
                                Supports multiple files up to 200MB total
                              </p>
                            </label>
                          </div>

                          {/* Uploaded Files List */}
                          {uploadedFiles.length > 0 && (
                            <div className="space-y-2">
                              <h4 className="font-medium text-gray-900">
                                Uploaded Files ({uploadedFiles.length})
                              </h4>
                              <div className="space-y-2 max-h-32 overflow-y-auto">
                                {uploadedFiles.map((file, index) => (
                                  <div
                                    key={index}
                                    className="flex items-center justify-between p-2 bg-gray-50 rounded"
                                  >
                                    <div className="flex items-center gap-2">
                                      <FileText className="h-4 w-4 text-gray-500" />
                                      <span className="text-sm text-gray-900 truncate">
                                        {file.name}
                                      </span>
                                      <span className="text-xs text-gray-500">
                                        {formatFileSize(file.size)}
                                      </span>
                                    </div>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => removeUploadedFile(index)}
                                    >
                                      <X className="h-4 w-4" />
                                    </Button>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  )}

                  {/* Options Tab */}
                  {activeTab === 'options' && (
                    <div className="space-y-6">
                      <h3 className="text-lg font-medium text-gray-900">Batch Operation Options</h3>

                      {/* Format Selection */}
                      <div className="space-y-3">
                        <Label>Output Format</Label>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          {formatOptions.map((format) => {
                            const IconComp = format.icon;
                            const isSelected = selectedFormat === format.value;
                            
                            return (
                              <Card
                                key={format.value}
                                className={`p-3 cursor-pointer transition-all ${
                                  isSelected
                                    ? 'ring-2 ring-blue-500 bg-blue-50'
                                    : 'hover:bg-gray-50'
                                }`}
                                onClick={() => setSelectedFormat(format.value)}
                              >
                                <div className="flex items-center gap-3">
                                  <IconComp className={`h-5 w-5 ${
                                    isSelected ? 'text-blue-600' : 'text-gray-400'
                                  }`} />
                                  <span className="font-medium text-gray-900">
                                    {format.label}
                                  </span>
                                  {isSelected && (
                                    <Check className="h-5 w-5 text-blue-600 ml-auto" />
                                  )}
                                </div>
                              </Card>
                            );
                          })}
                        </div>
                      </div>

                      {/* Archive Filename */}
                      <div className="space-y-2">
                        <Label htmlFor="archive-filename">Archive Filename</Label>
                        <div className="flex gap-2">
                          <Input
                            id="archive-filename"
                            value={archiveFilename}
                            onChange={(e) => setArchiveFilename(e.target.value)}
                            placeholder="Enter filename"
                            className="flex-1"
                          />
                          <span className="flex items-center px-3 py-2 bg-gray-50 border border-l-0 rounded-r-md text-sm text-gray-500">
                            .zip
                          </span>
                        </div>
                      </div>

                      {/* Additional Options */}
                      <div className="space-y-3">
                        <Label>Additional Options</Label>
                        <div className="space-y-2">
                          <label className="flex items-center space-x-2">
                            <input
                              type="checkbox"
                              checked={options.includeComments}
                              onChange={(e) => setOptions(prev => ({ 
                                ...prev, 
                                includeComments: e.target.checked 
                              }))}
                              className="rounded border-gray-300"
                            />
                            <span className="text-sm text-gray-700">Include comments</span>
                          </label>

                          <label className="flex items-center space-x-2">
                            <input
                              type="checkbox"
                              checked={options.includeMetadata}
                              onChange={(e) => setOptions(prev => ({ 
                                ...prev, 
                                includeMetadata: e.target.checked 
                              }))}
                              className="rounded border-gray-300"
                            />
                            <span className="text-sm text-gray-700">Include metadata</span>
                          </label>
                        </div>
                      </div>

                      {/* Compression Level */}
                      <div className="space-y-2">
                        <Label htmlFor="compression">Compression Level</Label>
                        <Select
                          value={options.compressionLevel?.toString()}
                          onValueChange={(value) => setOptions(prev => ({ 
                            ...prev, 
                            compressionLevel: parseInt(value) 
                          }))}
                        >
                          <option value="1">1 - Fastest (Larger file)</option>
                          <option value="6">6 - Balanced (Default)</option>
                          <option value="9">9 - Best compression (Slower)</option>
                        </Select>
                      </div>
                    </div>
                  )}

                  {/* Preview Tab */}
                  {activeTab === 'preview' && (
                    <div className="space-y-6">
                      <h3 className="text-lg font-medium text-gray-900">Operation Preview</h3>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <Card className="p-4">
                          <h4 className="font-medium text-gray-900 mb-3">Operation Details</h4>
                          <div className="space-y-2 text-sm">
                            <div className="flex justify-between">
                              <span className="text-gray-600">Type:</span>
                              <span className="font-medium">
                                {isExport ? 'Batch Export' : 'Batch Import'}
                              </span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-gray-600">Format:</span>
                              <span className="font-medium">{selectedFormat.toUpperCase()}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-gray-600">Items:</span>
                              <span className="font-medium">
                                {isExport ? selectedWhiteboards.length : uploadedFiles.length}
                              </span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-gray-600">Archive:</span>
                              <span className="font-medium">{archiveFilename}.zip</span>
                            </div>
                          </div>
                        </Card>

                        <Card className="p-4">
                          <h4 className="font-medium text-gray-900 mb-3">Estimated Results</h4>
                          <div className="space-y-2 text-sm">
                            <div className="flex justify-between">
                              <span className="text-gray-600">Estimated size:</span>
                              <span className="font-medium">~50 MB</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-gray-600">Processing time:</span>
                              <span className="font-medium">~2-5 minutes</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-gray-600">Expiration:</span>
                              <span className="font-medium">24 hours</span>
                            </div>
                          </div>
                        </Card>
                      </div>

                      {/* Items Preview */}
                      <Card className="p-4">
                        <h4 className="font-medium text-gray-900 mb-3">
                          {isExport ? 'Whiteboards to Export' : 'Files to Import'}
                        </h4>
                        <div className="space-y-2 max-h-48 overflow-y-auto">
                          {isExport ? (
                            selectedWhiteboards.map(whiteboardId => {
                              const whiteboard = availableWhiteboards.find(wb => wb.id === whiteboardId);
                              return (
                                <div key={whiteboardId} className="flex items-center gap-3 p-2 bg-gray-50 rounded">
                                  <FileText className="h-4 w-4 text-gray-500" />
                                  <span className="text-sm text-gray-900">
                                    {whiteboard?.name || 'Unknown Whiteboard'}
                                  </span>
                                </div>
                              );
                            })
                          ) : (
                            uploadedFiles.map((file, index) => (
                              <div key={index} className="flex items-center gap-3 p-2 bg-gray-50 rounded">
                                <FileImage className="h-4 w-4 text-gray-500" />
                                <span className="text-sm text-gray-900">{file.name}</span>
                                <span className="text-xs text-gray-500 ml-auto">
                                  {formatFileSize(file.size)}
                                </span>
                              </div>
                            ))
                          )}
                        </div>
                      </Card>
                    </div>
                  )}
                </div>
              </>
            ) : (
              /* Processing View */
              <div className="flex-1 p-6 flex items-center justify-center">
                <div className="text-center max-w-md">
                  <div className="mb-6">
                    <Archive className="h-16 w-16 text-blue-600 mx-auto mb-4" />
                    <h3 className="text-lg font-medium text-gray-900 mb-2">
                      Processing {isExport ? 'Export' : 'Import'}
                    </h3>
                    <p className="text-sm text-gray-600">
                      {archiveFilename}.zip
                    </p>
                  </div>

                  {currentOperation && (
                    <>
                      <div className="mb-6">
                        <Progress value={getProgressPercentage()} className="mb-2" />
                        <div className="flex justify-between text-sm text-gray-600">
                          <span>{getProgressPercentage()}% complete</span>
                          <span>
                            {currentOperation.processedItems} of {currentOperation.totalItems} items
                          </span>
                        </div>
                      </div>

                      {currentOperation.status === 'completed' && currentOperation.downloadUrl && (
                        <div className="space-y-3">
                          <Alert className="border-green-200 bg-green-50">
                            <Check className="h-4 w-4 text-green-600" />
                            <div className="ml-2">
                              <p className="font-medium text-green-800">
                                {isExport ? 'Export' : 'Import'} completed successfully!
                              </p>
                              {currentOperation.archiveSize && (
                                <p className="text-sm text-green-600 mt-1">
                                  Archive size: {formatFileSize(currentOperation.archiveSize)}
                                </p>
                              )}
                              {currentOperation.failedItems > 0 && (
                                <p className="text-sm text-yellow-600 mt-1">
                                  {currentOperation.failedItems} items failed
                                </p>
                              )}
                            </div>
                          </Alert>
                          <Button onClick={downloadArchive} className="w-full">
                            <Download className="h-4 w-4 mr-2" />
                            Download Archive
                          </Button>
                        </div>
                      )}

                      {currentOperation.status === 'failed' && (
                        <Alert className="border-red-200 bg-red-50">
                          <AlertTriangle className="h-4 w-4 text-red-600" />
                          <div className="ml-2">
                            <p className="font-medium text-red-800">
                              {isExport ? 'Export' : 'Import'} failed
                            </p>
                            <p className="text-sm text-red-600 mt-1">
                              Please try again or contact support
                            </p>
                          </div>
                        </Alert>
                      )}

                      {currentOperation.status === 'processing' && (
                        <Button variant="outline" onClick={cancelOperation}>
                          Cancel Operation
                        </Button>
                      )}
                    </>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          {!isProcessing && (
            <div className="px-6 py-4 border-t border-gray-200 flex justify-between">
              <Button variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button 
                onClick={startBatchOperation}
                disabled={
                  (isExport && selectedWhiteboards.length === 0) ||
                  (!isExport && uploadedFiles.length === 0) ||
                  !archiveFilename
                }
              >
                <Archive className="h-4 w-4 mr-2" />
                Start {isExport ? 'Export' : 'Import'}
              </Button>
            </div>
          )}
        </div>
      </div>
    </Dialog>
  );
}