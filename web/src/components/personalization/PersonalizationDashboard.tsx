/**
 * PersonalizationDashboard - Comprehensive personalization control center
 * 
 * Main dashboard for managing all personalization features:
 * - Personalization profile settings
 * - Interest management and discovery
 * - Recommendation preferences
 * - Interface customization
 * - Privacy controls
 * - Analytics and insights
 */

'use client';

import React, { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Alert } from '@/components/ui/alert';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { InterestProfileManager } from './InterestProfileManager';
import { PersonalizationSettings } from './PersonalizationSettings';
import { RecommendationPreferences } from './RecommendationPreferences';
import { InterfaceCustomization } from './InterfaceCustomization';
import { PersonalizationAnalytics } from './PersonalizationAnalytics';
import { PrivacyControls } from './PrivacyControls';

interface PersonalizationProfile {
  id: string;
  profileName: string;
  personalizationLevel: 'low' | 'medium' | 'high' | 'custom';
  learningEnabled: boolean;
  suggestionEnabled: boolean;
  recommendationEnabled: boolean;
  lastUsedAt: string;
}

interface UserInterest {
  id: string;
  interestType: string;
  interestName: string;
  affinityScore: number;
  isActive: boolean;
  isExplicit: boolean;
  trendDirection: 'growing' | 'stable' | 'declining';
}

interface PersonalizationAnalytics {
  totalInterests: number;
  activeInterests: number;
  explicitInterests: number;
  averageAffinityScore: number;
  activeRecommendations: number;
  personalizationLevel: string;
}

