import { useState, useEffect, useCallback } from 'react';
import { DashboardConfiguration, DashboardWidget, ApiResponse } from '@shared/types';
import { analyticsApi } from '../utils/analyticsApi';

interface UseDashboardDataReturn {
  dashboard?: DashboardConfiguration;
  dashboards: DashboardConfiguration[];
  isLoading: boolean;
  isLoadingDashboards: boolean;
  error?: string;
  
  // Dashboard operations
  loadDashboard: (dashboardId: string) => Promise<void>;
  saveDashboard: (dashboard: DashboardConfiguration) => Promise<void>;
  createDashboard: (data?: Partial<DashboardConfiguration>) => Promise<DashboardConfiguration>;
  deleteDashboard: (dashboardId: string) => Promise<void>;
  refreshDashboard: () => Promise<void>;
  
  // Widget operations
  addWidget: (widget: DashboardWidget) => Promise<void>;
  updateWidget: (widget: DashboardWidget) => Promise<void>;
  removeWidget: (widgetId: string) => Promise<void>;
  
  // Batch operations
  loadDashboards: () => Promise<void>;
  duplicateDashboard: (dashboardId: string, newName: string) => Promise<DashboardConfiguration>;
}

export default function useDashboardData(
  initialDashboardId?: string
): UseDashboardDataReturn {
  const [dashboard, setDashboard] = useState<DashboardConfiguration>();
  const [dashboards, setDashboards] = useState<DashboardConfiguration[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingDashboards, setIsLoadingDashboards] = useState(false);
  const [error, setError] = useState<string>();

  // Load a specific dashboard
  const loadDashboard = useCallback(async (dashboardId: string) => {
    setIsLoading(true);
    setError(undefined);
    
    try {
      const response = await analyticsApi.getDashboard(dashboardId);
      
      if (response.success && response.data) {
        setDashboard(response.data);
      } else {
        setError(response.message || 'Failed to load dashboard');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Load all dashboards
  const loadDashboards = useCallback(async () => {
    setIsLoadingDashboards(true);
    
    try {
      const response = await analyticsApi.getDashboards();
      
      if (response.success && response.data) {
        setDashboards(response.data);
      }
    } catch (err) {
      console.error('Failed to load dashboards:', err);
    } finally {
      setIsLoadingDashboards(false);
    }
  }, []);

  // Save dashboard
  const saveDashboard = useCallback(async (dashboardData: DashboardConfiguration) => {
    setError(undefined);
    
    try {
      let response: ApiResponse<DashboardConfiguration>;
      
      if (dashboardData.id) {
        // Update existing dashboard
        response = await analyticsApi.updateDashboard(dashboardData.id, dashboardData);
      } else {
        // Create new dashboard
        response = await analyticsApi.createDashboard(dashboardData);
      }
      
      if (response.success && response.data) {
        setDashboard(response.data);
        
        // Update dashboards list
        setDashboards(prev => {
          const updated = prev.filter(d => d.id !== response.data!.id);
          return [response.data!, ...updated];
        });
      } else {
        setError(response.message || 'Failed to save dashboard');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    }
  }, []);

  // Create new dashboard
  const createDashboard = useCallback(async (
    data: Partial<DashboardConfiguration> = {}
  ): Promise<DashboardConfiguration> => {
    const defaultDashboard: Omit<DashboardConfiguration, 'id' | 'createdAt' | 'updatedAt'> = {
      name: 'New Dashboard',
      description: '',
      layout: {
        columns: 12,
        rowHeight: 150,
        margin: [10, 10]
      },
      widgets: [],
      ownerId: '', // Will be set by API
      sharedWithUsers: [],
      sharedWithWorkspaces: [],
      isPublic: false,
      refreshIntervalSeconds: 30,
      autoRefreshEnabled: true,
      ...data
    };

    const response = await analyticsApi.createDashboard(defaultDashboard);
    
    if (response.success && response.data) {
      const newDashboard = response.data;
      setDashboards(prev => [newDashboard, ...prev]);
      return newDashboard;
    } else {
      throw new Error(response.message || 'Failed to create dashboard');
    }
  }, []);

  // Delete dashboard
  const deleteDashboard = useCallback(async (dashboardId: string) => {
    try {
      const response = await analyticsApi.deleteDashboard(dashboardId);
      
      if (response.success) {
        setDashboards(prev => prev.filter(d => d.id !== dashboardId));
        
        if (dashboard?.id === dashboardId) {
          setDashboard(undefined);
        }
      } else {
        throw new Error(response.message || 'Failed to delete dashboard');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
      throw err;
    }
  }, [dashboard]);

  // Refresh current dashboard
  const refreshDashboard = useCallback(async () => {
    if (dashboard?.id) {
      await loadDashboard(dashboard.id);
    }
  }, [dashboard?.id, loadDashboard]);

  // Add widget to dashboard
  const addWidget = useCallback(async (widget: DashboardWidget) => {
    if (!dashboard) throw new Error('No dashboard loaded');
    
    const updatedDashboard: DashboardConfiguration = {
      ...dashboard,
      widgets: [...dashboard.widgets, widget]
    };
    
    await saveDashboard(updatedDashboard);
  }, [dashboard, saveDashboard]);

  // Update widget in dashboard
  const updateWidget = useCallback(async (updatedWidget: DashboardWidget) => {
    if (!dashboard) throw new Error('No dashboard loaded');
    
    const updatedDashboard: DashboardConfiguration = {
      ...dashboard,
      widgets: dashboard.widgets.map(w => 
        w.id === updatedWidget.id ? updatedWidget : w
      )
    };
    
    await saveDashboard(updatedDashboard);
  }, [dashboard, saveDashboard]);

  // Remove widget from dashboard
  const removeWidget = useCallback(async (widgetId: string) => {
    if (!dashboard) throw new Error('No dashboard loaded');
    
    const updatedDashboard: DashboardConfiguration = {
      ...dashboard,
      widgets: dashboard.widgets.filter(w => w.id !== widgetId)
    };
    
    await saveDashboard(updatedDashboard);
  }, [dashboard, saveDashboard]);

  // Duplicate dashboard
  const duplicateDashboard = useCallback(async (
    dashboardId: string, 
    newName: string
  ): Promise<DashboardConfiguration> => {
    try {
      const response = await analyticsApi.getDashboard(dashboardId);
      
      if (!response.success || !response.data) {
        throw new Error('Failed to load dashboard for duplication');
      }
      
      const originalDashboard = response.data;
      
      const duplicatedDashboard = {
        ...originalDashboard,
        name: newName,
        id: undefined,
        createdAt: undefined,
        updatedAt: undefined,
        widgets: originalDashboard.widgets.map(widget => ({
          ...widget,
          id: crypto.randomUUID() // Generate new IDs for widgets
        }))
      };
      
      return await createDashboard(duplicatedDashboard);
    } catch (err) {
      throw new Error(err instanceof Error ? err.message : 'Failed to duplicate dashboard');
    }
  }, [createDashboard]);

  // Load initial dashboard
  useEffect(() => {
    if (initialDashboardId) {
      loadDashboard(initialDashboardId);
    }
  }, [initialDashboardId, loadDashboard]);

  // Load dashboards list on mount
  useEffect(() => {
    loadDashboards();
  }, [loadDashboards]);

  return {
    dashboard,
    dashboards,
    isLoading,
    isLoadingDashboards,
    error,
    
    loadDashboard,
    saveDashboard,
    createDashboard,
    deleteDashboard,
    refreshDashboard,
    
    addWidget,
    updateWidget,
    removeWidget,
    
    loadDashboards,
    duplicateDashboard
  };
}

// API utility functions
const analyticsApi = {
  async getDashboards(): Promise<ApiResponse<DashboardConfiguration[]>> {
    const response = await fetch('/api/analytics/dashboards', {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });
    
    return await response.json();
  },

  async getDashboard(dashboardId: string): Promise<ApiResponse<DashboardConfiguration>> {
    const response = await fetch(`/api/analytics/dashboards/${dashboardId}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });
    
    return await response.json();
  },

  async createDashboard(
    dashboard: Omit<DashboardConfiguration, 'id' | 'createdAt' | 'updatedAt'>
  ): Promise<ApiResponse<DashboardConfiguration>> {
    const response = await fetch('/api/analytics/dashboards', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(dashboard),
    });
    
    return await response.json();
  },

  async updateDashboard(
    dashboardId: string,
    dashboard: Partial<DashboardConfiguration>
  ): Promise<ApiResponse<DashboardConfiguration>> {
    const response = await fetch(`/api/analytics/dashboards/${dashboardId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(dashboard),
    });
    
    return await response.json();
  },

  async deleteDashboard(dashboardId: string): Promise<ApiResponse<void>> {
    const response = await fetch(`/api/analytics/dashboards/${dashboardId}`, {
      method: 'DELETE',
    });
    
    return await response.json();
  },
};