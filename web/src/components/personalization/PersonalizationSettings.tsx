/**
 * PersonalizationSettings - Core personalization configuration
 */

'use client';

import React from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { LoadingSpinner } from '@/components/ui/loading-spinner';

interface PersonalizationSettingsProps {
  profile: any;
  onProfileChange: (updates: any) => void;
  onSave: (updates: any) => Promise<void>;
  isSaving: boolean;
}

export const PersonalizationSettings: React.FC<PersonalizationSettingsProps> = ({
  profile,
  onProfileChange,
  onSave,
  isSaving
}) => {
  if (!profile) return <div>Loading...</div>;

  return (
    <Card className="p-6">
      <h3 className="text-lg font-semibold mb-4">Personalization Settings</h3>
      
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium mb-2">Personalization Level</label>
          <Select 
            value={profile.personalizationLevel} 
            onValueChange={(value) => onProfileChange({ personalizationLevel: value })}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="low">Low - Minimal personalization</SelectItem>
              <SelectItem value="medium">Medium - Balanced personalization</SelectItem>
              <SelectItem value="high">High - Full personalization</SelectItem>
              <SelectItem value="custom">Custom - Advanced settings</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center justify-between">
          <div>
            <h4 className="font-medium">Learning Enabled</h4>
            <p className="text-sm text-gray-600">Allow the system to learn from your behavior</p>
          </div>
          <Button
            variant={profile.learningEnabled ? "default" : "outline"}
            size="sm"
            onClick={() => onProfileChange({ learningEnabled: !profile.learningEnabled })}
          >
            {profile.learningEnabled ? "On" : "Off"}
          </Button>
        </div>

        <div className="flex items-center justify-between">
          <div>
            <h4 className="font-medium">Suggestions Enabled</h4>
            <p className="text-sm text-gray-600">Show personalized suggestions and recommendations</p>
          </div>
          <Button
            variant={profile.suggestionEnabled ? "default" : "outline"}
            size="sm"
            onClick={() => onProfileChange({ suggestionEnabled: !profile.suggestionEnabled })}
          >
            {profile.suggestionEnabled ? "On" : "Off"}
          </Button>
        </div>
      </div>
    </Card>
  );
};