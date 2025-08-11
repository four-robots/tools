import React from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { WidgetProps, WidgetData } from '../types';
import { formatNumber, formatPercentage, formatDuration } from '../utils/formatters';
import { TrendingUp, TrendingDown, Minus, Settings, RefreshCw } from 'lucide-react';

interface MetricCardData extends WidgetData {
  value: number;
  previousValue?: number;
  target?: number;
  unit?: string;
  trend?: 'up' | 'down' | 'stable';
  trendPercentage?: number;
  status?: 'good' | 'warning' | 'critical';
}

interface MetricCardWidgetProps extends Omit<WidgetProps, 'data'> {
  data?: MetricCardData;
}

export default function MetricCardWidget({
  widget,
  data,
  isLoading,
  error,
  onEdit,
  onDelete,
  onRefresh,
  isEditable = false,
  className = ''
}: MetricCardWidgetProps) {
  const { title, description, config } = widget;
  
  const renderTrendIcon = () => {
    if (!data?.trend || data.trend === 'stable') {
      return <Minus className="w-4 h-4 text-muted-foreground" />;
    }
    
    if (data.trend === 'up') {
      return <TrendingUp className="w-4 h-4 text-green-500" />;
    }
    
    return <TrendingDown className="w-4 h-4 text-red-500" />;
  };

  const renderTrendText = () => {
    if (!data?.trendPercentage) return null;
    
    const isPositive = data.trend === 'up';
    const colorClass = isPositive ? 'text-green-600' : 'text-red-600';
    
    return (
      <div className={`flex items-center text-sm ${colorClass}`}>
        {renderTrendIcon()}
        <span className="ml-1">
          {Math.abs(data.trendPercentage).toFixed(1)}%
        </span>
      </div>
    );
  };

  const renderStatusBadge = () => {
    if (!data?.status) return null;
    
    const statusColors = {
      good: 'bg-green-100 text-green-800',
      warning: 'bg-yellow-100 text-yellow-800',
      critical: 'bg-red-100 text-red-800'
    };
    
    return (
      <Badge className={statusColors[data.status]}>
        {data.status.charAt(0).toUpperCase() + data.status.slice(1)}
      </Badge>
    );
  };

  const renderValue = () => {
    if (!data) return '—';
    
    const { value, unit } = data;
    
    if (unit === '%') {
      return formatPercentage(value / 100);
    }
    
    if (unit === 'ms' || unit === 's' || unit === 'duration') {
      return formatDuration(value, unit === 's' ? 'seconds' : 'milliseconds');
    }
    
    return formatNumber(value, unit);
  };

  const renderProgressBar = () => {
    if (!data?.target || !data?.value) return null;
    
    const percentage = Math.min((data.value / data.target) * 100, 100);
    const isOnTrack = percentage >= 80;
    
    return (
      <div className="mt-3">
        <div className="flex justify-between items-center mb-1">
          <span className="text-xs text-muted-foreground">
            Target: {formatNumber(data.target, data.unit)}
          </span>
          <span className={`text-xs ${isOnTrack ? 'text-green-600' : 'text-orange-600'}`}>
            {percentage.toFixed(0)}%
          </span>
        </div>
        <div className="w-full bg-muted rounded-full h-2">
          <div
            className={`h-2 rounded-full transition-all duration-500 ${
              isOnTrack ? 'bg-green-500' : 'bg-orange-500'
            }`}
            style={{ width: `${percentage}%` }}
          />
        </div>
      </div>
    );
  };

  if (error) {
    return (
      <Card className={`p-6 border-destructive ${className}`}>
        <div className="text-center">
          <div className="text-sm font-medium text-destructive mb-2">
            Error Loading Metric
          </div>
          <div className="text-xs text-muted-foreground mb-3">
            {error}
          </div>
          {onRefresh && (
            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => onRefresh(widget.id)}
            >
              <RefreshCw className="w-3 h-3 mr-1" />
              Retry
            </Button>
          )}
        </div>
      </Card>
    );
  }

  return (
    <Card className={`p-6 hover:shadow-lg transition-shadow ${className}`}>
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <h3 className="font-semibold text-lg">{title}</h3>
            {renderStatusBadge()}
          </div>
          {description && (
            <p className="text-sm text-muted-foreground">{description}</p>
          )}
        </div>
        
        {isEditable && (
          <div className="flex items-center gap-1 ml-2">
            {onRefresh && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onRefresh(widget.id)}
                disabled={isLoading}
              >
                <RefreshCw className={`w-3 h-3 ${isLoading ? 'animate-spin' : ''}`} />
              </Button>
            )}
            {onEdit && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onEdit(widget)}
              >
                <Settings className="w-3 h-3" />
              </Button>
            )}
          </div>
        )}
      </div>

      {/* Main Content */}
      <div className="space-y-4">
        {/* Primary Metric */}
        <div className="flex items-end justify-between">
          <div>
            <div className="text-3xl font-bold">
              {isLoading ? (
                <div className="animate-pulse bg-muted rounded h-8 w-20" />
              ) : (
                renderValue()
              )}
            </div>
            {data?.lastUpdated && (
              <div className="text-xs text-muted-foreground mt-1">
                Updated {new Date(data.lastUpdated).toLocaleTimeString()}
              </div>
            )}
          </div>
          
          {/* Trend Indicator */}
          {data && renderTrendText()}
        </div>

        {/* Progress Bar (if target is set) */}
        {renderProgressBar()}

        {/* Additional Metrics */}
        {data?.metadata && Object.keys(data.metadata).length > 0 && (
          <div className="pt-3 border-t space-y-2">
            {Object.entries(data.metadata).slice(0, 3).map(([key, value]) => (
              <div key={key} className="flex justify-between items-center text-sm">
                <span className="text-muted-foreground capitalize">
                  {key.replace(/_/g, ' ')}
                </span>
                <span className="font-medium">
                  {typeof value === 'number' ? formatNumber(value) : String(value)}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Comparison with Previous Period */}
        {data?.previousValue !== undefined && (
          <div className="pt-3 border-t">
            <div className="flex justify-between items-center text-sm">
              <span className="text-muted-foreground">Previous Period</span>
              <div className="flex items-center gap-2">
                <span className="font-medium">
                  {formatNumber(data.previousValue, data.unit)}
                </span>
                {data.trendPercentage && (
                  <div className="flex items-center">
                    {renderTrendIcon()}
                    <span className="ml-1 text-xs">
                      {data.trendPercentage > 0 ? '+' : ''}
                      {data.trendPercentage.toFixed(1)}%
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Loading Overlay */}
      {isLoading && (
        <div className="absolute inset-0 bg-background/50 backdrop-blur-sm flex items-center justify-center rounded">
          <div className="text-center">
            <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2" />
            <div className="text-sm text-muted-foreground">Updating...</div>
          </div>
        </div>
      )}
    </Card>
  );
}