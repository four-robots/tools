import React, { useState, useEffect, useCallback } from 'react';
import { DashboardConfiguration, DashboardWidget } from '@shared/types';
import { DashboardProps, ConnectionState, AlertNotification } from './types';
import DashboardLayout from './DashboardLayout';
import DashboardConfigPanel from './DashboardConfigPanel';
import AlertNotifications from './alerts/AlertNotifications';
import RealtimeIndicator from './realtime/RealtimeIndicator';
import ConnectionStatus from './realtime/ConnectionStatus';
import useAnalyticsSocket from './hooks/useAnalyticsSocket';
import useDashboardData from './hooks/useDashboardData';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { 
  Plus, 
  Settings, 
  Eye, 
  Edit3,
  Share,
  RefreshCw
} from 'lucide-react';

interface RealtimeAnalyticsDashboardProps extends DashboardProps {
  showHeader?: boolean;
  showAlerts?: boolean;
  showConnectionStatus?: boolean;
  enableCollaboration?: boolean;
  theme?: 'light' | 'dark';
}

export default function RealtimeAnalyticsDashboard({
  dashboardId,
  isEditable = true,
  onDashboardChange,
  showHeader = true,
  showAlerts = true,
  showConnectionStatus = true,
  enableCollaboration = true,
  theme = 'light',
  className = ''
}: RealtimeAnalyticsDashboardProps) {
  const { user } = useAuth();
  const [isConfigPanelOpen, setIsConfigPanelOpen] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [alerts, setAlerts] = useState<AlertNotification[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Socket connection
  const {
    connectionState,
    subscriptions,
    subscribeToDashboard,
    unsubscribeFromDashboard,
    joinDashboard,
    leaveDashboard,
    trackEvent,
    onDashboardUpdated,
    onAlert,
    onUserPresence
  } = useAnalyticsSocket(user?.id!, user?.tenantId);

  // Dashboard data management
  const {
    dashboard,
    isLoading,
    error,
    saveDashboard,
    refreshDashboard,
    createDashboard,
    updateWidget,
    addWidget,
    removeWidget
  } = useDashboardData(dashboardId);

  // Subscribe to dashboard updates
  useEffect(() => {
    if (dashboard?.id && connectionState.status === 'connected') {
      subscribeToDashboard(dashboard.id);
      
      if (enableCollaboration) {
        joinDashboard(dashboard.id);
      }

      return () => {
        unsubscribeFromDashboard(dashboard.id);
        if (enableCollaboration) {
          leaveDashboard(dashboard.id);
        }
      };
    }
  }, [dashboard?.id, connectionState.status, subscribeToDashboard, unsubscribeFromDashboard, joinDashboard, leaveDashboard, enableCollaboration]);

  // Handle dashboard updates from WebSocket
  useEffect(() => {
    const unsubscribe = onDashboardUpdated(({ dashboardId: updatedDashboardId, update }) => {
      if (updatedDashboardId === dashboard?.id) {
        // Handle real-time dashboard updates
        refreshDashboard();
        
        trackEvent('dashboard_updated', {
          dashboardId: updatedDashboardId,
          updateType: update.type || 'unknown'
        });
      }
    });

    return unsubscribe;
  }, [dashboard?.id, onDashboardUpdated, refreshDashboard, trackEvent]);

  // Handle alert notifications
  useEffect(() => {
    const unsubscribe = onAlert((alert) => {
      const notification: AlertNotification = {
        id: crypto.randomUUID(),
        alert,
        timestamp: new Date(),
        isRead: false
      };

      setAlerts(prev => [notification, ...prev.slice(0, 9)]); // Keep last 10 alerts
    });

    return unsubscribe;
  }, [onAlert]);

  // Handle user presence updates
  useEffect(() => {
    if (!enableCollaboration || !dashboard?.id) return;

    const unsubscribe = onUserPresence(({ dashboardId: presenceDashboardId, userId, action }) => {
      if (presenceDashboardId === dashboard.id) {
        // Handle user presence updates for collaboration features
        console.log(`User ${userId} ${action} dashboard ${presenceDashboardId}`);
      }
    });

    return unsubscribe;
  }, [dashboard?.id, enableCollaboration, onUserPresence]);

  // Event handlers
  const handleDashboardSave = useCallback(async (updatedDashboard: DashboardConfiguration) => {
    try {
      await saveDashboard(updatedDashboard);
      onDashboardChange?.(updatedDashboard);
      
      trackEvent('dashboard_saved', {
        dashboardId: updatedDashboard.id,
        widgetCount: updatedDashboard.widgets.length
      });
    } catch (error) {
      console.error('Failed to save dashboard:', error);
    }
  }, [saveDashboard, onDashboardChange, trackEvent]);

  const handleWidgetAdd = useCallback(async (widget: DashboardWidget) => {
    try {
      await addWidget(widget);
      
      trackEvent('widget_added', {
        dashboardId: dashboard?.id,
        widgetType: widget.type,
        widgetId: widget.id
      });
    } catch (error) {
      console.error('Failed to add widget:', error);
    }
  }, [addWidget, dashboard?.id, trackEvent]);

  const handleWidgetUpdate = useCallback(async (widget: DashboardWidget) => {
    try {
      await updateWidget(widget);
      
      trackEvent('widget_updated', {
        dashboardId: dashboard?.id,
        widgetType: widget.type,
        widgetId: widget.id
      });
    } catch (error) {
      console.error('Failed to update widget:', error);
    }
  }, [updateWidget, dashboard?.id, trackEvent]);

  const handleWidgetRemove = useCallback(async (widgetId: string) => {
    try {
      await removeWidget(widgetId);
      
      trackEvent('widget_removed', {
        dashboardId: dashboard?.id,
        widgetId
      });
    } catch (error) {
      console.error('Failed to remove widget:', error);
    }
  }, [removeWidget, dashboard?.id, trackEvent]);

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
      await refreshDashboard();
      
      trackEvent('dashboard_refreshed', {
        dashboardId: dashboard?.id
      });
    } catch (error) {
      console.error('Failed to refresh dashboard:', error);
    } finally {
      setIsRefreshing(false);
    }
  }, [refreshDashboard, dashboard?.id, trackEvent]);

  const handleEditModeToggle = useCallback(() => {
    const newEditMode = !isEditMode;
    setIsEditMode(newEditMode);
    
    trackEvent('edit_mode_toggled', {
      dashboardId: dashboard?.id,
      editMode: newEditMode
    });
  }, [isEditMode, dashboard?.id, trackEvent]);

  const handleConfigPanelToggle = useCallback(() => {
    setIsConfigPanelOpen(!isConfigPanelOpen);
  }, [isConfigPanelOpen]);

  const dismissAlert = useCallback((alertId: string) => {
    setAlerts(prev => 
      prev.map(alert => 
        alert.id === alertId 
          ? { ...alert, dismissed: true }
          : alert
      )
    );
  }, []);

  const markAlertAsRead = useCallback((alertId: string) => {
    setAlerts(prev => 
      prev.map(alert => 
        alert.id === alertId 
          ? { ...alert, isRead: true }
          : alert
      )
    );
  }, []);

  // Loading states
  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <LoadingSpinner size="lg" />
          <p className="mt-2 text-muted-foreground">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <Card className="p-6">
        <div className="text-center text-destructive">
          <h3 className="text-lg font-medium mb-2">Error Loading Dashboard</h3>
          <p className="text-sm mb-4">{error}</p>
          <Button onClick={handleRefresh} variant="outline">
            <RefreshCw className="w-4 h-4 mr-2" />
            Retry
          </Button>
        </div>
      </Card>
    );
  }

  if (!dashboard) {
    return (
      <Card className="p-6">
        <div className="text-center">
          <h3 className="text-lg font-medium mb-2">No Dashboard Found</h3>
          <p className="text-sm text-muted-foreground mb-4">
            The requested dashboard could not be found or you don't have access to it.
          </p>
          {isEditable && (
            <Button onClick={() => createDashboard()} variant="default">
              <Plus className="w-4 h-4 mr-2" />
              Create Dashboard
            </Button>
          )}
        </div>
      </Card>
    );
  }

  return (
    <div className={`realtime-analytics-dashboard ${theme} ${className}`}>
      {/* Dashboard Header */}
      {showHeader && (
        <div className="dashboard-header border-b pb-4 mb-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <h1 className="text-2xl font-bold">
                {dashboard.name}
              </h1>
              
              {dashboard.description && (
                <p className="text-sm text-muted-foreground">
                  {dashboard.description}
                </p>
              )}

              {/* Real-time indicator */}
              <RealtimeIndicator 
                connectionState={connectionState}
                subscriptions={subscriptions}
                compact
              />
            </div>

            <div className="flex items-center space-x-2">
              {/* Connection status */}
              {showConnectionStatus && (
                <ConnectionStatus 
                  connectionState={connectionState}
                  compact
                />
              )}

              {/* Refresh button */}
              <Button
                onClick={handleRefresh}
                variant="ghost"
                size="sm"
                disabled={isRefreshing}
              >
                <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
              </Button>

              {/* Edit mode toggle */}
              {isEditable && (
                <Button
                  onClick={handleEditModeToggle}
                  variant={isEditMode ? 'default' : 'ghost'}
                  size="sm"
                >
                  {isEditMode ? (
                    <>
                      <Eye className="w-4 h-4 mr-2" />
                      View Mode
                    </>
                  ) : (
                    <>
                      <Edit3 className="w-4 h-4 mr-2" />
                      Edit Mode
                    </>
                  )}
                </Button>
              )}

              {/* Share button */}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  // Implement share functionality
                  navigator.clipboard.writeText(window.location.href);
                }}
              >
                <Share className="w-4 h-4" />
              </Button>

              {/* Configuration panel toggle */}
              {isEditable && (
                <Button
                  onClick={handleConfigPanelToggle}
                  variant={isConfigPanelOpen ? 'default' : 'ghost'}
                  size="sm"
                >
                  <Settings className="w-4 h-4" />
                </Button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Alert Notifications */}
      {showAlerts && alerts.length > 0 && (
        <AlertNotifications
          alerts={alerts}
          onDismiss={dismissAlert}
          onMarkAsRead={markAlertAsRead}
          className="mb-6"
        />
      )}

      {/* Main Dashboard Content */}
      <div className="dashboard-content">
        <DashboardLayout
          dashboard={dashboard}
          isEditMode={isEditMode}
          isEditable={isEditable}
          onDashboardChange={handleDashboardSave}
          onWidgetAdd={handleWidgetAdd}
          onWidgetUpdate={handleWidgetUpdate}
          onWidgetRemove={handleWidgetRemove}
          connectionState={connectionState}
          enableCollaboration={enableCollaboration}
          theme={theme}
        />
      </div>

      {/* Configuration Panel */}
      {isConfigPanelOpen && isEditable && (
        <DashboardConfigPanel
          dashboard={dashboard}
          onSave={handleDashboardSave}
          onClose={handleConfigPanelToggle}
          isOpen={isConfigPanelOpen}
        />
      )}
    </div>
  );
}