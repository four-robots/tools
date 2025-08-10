import React, { useState } from 'react';
import { Button } from '../../ui/button';
import { Input } from '../../ui/input';
import { Select } from '../../ui/select';
import { Card } from '../../ui/card';
import { Badge } from '../../ui/badge';
import { AlertCard } from './AlertCard';
import { AlertDefinitionForm } from './AlertDefinitionForm';
import { 
  PlusIcon, 
  SearchIcon, 
  FilterIcon,
  SortAscIcon,
  SortDescIcon,
  RefreshCwIcon 
} from 'lucide-react';

interface Alert {
  id: string;
  name: string;
  description?: string;
  isActive: boolean;
  scheduleType: string;
  lastTriggeredAt?: string;
  nextScheduledAt?: string;
  savedSearch: {
    id: string;
    name: string;
  };
  notificationChannels: any[];
  createdAt: string;
  updatedAt: string;
}

interface SavedSearch {
  id: string;
  name: string;
  description?: string;
}

interface NotificationTemplate {
  id: string;
  name: string;
  templateType: string;
}

interface AlertsListProps {
  alerts: Alert[];
  savedSearches: SavedSearch[];
  templates: NotificationTemplate[];
  totalItems: number;
  currentPage: number;
  totalPages: number;
  isLoading?: boolean;
  onPageChange: (page: number) => void;
  onCreateAlert: (alertData: any) => Promise<void>;
  onUpdateAlert: (alertId: string, alertData: any) => Promise<void>;
  onDeleteAlert: (alertId: string) => Promise<void>;
  onTriggerAlert: (alertId: string) => Promise<void>;
  onToggleActive: (alertId: string, isActive: boolean) => Promise<void>;
  onRefresh: () => void;
}

