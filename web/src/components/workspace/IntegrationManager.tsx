'use client';

import React from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Puzzle, Plus, Kanban, FileText, Brain, Github, Slack } from 'lucide-react';

interface IntegrationManagerProps {
  workspaceId: string;
  onIntegrationChange: (type: string, action: 'created' | 'updated' | 'deleted') => void;
}

export function IntegrationManager({ workspaceId, onIntegrationChange }: IntegrationManagerProps) {
  const availableIntegrations = [
    {
      type: 'kanban',
      name: 'Kanban Boards',
      description: 'Manage projects with Kanban boards',
      icon: Kanban,
      enabled: true,
      configured: true,
    },
    {
      type: 'wiki',
      name: 'Wiki Pages',
      description: 'Document knowledge and processes',
      icon: FileText,
      enabled: true,
      configured: true,
    },
    {
      type: 'memory',
      name: 'Memory Graph',
      description: 'Capture insights and connections',
      icon: Brain,
      enabled: true,
      configured: true,
    },
    {
      type: 'github',
      name: 'GitHub',
      description: 'Connect with GitHub repositories',
      icon: Github,
      enabled: false,
      configured: false,
    },
    {
      type: 'slack',
      name: 'Slack',
      description: 'Integrate with Slack channels',
      icon: Slack,
      enabled: false,
      configured: false,
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-gray-900">Tools & Integrations</h2>
        <Button>
          <Plus size={16} className="mr-2" />
          Add Integration
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {availableIntegrations.map((integration) => {
          const Icon = integration.icon;
          return (
            <Card key={integration.type} className="p-6">
              <div className="flex items-start space-x-4">
                <div className={`p-3 rounded-lg ${integration.enabled ? 'bg-blue-50' : 'bg-gray-50'}`}>
                  <Icon size={24} className={integration.enabled ? 'text-blue-600' : 'text-gray-400'} />
                </div>
                <div className="flex-1">
                  <h3 className="font-medium text-gray-900">{integration.name}</h3>
                  <p className="text-sm text-gray-600 mt-1">{integration.description}</p>
                  <div className="mt-3">
                    {integration.enabled ? (
                      <div className="flex items-center space-x-2">
                        <Button size="sm" variant="outline">
                          Configure
                        </Button>
                        {integration.configured && (
                          <span className="text-sm text-green-600">✓ Active</span>
                        )}
                      </div>
                    ) : (
                      <Button 
                        size="sm" 
                        onClick={() => onIntegrationChange(integration.type, 'created')}
                      >
                        Enable
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      <Card className="p-6">
        <div className="text-center">
          <Puzzle size={48} className="mx-auto text-gray-400 mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">Custom Integrations</h3>
          <p className="text-gray-600 mb-6">
            Connect your workspace with external tools and services for enhanced collaboration.
          </p>
          <Button variant="outline">
            Browse Integration Store
          </Button>
        </div>
      </Card>
    </div>
  );
}