/**
 * InterestProfileManager - User interest management interface
 * 
 * Comprehensive interface for managing user interests:
 * - View and organize existing interests
 * - Add explicit interests manually
 * - Discover and suggest new interests
 * - Edit interest preferences and settings
 * - Remove unwanted interests
 */

'use client';

import React, { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Alert } from '@/components/ui/alert';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';

interface UserInterest {
  id: string;
  interestType: string;
  interestName: string;
  interestDescription?: string;
  affinityScore: number;
  frequencyScore: number;
  recencyScore: number;
  depthScore: number;
  isActive: boolean;
  isExplicit: boolean;
  trendDirection: 'growing' | 'stable' | 'declining';
  trendStrength: number;
  interestKeywords: string[];
  confidenceLevel: 'low' | 'medium' | 'high';
}

interface InterestSuggestion extends Omit<UserInterest, 'id'> {
  id?: string;
  suggested?: boolean;
}

interface InterestProfileManagerProps {
  interests: UserInterest[];
  onInterestsChange: (interests: UserInterest[]) => void;
}

export const InterestProfileManager: React.FC<InterestProfileManagerProps> = ({
  interests,
  onInterestsChange
}) => {
  // State management
  const [activeFilter, setActiveFilter] = useState<'all' | 'active' | 'explicit' | 'auto'>('all');
  const [sortBy, setSortBy] = useState<'affinity' | 'name' | 'trend'>('affinity');
  const [searchQuery, setSearchQuery] = useState('');
  const [suggestions, setSuggestions] = useState<InterestSuggestion[]>([]);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [editingInterest, setEditingInterest] = useState<UserInterest | null>(null);

  // Add interest form state
  const [newInterest, setNewInterest] = useState({
    interestType: 'topic' as const,
    interestName: '',
    interestDescription: '',
    interestKeywords: [] as string[]
  });

  // Filter and sort interests
  const filteredInterests = interests
    .filter(interest => {
      if (activeFilter === 'active') return interest.isActive;
      if (activeFilter === 'explicit') return interest.isExplicit;
      if (activeFilter === 'auto') return !interest.isExplicit;
      return true;
    })
    .filter(interest => 
      searchQuery === '' || 
      interest.interestName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      interest.interestKeywords.some(keyword => 
        keyword.toLowerCase().includes(searchQuery.toLowerCase())
      )
    )
    .sort((a, b) => {
      if (sortBy === 'affinity') return b.affinityScore - a.affinityScore;
      if (sortBy === 'name') return a.interestName.localeCompare(b.interestName);
      if (sortBy === 'trend') return b.trendStrength - a.trendStrength;
      return 0;
    });

  const loadSuggestions = async () => {
    try {
      setLoadingSuggestions(true);
      
      const response = await fetch('/api/v1/personalization/interests/suggestions?count=10');
      if (!response.ok) throw new Error('Failed to load suggestions');
      
      const data = await response.json();
      setSuggestions(data.data.map((suggestion: any) => ({ ...suggestion, suggested: true })));
      
    } catch (error) {
      console.error('Error loading interest suggestions:', error);
    } finally {
      setLoadingSuggestions(false);
    }
  };

  const addInterest = async (interestData: typeof newInterest) => {
    try {
      const response = await fetch('/api/v1/personalization/interests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(interestData)
      });

      if (!response.ok) throw new Error('Failed to add interest');
      
      const data = await response.json();
      const updatedInterests = [...interests, data.data];
      onInterestsChange(updatedInterests);
      
      // Reset form
      setNewInterest({
        interestType: 'topic',
        interestName: '',
        interestDescription: '',
        interestKeywords: []
      });
      setShowAddDialog(false);

    } catch (error) {
      console.error('Error adding interest:', error);
    }
  };

  const updateInterest = async (interestId: string, updates: Partial<UserInterest>) => {
    try {
      const response = await fetch(`/api/v1/personalization/interests/${interestId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates)
      });

      if (!response.ok) throw new Error('Failed to update interest');
      
      const data = await response.json();
      const updatedInterests = interests.map(interest => 
        interest.id === interestId ? data.data : interest
      );
      onInterestsChange(updatedInterests);
      setEditingInterest(null);

    } catch (error) {
      console.error('Error updating interest:', error);
    }
  };

  const removeInterest = async (interestId: string) => {
    if (!confirm('Are you sure you want to remove this interest?')) return;

    try {
      const response = await fetch(`/api/v1/personalization/interests/${interestId}`, {
        method: 'DELETE'
      });

      if (!response.ok) throw new Error('Failed to remove interest');
      
      const updatedInterests = interests.filter(interest => interest.id !== interestId);
      onInterestsChange(updatedInterests);

    } catch (error) {
      console.error('Error removing interest:', error);
    }
  };

  const toggleInterestActive = async (interest: UserInterest) => {
    await updateInterest(interest.id, { isActive: !interest.isActive });
  };

  const addSuggestedInterest = (suggestion: InterestSuggestion) => {
    setNewInterest({
      interestType: suggestion.interestType as any,
      interestName: suggestion.interestName,
      interestDescription: suggestion.interestDescription || '',
      interestKeywords: suggestion.interestKeywords
    });
    setShowAddDialog(true);
  };

  const getTrendIcon = (direction: string) => {
    switch (direction) {
      case 'growing': return '↗️';
      case 'declining': return '↘️';
      default: return '→';
    }
  };

  const getConfidenceColor = (level: string) => {
    switch (level) {
      case 'high': return 'text-green-600 border-green-600';
      case 'medium': return 'text-yellow-600 border-yellow-600';
      case 'low': return 'text-gray-600 border-gray-600';
      default: return 'text-gray-600 border-gray-600';
    }
  };

  return (
    <div className="space-y-6">
      {/* Header and Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold">Interest Profile</h2>
          <p className="text-gray-600">Manage your interests and preferences</p>
        </div>
        
        <div className="flex items-center space-x-3">
          <Button variant="outline" onClick={loadSuggestions} disabled={loadingSuggestions}>
            {loadingSuggestions ? <LoadingSpinner size="sm" className="mr-2" /> : null}
            Discover Interests
          </Button>
          
          <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
            <DialogTrigger asChild>
              <Button>Add Interest</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add New Interest</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-2">Interest Type</label>
                  <Select 
                    value={newInterest.interestType} 
                    onValueChange={(value) => setNewInterest({...newInterest, interestType: value as any})}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="topic">Topic</SelectItem>
                      <SelectItem value="skill">Skill</SelectItem>
                      <SelectItem value="domain">Domain</SelectItem>
                      <SelectItem value="category">Category</SelectItem>
                      <SelectItem value="entity">Entity</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                
                <div>
                  <label className="block text-sm font-medium mb-2">Interest Name</label>
                  <Input
                    value={newInterest.interestName}
                    onChange={(e) => setNewInterest({...newInterest, interestName: e.target.value})}
                    placeholder="e.g., Machine Learning, React Development"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium mb-2">Description (Optional)</label>
                  <Textarea
                    value={newInterest.interestDescription}
                    onChange={(e) => setNewInterest({...newInterest, interestDescription: e.target.value})}
                    placeholder="Describe what aspects of this topic interest you..."
                    rows={3}
                  />
                </div>
                
                <div className="flex justify-end space-x-3">
                  <Button variant="outline" onClick={() => setShowAddDialog(false)}>
                    Cancel
                  </Button>
                  <Button 
                    onClick={() => addInterest(newInterest)}
                    disabled={!newInterest.interestName.trim()}
                  >
                    Add Interest
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Filters and Search */}
      <Card className="p-4">
        <div className="flex flex-col sm:flex-row sm:items-center gap-4">
          <div className="flex-1">
            <Input
              placeholder="Search interests..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full"
            />
          </div>
          
          <div className="flex items-center space-x-3">
            <Select value={activeFilter} onValueChange={(value: any) => setActiveFilter(value)}>
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="explicit">Manual</SelectItem>
                <SelectItem value="auto">Auto-detected</SelectItem>
              </SelectContent>
            </Select>
            
            <Select value={sortBy} onValueChange={(value: any) => setSortBy(value)}>
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="affinity">By Affinity</SelectItem>
                <SelectItem value="name">By Name</SelectItem>
                <SelectItem value="trend">By Trend</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </Card>

      {/* Interest Suggestions */}
      {suggestions.length > 0 && (
        <Card className="p-6">
          <h3 className="text-lg font-semibold mb-4">Suggested Interests</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {suggestions.map((suggestion, index) => (
              <div key={index} className="p-3 border border-blue-200 bg-blue-50 rounded-lg">
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <span className="font-medium text-sm">{suggestion.interestName}</span>
                    <Badge variant="outline" size="sm" className="ml-2">
                      {suggestion.interestType}
                    </Badge>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => addSuggestedInterest(suggestion)}
                  >
                    Add
                  </Button>
                </div>
                {suggestion.interestDescription && (
                  <p className="text-xs text-gray-600">{suggestion.interestDescription}</p>
                )}
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Interests List */}
      <div className="space-y-4">
        {filteredInterests.length > 0 ? (
          filteredInterests.map((interest) => (
            <Card key={interest.id} className="p-6">
              <div className="flex items-start justify-between mb-4">
                <div className="flex-1">
                  <div className="flex items-center space-x-3 mb-2">
                    <h3 className="text-lg font-medium">{interest.interestName}</h3>
                    
                    <Badge variant="outline" size="sm">
                      {interest.interestType}
                    </Badge>
                    
                    {interest.isExplicit ? (
                      <Badge variant="outline" size="sm" className="text-blue-600 border-blue-600">
                        Manual
                      </Badge>
                    ) : (
                      <Badge variant="outline" size="sm" className="text-green-600 border-green-600">
                        Auto-detected
                      </Badge>
                    )}
                    
                    <Badge variant="outline" size="sm" className={getConfidenceColor(interest.confidenceLevel)}>
                      {interest.confidenceLevel} confidence
                    </Badge>
                  </div>
                  
                  {interest.interestDescription && (
                    <p className="text-gray-600 text-sm mb-3">{interest.interestDescription}</p>
                  )}
                  
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-3">
                    <div>
                      <label className="text-xs text-gray-500 block mb-1">Affinity Score</label>
                      <div className="flex items-center space-x-2">
                        <Progress value={interest.affinityScore * 100} className="flex-1 h-2" />
                        <span className="text-sm font-medium w-12">
                          {(interest.affinityScore * 100).toFixed(0)}%
                        </span>
                      </div>
                    </div>
                    
                    <div>
                      <label className="text-xs text-gray-500 block mb-1">Frequency</label>
                      <div className="flex items-center space-x-2">
                        <Progress value={interest.frequencyScore * 100} className="flex-1 h-2" />
                        <span className="text-sm font-medium w-12">
                          {(interest.frequencyScore * 100).toFixed(0)}%
                        </span>
                      </div>
                    </div>
                    
                    <div>
                      <label className="text-xs text-gray-500 block mb-1">Trend</label>
                      <div className="flex items-center space-x-2">
                        <span className="text-sm">
                          {getTrendIcon(interest.trendDirection)} {interest.trendDirection}
                        </span>
                        <span className="text-xs text-gray-500">
                          ({(interest.trendStrength * 100).toFixed(0)}%)
                        </span>
                      </div>
                    </div>
                  </div>
                  
                  {interest.interestKeywords.length > 0 && (
                    <div className="mb-3">
                      <label className="text-xs text-gray-500 block mb-2">Keywords</label>
                      <div className="flex flex-wrap gap-1">
                        {interest.interestKeywords.slice(0, 8).map((keyword, index) => (
                          <Badge key={index} variant="secondary" size="sm">
                            {keyword}
                          </Badge>
                        ))}
                        {interest.interestKeywords.length > 8 && (
                          <Badge variant="secondary" size="sm">
                            +{interest.interestKeywords.length - 8} more
                          </Badge>
                        )}
                      </div>
                    </div>
                  )}
                </div>
                
                <div className="flex items-center space-x-2 ml-4">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => toggleInterestActive(interest)}
                    className={interest.isActive ? 'text-green-600 border-green-600' : 'text-gray-600'}
                  >
                    {interest.isActive ? 'Active' : 'Inactive'}
                  </Button>
                  
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setEditingInterest(interest)}
                  >
                    Edit
                  </Button>
                  
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => removeInterest(interest.id)}
                    className="text-red-600 hover:text-red-700"
                  >
                    Remove
                  </Button>
                </div>
              </div>
            </Card>
          ))
        ) : (
          <Card className="p-8 text-center">
            <p className="text-gray-500 mb-4">
              {searchQuery ? 'No interests match your search.' : 'No interests found.'}
            </p>
            {!searchQuery && (
              <Button onClick={() => setShowAddDialog(true)}>
                Add Your First Interest
              </Button>
            )}
          </Card>
        )}
      </div>

      {/* Stats Summary */}
      <Card className="p-4">
        <div className="flex items-center justify-between text-sm text-gray-600">
          <span>Total interests: {interests.length}</span>
          <span>Active interests: {interests.filter(i => i.isActive).length}</span>
          <span>Explicit interests: {interests.filter(i => i.isExplicit).length}</span>
          <span>Showing: {filteredInterests.length}</span>
        </div>
      </Card>
    </div>
  );
};