export function AlertsList({
  alerts,
  savedSearches,
  templates,
  totalItems,
  currentPage,
  totalPages,
  isLoading = false,
  onPageChange,
  onCreateAlert,
  onUpdateAlert,
  onDeleteAlert,
  onTriggerAlert,
  onToggleActive,
  onRefresh,
}: AlertsListProps) {
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [editingAlert, setEditingAlert] = useState<Alert | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterActive, setFilterActive] = useState<'all' | 'active' | 'inactive'>('all');
  const [filterScheduleType, setFilterScheduleType] = useState<string>('all');
  const [sortBy, setSortBy] = useState('updatedAt');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  // Filter and sort alerts
  const filteredAlerts = alerts
    .filter(alert => {
      // Text search
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        const matches = alert.name.toLowerCase().includes(query) ||
                       alert.description?.toLowerCase().includes(query) ||
                       alert.savedSearch.name.toLowerCase().includes(query);
        if (!matches) return false;
      }

      // Active filter
      if (filterActive === 'active' && !alert.isActive) return false;
      if (filterActive === 'inactive' && alert.isActive) return false;

      // Schedule type filter
      if (filterScheduleType !== 'all' && alert.scheduleType !== filterScheduleType) return false;

      return true;
    })
    .sort((a, b) => {
      let aValue, bValue;
      
      switch (sortBy) {
        case 'name':
          aValue = a.name.toLowerCase();
          bValue = b.name.toLowerCase();
          break;
        case 'createdAt':
          aValue = new Date(a.createdAt).getTime();
          bValue = new Date(b.createdAt).getTime();
          break;
        case 'lastTriggeredAt':
          aValue = a.lastTriggeredAt ? new Date(a.lastTriggeredAt).getTime() : 0;
          bValue = b.lastTriggeredAt ? new Date(b.lastTriggeredAt).getTime() : 0;
          break;
        case 'scheduleType':
          aValue = a.scheduleType;
          bValue = b.scheduleType;
          break;
        default: // updatedAt
          aValue = new Date(a.updatedAt).getTime();
          bValue = new Date(b.updatedAt).getTime();
      }

      if (sortOrder === 'asc') {
        return aValue < bValue ? -1 : aValue > bValue ? 1 : 0;
      } else {
        return aValue > bValue ? -1 : aValue < bValue ? 1 : 0;
      }
    });

  const handleCreateAlert = async (alertData: any) => {
    try {
      await onCreateAlert(alertData);
      setShowCreateForm(false);
    } catch (error) {
      console.error('Error creating alert:', error);
      throw error;
    }
  };

  const handleUpdateAlert = async (alertData: any) => {
    if (!editingAlert) return;
    
    try {
      await onUpdateAlert(editingAlert.id, alertData);
      setEditingAlert(null);
    } catch (error) {
      console.error('Error updating alert:', error);
      throw error;
    }
  };

  const handleDeleteAlert = async (alertId: string) => {
    try {
      await onDeleteAlert(alertId);
    } catch (error) {
      console.error('Error deleting alert:', error);
      throw error;
    }
  };

  if (showCreateForm) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-bold">Create New Alert</h2>
        </div>
        
        <AlertDefinitionForm
          savedSearches={savedSearches}
          templates={templates}
          onSubmit={handleCreateAlert}
          onCancel={() => setShowCreateForm(false)}
        />
      </div>
    );
  }

  if (editingAlert) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-bold">Edit Alert</h2>
        </div>
        
        <AlertDefinitionForm
          savedSearches={savedSearches}
          templates={templates}
          initialAlert={editingAlert}
          onSubmit={handleUpdateAlert}
          onCancel={() => setEditingAlert(null)}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Search Alerts</h2>
          <p className="text-gray-600">
            {totalItems} alert{totalItems !== 1 ? 's' : ''} total
          </p>
        </div>
        
        <div className="flex items-center space-x-3">
          <Button
            variant="outline"
            onClick={onRefresh}
            disabled={isLoading}
          >
            <RefreshCwIcon className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          
          <Button onClick={() => setShowCreateForm(true)}>
            <PlusIcon className="h-4 w-4 mr-2" />
            Create Alert
          </Button>
        </div>
      </div>

      {/* Search and Filters */}
      <Card className="p-4">
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="flex-1">
            <div className="relative">
              <SearchIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
              <Input
                placeholder="Search alerts by name, description, or saved search..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>
          
          <div className="flex flex-col sm:flex-row gap-2">
            <Select value={filterActive} onValueChange={(value: any) => setFilterActive(value)}>
              <option value="all">All Alerts</option>
              <option value="active">Active Only</option>
              <option value="inactive">Inactive Only</option>
            </Select>
            
            <Select value={filterScheduleType} onValueChange={setFilterScheduleType}>
              <option value="all">All Schedule Types</option>
              <option value="manual">Manual</option>
              <option value="interval">Interval</option>
              <option value="cron">Cron</option>
              <option value="real_time">Real-time</option>
            </Select>
            
            <Select value={`${sortBy}-${sortOrder}`} onValueChange={(value) => {
              const [field, order] = value.split('-');
              setSortBy(field);
              setSortOrder(order as 'asc' | 'desc');
            }}>
              <option value="updatedAt-desc">Latest Updated</option>
              <option value="updatedAt-asc">Oldest Updated</option>
              <option value="name-asc">Name A-Z</option>
              <option value="name-desc">Name Z-A</option>
              <option value="createdAt-desc">Newest First</option>
              <option value="createdAt-asc">Oldest First</option>
              <option value="lastTriggeredAt-desc">Recently Triggered</option>
              <option value="scheduleType-asc">Schedule Type</option>
            </Select>
          </div>
        </div>
        
        {/* Active Filters */}
        {(searchQuery || filterActive !== 'all' || filterScheduleType !== 'all') && (
          <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t">
            {searchQuery && (
              <Badge variant="secondary" className="flex items-center gap-1">
                Search: {searchQuery}
                <button
                  onClick={() => setSearchQuery('')}
                  className="ml-1 hover:bg-gray-200 rounded-full p-0.5"
                >
                  ×
                </button>
              </Badge>
            )}
            {filterActive !== 'all' && (
              <Badge variant="secondary" className="flex items-center gap-1">
                Status: {filterActive}
                <button
                  onClick={() => setFilterActive('all')}
                  className="ml-1 hover:bg-gray-200 rounded-full p-0.5"
                >
                  ×
                </button>
              </Badge>
            )}
            {filterScheduleType !== 'all' && (
              <Badge variant="secondary" className="flex items-center gap-1">
                Schedule: {filterScheduleType}
                <button
                  onClick={() => setFilterScheduleType('all')}
                  className="ml-1 hover:bg-gray-200 rounded-full p-0.5"
                >
                  ×
                </button>
              </Badge>
            )}
          </div>
        )}
      </Card>

      {/* Alerts Grid */}
      {isLoading ? (
        <div className="grid gap-4">
          {[...Array(3)].map((_, i) => (
            <Card key={i} className="p-6 animate-pulse">
              <div className="h-4 bg-gray-200 rounded mb-2"></div>
              <div className="h-3 bg-gray-200 rounded w-2/3 mb-4"></div>
              <div className="flex space-x-2">
                <div className="h-6 bg-gray-200 rounded w-16"></div>
                <div className="h-6 bg-gray-200 rounded w-20"></div>
              </div>
            </Card>
          ))}
        </div>
      ) : filteredAlerts.length === 0 ? (
        <Card className="p-12 text-center">
          <div className="text-gray-500">
            <SearchIcon className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <h3 className="text-lg font-semibold mb-2">No alerts found</h3>
            <p className="text-sm mb-4">
              {searchQuery || filterActive !== 'all' || filterScheduleType !== 'all'
                ? 'Try adjusting your search criteria or filters.'
                : 'Create your first search alert to get automated notifications.'}
            </p>
            {!searchQuery && filterActive === 'all' && filterScheduleType === 'all' && (
              <Button onClick={() => setShowCreateForm(true)}>
                <PlusIcon className="h-4 w-4 mr-2" />
                Create Your First Alert
              </Button>
            )}
          </div>
        </Card>
      ) : (
        <div className="space-y-4">
          {filteredAlerts.map((alert) => (
            <AlertCard
              key={alert.id}
              alert={alert}
              onEdit={() => setEditingAlert(alert)}
              onDelete={() => handleDeleteAlert(alert.id)}
              onTrigger={() => onTriggerAlert(alert.id)}
              onToggleActive={(isActive) => onToggleActive(alert.id, isActive)}
            />
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-gray-600">
            Showing {((currentPage - 1) * 20) + 1} to {Math.min(currentPage * 20, totalItems)} of {totalItems} alerts
          </p>
          
          <div className="flex items-center space-x-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => onPageChange(currentPage - 1)}
              disabled={currentPage === 1}
            >
              Previous
            </Button>
            
            <div className="flex items-center space-x-1">
              {Array.from({ length: totalPages }, (_, i) => i + 1)
                .filter(page => page === 1 || page === totalPages || Math.abs(page - currentPage) <= 2)
                .map((page, index, array) => (
                  <React.Fragment key={page}>
                    {index > 0 && array[index - 1] !== page - 1 && (
                      <span className="px-2 text-gray-500">...</span>
                    )}
                    <Button
                      variant={currentPage === page ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => onPageChange(page)}
                    >
                      {page}
                    </Button>
                  </React.Fragment>
                ))
              }
            </div>
            
            <Button
              variant="outline"
              size="sm"
              onClick={() => onPageChange(currentPage + 1)}
              disabled={currentPage === totalPages}
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}