export const PersonalizationDashboard: React.FC = () => {
  // State management
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('overview');
  
  // Data state
  const [profile, setProfile] = useState<PersonalizationProfile | null>(null);
  const [interests, setInterests] = useState<UserInterest[]>([]);
  const [analytics, setAnalytics] = useState<PersonalizationAnalytics | null>(null);
  const [recommendations, setRecommendations] = useState<any[]>([]);

  // UI state
  const [isSaving, setIsSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  // Load personalization data
  useEffect(() => {
    loadPersonalizationData();
  }, []);

  const loadPersonalizationData = async () => {
    try {
      setLoading(true);
      setError(null);

      // Load all personalization data in parallel
      const [profileRes, interestsRes, analyticsRes, recommendationsRes] = await Promise.all([
        fetch('/api/v1/personalization/profile'),
        fetch('/api/v1/personalization/interests'),
        fetch('/api/v1/personalization/analytics'),
        fetch('/api/v1/personalization/recommendations?count=5')
      ]);

      if (!profileRes.ok || !interestsRes.ok || !analyticsRes.ok || !recommendationsRes.ok) {
        throw new Error('Failed to load personalization data');
      }

      const [profileData, interestsData, analyticsData, recommendationsData] = await Promise.all([
        profileRes.json(),
        interestsRes.json(),
        analyticsRes.json(),
        recommendationsRes.json()
      ]);

      setProfile(profileData.data);
      setInterests(interestsData.data);
      setAnalytics(analyticsData.data.metrics);
      setRecommendations(recommendationsData.data);

    } catch (err) {
      console.error('Error loading personalization data:', err);
      setError('Failed to load personalization data. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const saveProfile = async (updates: Partial<PersonalizationProfile>) => {
    try {
      setIsSaving(true);
      
      const response = await fetch('/api/v1/personalization/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates)
      });

      if (!response.ok) {
        throw new Error('Failed to save profile');
      }

      const data = await response.json();
      setProfile(data.data);
      setLastSaved(new Date());
      setHasUnsavedChanges(false);

    } catch (err) {
      console.error('Error saving profile:', err);
      setError('Failed to save changes. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const resetProfile = async () => {
    if (!confirm('Are you sure you want to reset your personalization profile? This cannot be undone.')) {
      return;
    }

    try {
      setIsSaving(true);
      
      const response = await fetch('/api/v1/personalization/profile/reset', {
        method: 'POST'
      });

      if (!response.ok) {
        throw new Error('Failed to reset profile');
      }

      await loadPersonalizationData(); // Reload all data
      setLastSaved(new Date());
      setHasUnsavedChanges(false);

    } catch (err) {
      console.error('Error resetting profile:', err);
      setError('Failed to reset profile. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleTabChange = (value: string) => {
    setActiveTab(value);
  };

  const handleInterestsChange = (newInterests: UserInterest[]) => {
    setInterests(newInterests);
    setHasUnsavedChanges(true);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-64">
        <LoadingSpinner size="lg" />
        <span className="ml-3 text-lg">Loading personalization dashboard...</span>
      </div>
    );
  }

  if (error) {
    return (
      <Alert variant="destructive" className="mb-6">
        <div className="flex items-center justify-between">
          <span>{error}</span>
          <Button variant="outline" size="sm" onClick={loadPersonalizationData}>
            Retry
          </Button>
        </div>
      </Alert>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Personalization Dashboard</h1>
          <p className="text-gray-600 mt-1">
            Customize your search experience and manage your preferences
          </p>
        </div>
        
        <div className="flex items-center space-x-3">
          {hasUnsavedChanges && (
            <Badge variant="outline" className="text-orange-600 border-orange-600">
              Unsaved changes
            </Badge>
          )}
          
          {lastSaved && (
            <span className="text-sm text-gray-500">
              Last saved: {lastSaved.toLocaleTimeString()}
            </span>
          )}
          
          <Button 
            variant="outline" 
            onClick={resetProfile}
            disabled={isSaving}
          >
            Reset to Defaults
          </Button>
        </div>
      </div>

      {/* Quick Stats */}
      {analytics && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Active Interests</p>
                <p className="text-2xl font-bold text-blue-600">{analytics.activeInterests}</p>
              </div>
              <div className="text-blue-500">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
                </svg>
              </div>
            </div>
          </Card>

          <Card className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Avg. Affinity Score</p>
                <p className="text-2xl font-bold text-green-600">
                  {(analytics.averageAffinityScore * 100).toFixed(0)}%
                </p>
              </div>
              <Progress value={analytics.averageAffinityScore * 100} className="w-12 h-2" />
            </div>
          </Card>

          <Card className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Recommendations</p>
                <p className="text-2xl font-bold text-purple-600">{analytics.activeRecommendations}</p>
              </div>
              <div className="text-purple-500">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
                </svg>
              </div>
            </div>
          </Card>

          <Card className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Personalization Level</p>
                <p className="text-2xl font-bold text-indigo-600 capitalize">
                  {analytics.personalizationLevel}
                </p>
              </div>
              <Badge 
                variant={analytics.personalizationLevel === 'high' ? 'default' : 'secondary'}
                className="capitalize"
              >
                {analytics.personalizationLevel}
              </Badge>
            </div>
          </Card>
        </div>
      )}

      {/* Main Dashboard Tabs */}
      <Tabs value={activeTab} onValueChange={handleTabChange} className="space-y-4">
        <TabsList className="grid w-full grid-cols-6">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="interests">Interests</TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
          <TabsTrigger value="interface">Interface</TabsTrigger>
          <TabsTrigger value="analytics">Analytics</TabsTrigger>
          <TabsTrigger value="privacy">Privacy</TabsTrigger>
        </Tabs>

        <TabsContent value="overview" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Profile Summary */}
            <Card className="p-6">
              <h3 className="text-lg font-semibold mb-4">Profile Summary</h3>
              {profile && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-600">Profile Name:</span>
                    <span className="font-medium">{profile.profileName}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-600">Personalization Level:</span>
                    <Badge variant="outline" className="capitalize">
                      {profile.personalizationLevel}
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-600">Learning Enabled:</span>
                    <Badge variant={profile.learningEnabled ? 'default' : 'secondary'}>
                      {profile.learningEnabled ? 'Yes' : 'No'}
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-600">Last Used:</span>
                    <span className="text-sm">
                      {new Date(profile.lastUsedAt).toLocaleDateString()}
                    </span>
                  </div>
                </div>
              )}
            </Card>

            {/* Recent Recommendations */}
            <Card className="p-6">
              <h3 className="text-lg font-semibold mb-4">Recent Recommendations</h3>
              <div className="space-y-3">
                {recommendations.length > 0 ? (
                  recommendations.map((rec) => (
                    <div key={rec.id} className="flex items-start space-x-3 p-3 bg-gray-50 rounded-lg">
                      <div className="flex-1">
                        <p className="font-medium text-sm">{rec.recommendationTitle}</p>
                        <p className="text-xs text-gray-600 mt-1">{rec.recommendationDescription}</p>
                        <div className="flex items-center mt-2 space-x-2">
                          <Badge variant="outline" size="sm">
                            {rec.recommendationType}
                          </Badge>
                          <span className="text-xs text-gray-500">
                            {(rec.relevanceScore * 100).toFixed(0)}% relevant
                          </span>
                        </div>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-gray-500 text-center py-4">
                    No recommendations yet. Start using the search to get personalized suggestions!
                  </p>
                )}
              </div>
            </Card>
          </div>

          {/* Top Interests */}
          <Card className="p-6">
            <h3 className="text-lg font-semibold mb-4">Your Top Interests</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {interests.slice(0, 6).map((interest) => (
                <div key={interest.id} className="flex items-center space-x-3 p-3 bg-gray-50 rounded-lg">
                  <div className="flex-1">
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-medium text-sm">{interest.interestName}</span>
                      <Badge 
                        variant="outline" 
                        size="sm"
                        className={`
                          ${interest.trendDirection === 'growing' ? 'text-green-600 border-green-600' : ''}
                          ${interest.trendDirection === 'declining' ? 'text-red-600 border-red-600' : ''}
                        `}
                      >
                        {interest.trendDirection === 'growing' && '↗'}
                        {interest.trendDirection === 'declining' && '↘'}
                        {interest.trendDirection === 'stable' && '→'}
                      </Badge>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Progress value={interest.affinityScore * 100} className="flex-1 h-2" />
                      <span className="text-xs text-gray-500">
                        {(interest.affinityScore * 100).toFixed(0)}%
                      </span>
                    </div>
                    <div className="flex items-center mt-1 space-x-1">
                      <Badge variant="outline" size="sm" className="text-xs">
                        {interest.interestType}
                      </Badge>
                      {interest.isExplicit && (
                        <Badge variant="outline" size="sm" className="text-xs text-blue-600 border-blue-600">
                          explicit
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
            
            {interests.length === 0 && (
              <p className="text-sm text-gray-500 text-center py-8">
                No interests detected yet. Use the search and we'll learn about your preferences!
              </p>
            )}
          </Card>
        </TabsContent>

        <TabsContent value="interests">
          <InterestProfileManager 
            interests={interests}
            onInterestsChange={handleInterestsChange}
          />
        </TabsContent>

        <TabsContent value="settings">
          <PersonalizationSettings 
            profile={profile}
            onProfileChange={(updates) => {
              setProfile(prev => prev ? { ...prev, ...updates } : null);
              setHasUnsavedChanges(true);
            }}
            onSave={saveProfile}
            isSaving={isSaving}
          />
        </TabsContent>

        <TabsContent value="interface">
          <InterfaceCustomization 
            profile={profile}
            onPreferencesChange={(preferences) => {
              setHasUnsavedChanges(true);
            }}
          />
        </TabsContent>

        <TabsContent value="analytics">
          <PersonalizationAnalytics 
            analytics={analytics}
            interests={interests}
            profile={profile}
          />
        </TabsContent>

        <TabsContent value="privacy">
          <PrivacyControls 
            profile={profile}
            onSettingsChange={(settings) => {
              setHasUnsavedChanges(true);
            }}
          />
        </TabsContent>
      </Tabs>

      {/* Save Changes Bar */}
      {hasUnsavedChanges && (
        <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 p-4 shadow-lg">
          <div className="max-w-6xl mx-auto flex items-center justify-between">
            <span className="text-sm text-gray-600">You have unsaved changes</span>
            <div className="flex items-center space-x-3">
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => {
                  setHasUnsavedChanges(false);
                  loadPersonalizationData();
                }}
                disabled={isSaving}
              >
                Discard Changes
              </Button>
              <Button 
                size="sm"
                onClick={() => profile && saveProfile(profile)}
                disabled={isSaving}
              >
                {isSaving ? <LoadingSpinner size="sm" className="mr-2" /> : null}
                Save Changes
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};