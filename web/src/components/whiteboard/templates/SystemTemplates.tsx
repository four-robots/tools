import React, { useState, useEffect, useCallback } from 'react';
import { Sparkles, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { TemplateCard } from './TemplateCard';
import { WhiteboardTemplate } from '@/types/whiteboard';
import { cn } from '@/lib/utils';

export interface SystemTemplatesProps {
  onSelectTemplate?: (template: WhiteboardTemplate) => void;
  className?: string;
}

// System template definitions with rich metadata
const SYSTEM_TEMPLATES = [
  {
    id: 'brainstorming-session',
    name: 'Brainstorming Session',
    description: 'Collaborative idea generation with sticky notes, voting areas, and categorization zones',
    category: 'Brainstorming',
    thumbnail: '🧠',
    tags: ['collaboration', 'creativity', 'ideas', 'workshop'],
    usageCount: 1250,
    rating: 4.8,
    color: 'from-purple-400 to-pink-400',
    elements: [
      'Idea collection area',
      'Voting dots',
      'Category groupings',
      'Action items section'
    ]
  },
  {
    id: 'project-planning-timeline',
    name: 'Project Planning Timeline',
    description: 'Comprehensive project timeline with milestones, dependencies, and resource allocation',
    category: 'Project Planning',
    thumbnail: '📅',
    tags: ['project', 'timeline', 'planning', 'milestones'],
    usageCount: 980,
    rating: 4.7,
    color: 'from-blue-400 to-cyan-400',
    elements: [
      'Timeline grid',
      'Milestone markers',
      'Task dependencies',
      'Resource swimlanes'
    ]
  },
  {
    id: 'user-journey-mapping',
    name: 'User Journey Mapping',
    description: 'Customer journey visualization with touchpoints, emotions, and pain points',
    category: 'User Journey',
    thumbnail: '🗺️',
    tags: ['ux', 'customer', 'journey', 'touchpoints'],
    usageCount: 750,
    rating: 4.9,
    color: 'from-green-400 to-emerald-400',
    elements: [
      'Journey stages',
      'Touchpoint markers',
      'Emotion graph',
      'Opportunity areas'
    ]
  },
  {
    id: 'wireframe-kit',
    name: 'Wireframe Kit',
    description: 'Complete UI wireframing toolkit with components, layouts, and interaction flows',
    category: 'Wireframes',
    thumbnail: '📱',
    tags: ['ui', 'wireframe', 'design', 'prototype'],
    usageCount: 1100,
    rating: 4.6,
    color: 'from-gray-400 to-slate-400',
    elements: [
      'UI components library',
      'Layout grids',
      'Navigation flows',
      'Annotation tools'
    ]
  },
  {
    id: 'retrospective-board',
    name: 'Team Retrospective',
    description: 'Structured retrospective with Start/Stop/Continue format and action planning',
    category: 'Retrospectives',
    thumbnail: '🔄',
    tags: ['agile', 'retrospective', 'team', 'improvement'],
    usageCount: 890,
    rating: 4.8,
    color: 'from-orange-400 to-red-400',
    elements: [
      'Start doing section',
      'Stop doing section',
      'Continue doing section',
      'Action items tracker'
    ]
  },
  {
    id: 'swot-analysis',
    name: 'SWOT Analysis',
    description: 'Strategic analysis framework for Strengths, Weaknesses, Opportunities, and Threats',
    category: 'Analysis',
    thumbnail: '⚖️',
    tags: ['strategy', 'analysis', 'planning', 'business'],
    usageCount: 670,
    rating: 4.5,
    color: 'from-indigo-400 to-purple-400',
    elements: [
      'Strengths quadrant',
      'Weaknesses quadrant',
      'Opportunities quadrant',
      'Threats quadrant'
    ]
  },
  {
    id: 'business-model-canvas',
    name: 'Business Model Canvas',
    description: 'Strategic business model design with 9 essential building blocks',
    category: 'Business Model',
    thumbnail: '🏢',
    tags: ['business', 'strategy', 'model', 'canvas'],
    usageCount: 560,
    rating: 4.7,
    color: 'from-yellow-400 to-orange-400',
    elements: [
      'Value propositions',
      'Customer segments',
      'Revenue streams',
      'Key partnerships'
    ]
  },
  {
    id: 'process-flowchart',
    name: 'Process Flowchart',
    description: 'Decision flowchart with standard symbols, connectors, and process documentation',
    category: 'Flowcharts',
    thumbnail: '🔀',
    tags: ['process', 'flowchart', 'workflow', 'documentation'],
    usageCount: 820,
    rating: 4.6,
    color: 'from-teal-400 to-blue-400',
    elements: [
      'Decision nodes',
      'Process steps',
      'Connectors',
      'Start/end points'
    ]
  },
  {
    id: 'meeting-notes',
    name: 'Meeting Notes',
    description: 'Structured meeting documentation with agenda, notes, decisions, and action items',
    category: 'Meeting Notes',
    thumbnail: '📝',
    tags: ['meeting', 'notes', 'agenda', 'actions'],
    usageCount: 1350,
    rating: 4.4,
    color: 'from-pink-400 to-rose-400',
    elements: [
      'Meeting agenda',
      'Discussion notes',
      'Decisions made',
      'Action items'
    ]
  },
  {
    id: 'design-system',
    name: 'Design System',
    description: 'Component library and design standards documentation with style guides',
    category: 'Design System',
    thumbnail: '🎨',
    tags: ['design', 'system', 'components', 'standards'],
    usageCount: 420,
    rating: 4.9,
    color: 'from-violet-400 to-purple-400',
    elements: [
      'Component library',
      'Color palette',
      'Typography scale',
      'Usage guidelines'
    ]
  }
];

export function SystemTemplates({ onSelectTemplate, className = '' }: SystemTemplatesProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [visibleCount, setVisibleCount] = useState(4);

  // Update visible count based on screen size
  useEffect(() => {
    const updateVisibleCount = () => {
      const width = window.innerWidth;
      if (width < 640) setVisibleCount(1);
      else if (width < 1024) setVisibleCount(2);
      else if (width < 1280) setVisibleCount(3);
      else setVisibleCount(4);
    };

    updateVisibleCount();
    window.addEventListener('resize', updateVisibleCount);
    return () => window.removeEventListener('resize', updateVisibleCount);
  }, []);

  // Navigation handlers
  const goToPrevious = useCallback(() => {
    setCurrentIndex(prev => Math.max(0, prev - 1));
  }, []);

  const goToNext = useCallback(() => {
    setCurrentIndex(prev => 
      Math.min(SYSTEM_TEMPLATES.length - visibleCount, prev + 1)
    );
  }, [visibleCount]);

  // Handle template selection
  const handleSelectTemplate = useCallback((systemTemplate: any) => {
    if (onSelectTemplate) {
      // Convert system template to WhiteboardTemplate format
      const template: WhiteboardTemplate = {
        id: systemTemplate.id,
        name: systemTemplate.name,
        description: systemTemplate.description,
        category: systemTemplate.category,
        thumbnail: undefined, // Will be generated
        templateData: {
          canvasData: {},
          defaultElements: [],
          defaultSettings: {},
          placeholders: [],
        },
        defaultSettings: {},
        tags: systemTemplate.tags,
        isPublic: true,
        workspaceId: undefined,
        usageCount: systemTemplate.usageCount,
        rating: systemTemplate.rating,
        createdBy: 'system',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      
      onSelectTemplate(template);
    }
  }, [onSelectTemplate]);

  // Get visible templates
  const visibleTemplates = SYSTEM_TEMPLATES.slice(currentIndex, currentIndex + visibleCount);

  // Check navigation availability
  const canGoBack = currentIndex > 0;
  const canGoForward = currentIndex < SYSTEM_TEMPLATES.length - visibleCount;

  return (
    <div className={cn("system-templates", className)}>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-gradient-to-r from-purple-100 to-pink-100 rounded-lg">
            <Sparkles className="h-5 w-5 text-purple-600" />
          </div>
          <div>
            <h3 className="text-xl font-semibold text-gray-900">System Templates</h3>
            <p className="text-sm text-gray-600">
              Professional templates designed for common use cases
            </p>
          </div>
        </div>

        {/* Navigation Controls */}
        <div className="flex items-center gap-1">
          <Button
            size="sm"
            variant="outline"
            onClick={goToPrevious}
            disabled={!canGoBack}
            className="h-8 w-8 p-0"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={goToNext}
            disabled={!canGoForward}
            className="h-8 w-8 p-0"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Template Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {visibleTemplates.map((template, index) => (
          <Card
            key={template.id}
            className="system-template-card cursor-pointer hover:shadow-lg transition-all duration-200 group overflow-hidden"
            onClick={() => handleSelectTemplate(template)}
          >
            <CardHeader className="pb-3">
              {/* Template Thumbnail */}
              <div className={cn(
                "relative w-full h-32 rounded-lg flex items-center justify-center text-6xl bg-gradient-to-br",
                template.color,
                "group-hover:scale-105 transition-transform duration-200"
              )}>
                <div className="text-white opacity-90">
                  {template.thumbnail}
                </div>
                
                {/* Overlay */}
                <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-10 transition-all duration-200 rounded-lg" />
                
                {/* System Badge */}
                <Badge className="absolute top-2 left-2 text-xs bg-white bg-opacity-90 text-gray-800">
                  System
                </Badge>
                
                {/* Rating Badge */}
                <Badge className="absolute top-2 right-2 text-xs bg-white bg-opacity-90 text-gray-800">
                  ⭐ {template.rating}
                </Badge>
              </div>
            </CardHeader>

            <CardContent className="space-y-3">
              {/* Template Info */}
              <div>
                <h4 className="font-semibold text-gray-900 line-clamp-1">
                  {template.name}
                </h4>
                <p className="text-sm text-gray-600 line-clamp-2 mt-1">
                  {template.description}
                </p>
              </div>

              {/* Template Tags */}
              <div className="flex flex-wrap gap-1">
                {template.tags.slice(0, 2).map((tag) => (
                  <Badge key={tag} variant="secondary" className="text-xs">
                    {tag}
                  </Badge>
                ))}
                {template.tags.length > 2 && (
                  <Badge variant="outline" className="text-xs">
                    +{template.tags.length - 2}
                  </Badge>
                )}
              </div>

              {/* Template Elements Preview */}
              <div className="space-y-2">
                <p className="text-xs font-medium text-gray-700">Includes:</p>
                <div className="text-xs text-gray-600 space-y-1">
                  {template.elements.slice(0, 2).map((element, idx) => (
                    <div key={idx} className="flex items-center gap-1">
                      <div className="w-1 h-1 bg-gray-400 rounded-full" />
                      {element}
                    </div>
                  ))}
                  {template.elements.length > 2 && (
                    <div className="text-xs text-gray-500">
                      +{template.elements.length - 2} more components
                    </div>
                  )}
                </div>
              </div>

              {/* Usage Stats */}
              <div className="flex items-center justify-between text-xs text-gray-500 pt-2 border-t">
                <span className="flex items-center gap-1">
                  Used {template.usageCount.toLocaleString()} times
                </span>
                <Badge variant="outline" className="text-xs">
                  {template.category}
                </Badge>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Template Counter */}
      <div className="flex justify-center mt-6">
        <div className="text-sm text-gray-500">
          Showing {currentIndex + 1}-{Math.min(currentIndex + visibleCount, SYSTEM_TEMPLATES.length)} of {SYSTEM_TEMPLATES.length} system templates
        </div>
      </div>

      {/* Featured Template Highlight */}
      <Card className="mt-8 bg-gradient-to-r from-blue-50 to-purple-50 border-blue-200">
        <CardContent className="p-6">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-blue-100 rounded-lg">
              <Sparkles className="h-6 w-6 text-blue-600" />
            </div>
            <div className="flex-1">
              <h4 className="font-semibold text-gray-900 mb-1">
                New to whiteboarding?
              </h4>
              <p className="text-sm text-gray-600">
                Start with our most popular template: <strong>Brainstorming Session</strong>. 
                Perfect for team ideation and collaborative thinking.
              </p>
            </div>
            <Button
              onClick={() => handleSelectTemplate(SYSTEM_TEMPLATES[0])}
              className="bg-blue-600 hover:bg-blue-700"
            >
              Try It Now
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}