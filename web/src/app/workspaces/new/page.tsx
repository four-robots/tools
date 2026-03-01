"use client"

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Plus, Users, FileText, Database, Grid3x3, Settings } from 'lucide-react';

interface WorkspaceTemplate {
  id: string;
  name: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  features: string[];
  isRecommended?: boolean;
}

const templates: WorkspaceTemplate[] = [
  {
    id: 'general',
    name: 'General Purpose',
    description: 'A flexible workspace for any type of collaboration',
    icon: Settings,
    features: ['Kanban boards', 'Wiki pages', 'Memory graph', 'Team discussions'],
  },
  {
    id: 'development',
    name: 'Software Development',
    description: 'Optimized for software development teams',
    icon: Grid3x3,
    features: ['Sprint planning boards', 'Technical documentation', 'Code knowledge base', 'Bug tracking'],
    isRecommended: true,
  },
  {
    id: 'research',
    name: 'Research Project',
    description: 'Perfect for research teams and academic projects',
    icon: Database,
    features: ['Research notes', 'Literature review', 'Data insights', 'Collaboration tools'],
  },
  {
    id: 'marketing',
    name: 'Marketing Campaign',
    description: 'Coordinate marketing efforts and campaigns',
    icon: FileText,
    features: ['Campaign planning', 'Content calendar', 'Brand guidelines', 'Performance tracking'],
  },
];

export default function NewWorkspacePage() {
  const router = useRouter();
  const [selectedTemplate, setSelectedTemplate] = useState<string>('general');
  const [workspaceName, setWorkspaceName] = useState('');
  const [workspaceDescription, setWorkspaceDescription] = useState('');
  const [isPrivate, setIsPrivate] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCreateWorkspace = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!workspaceName.trim()) {
      setError('Workspace name is required');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Mock API call - in real app, this would call the workspace API
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      // Simulate successful creation
      const workspaceId = Math.random().toString(36).substring(2, 11);
      router.push(`/workspaces/${workspaceId}`);
    } catch (err) {
      setError('Failed to create workspace. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const selectedTemplateData = templates.find(t => t.id === selectedTemplate);

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      {/* Header */}
      <div className="flex items-center mb-8">
        <button
          onClick={() => router.push('/workspaces')}
          className="flex items-center text-gray-600 hover:text-gray-900 mr-4"
        >
          <ArrowLeft className="w-5 h-5 mr-2" />
          Back to Workspaces
        </button>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Create New Workspace</h1>
          <p className="text-gray-600">Set up a collaborative workspace for your team</p>
        </div>
      </div>

      <div className="grid gap-8 lg:grid-cols-3">
        {/* Main Form */}
        <div className="lg:col-span-2">
          <form onSubmit={handleCreateWorkspace} className="space-y-8">
            {/* Basic Information */}
            <section className="bg-white rounded-lg border border-gray-200 p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Basic Information</h2>
              
              <div className="space-y-4">
                <div>
                  <label htmlFor="workspaceName" className="block text-sm font-medium text-gray-700 mb-1">
                    Workspace Name *
                  </label>
                  <input
                    type="text"
                    id="workspaceName"
                    value={workspaceName}
                    onChange={(e) => setWorkspaceName(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="Enter workspace name"
                    required
                  />
                </div>

                <div>
                  <label htmlFor="workspaceDescription" className="block text-sm font-medium text-gray-700 mb-1">
                    Description
                  </label>
                  <textarea
                    id="workspaceDescription"
                    value={workspaceDescription}
                    onChange={(e) => setWorkspaceDescription(e.target.value)}
                    rows={3}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="Describe the purpose of this workspace"
                  />
                </div>

                <div className="flex items-center">
                  <input
                    type="checkbox"
                    id="isPrivate"
                    checked={isPrivate}
                    onChange={(e) => setIsPrivate(e.target.checked)}
                    className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                  />
                  <label htmlFor="isPrivate" className="ml-2 block text-sm text-gray-700">
                    Make this workspace private (invite-only)
                  </label>
                </div>
              </div>
            </section>

            {/* Template Selection */}
            <section className="bg-white rounded-lg border border-gray-200 p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Choose a Template</h2>
              
              <div className="grid gap-4 sm:grid-cols-2">
                {templates.map((template) => {
                  const IconComponent = template.icon;
                  return (
                    <div
                      key={template.id}
                      className={`relative border rounded-lg p-4 cursor-pointer transition-all ${
                        selectedTemplate === template.id
                          ? 'border-blue-500 bg-blue-50 shadow-md'
                          : 'border-gray-200 hover:border-gray-300 hover:shadow-sm'
                      }`}
                      onClick={() => setSelectedTemplate(template.id)}
                    >
                      {template.isRecommended && (
                        <div className="absolute -top-2 -right-2 bg-blue-600 text-white text-xs px-2 py-1 rounded-full">
                          Recommended
                        </div>
                      )}
                      
                      <div className="flex items-start space-x-3">
                        <IconComponent className={`w-8 h-8 flex-shrink-0 ${
                          selectedTemplate === template.id ? 'text-blue-600' : 'text-gray-600'
                        }`} />
                        <div className="flex-1">
                          <h3 className={`font-medium ${
                            selectedTemplate === template.id ? 'text-blue-900' : 'text-gray-900'
                          }`}>
                            {template.name}
                          </h3>
                          <p className={`text-sm mt-1 ${
                            selectedTemplate === template.id ? 'text-blue-700' : 'text-gray-600'
                          }`}>
                            {template.description}
                          </p>
                        </div>
                      </div>
                      
                      <input
                        type="radio"
                        name="template"
                        value={template.id}
                        checked={selectedTemplate === template.id}
                        onChange={() => setSelectedTemplate(template.id)}
                        className="sr-only"
                      />
                    </div>
                  );
                })}
              </div>
            </section>

            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                <p className="text-red-600">{error}</p>
              </div>
            )}

            {/* Actions */}
            <div className="flex items-center justify-end space-x-4">
              <button
                type="button"
                onClick={() => router.push('/workspaces')}
                className="px-6 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading || !workspaceName.trim()}
                className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center"
              >
                {loading ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                    Creating...
                  </>
                ) : (
                  <>
                    <Plus className="w-4 h-4 mr-2" />
                    Create Workspace
                  </>
                )}
              </button>
            </div>
          </form>
        </div>

        {/* Template Preview */}
        <div className="lg:col-span-1">
          <div className="bg-white rounded-lg border border-gray-200 p-6 sticky top-8">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Template Preview</h3>
            
            {selectedTemplateData && (
              <div className="space-y-4">
                <div className="flex items-center space-x-3">
                  <selectedTemplateData.icon className="w-8 h-8 text-blue-600" />
                  <div>
                    <h4 className="font-medium text-gray-900">{selectedTemplateData.name}</h4>
                    <p className="text-sm text-gray-600">{selectedTemplateData.description}</p>
                  </div>
                </div>

                <div>
                  <h5 className="font-medium text-gray-900 mb-2">Included Features:</h5>
                  <ul className="space-y-2">
                    {selectedTemplateData.features.map((feature, index) => (
                      <li key={index} className="flex items-center text-sm text-gray-600">
                        <div className="w-1.5 h-1.5 bg-blue-600 rounded-full mr-3"></div>
                        {feature}
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="pt-4 border-t border-gray-100">
                  <p className="text-xs text-gray-500">
                    You can customize these features after creating your workspace.
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}