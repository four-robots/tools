/**
 * SmartSuggestions - Personalized search query suggestions
 */

'use client';

import React from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

interface SmartSuggestionsProps {
  suggestions: any[];
  onSuggestionClick: (suggestion: any) => void;
}

export const SmartSuggestions: React.FC<SmartSuggestionsProps> = ({
  suggestions,
  onSuggestionClick
}) => {
  if (suggestions.length === 0) return null;

  return (
    <Card className="p-4">
      <div className="flex items-center space-x-2 mb-3">
        <span className="text-sm font-medium text-gray-700">💡 Smart Suggestions</span>
        <Badge variant="outline" size="sm">Based on your interests</Badge>
      </div>
      
      <div className="flex flex-wrap gap-2">
        {suggestions.map((suggestion, index) => (
          <Button
            key={suggestion.id || index}
            variant="outline"
            size="sm"
            onClick={() => onSuggestionClick(suggestion)}
            className="text-sm"
          >
            {suggestion.query || suggestion.title}
          </Button>
        ))}
      </div>
    </Card>
  );
};