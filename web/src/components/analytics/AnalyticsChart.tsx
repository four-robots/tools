'use client';

import React, { useMemo } from 'react';
import { 
  LineChart, 
  Line, 
  AreaChart, 
  Area, 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell
} from 'recharts';
// import { useTimeSeriesData } from '@/hooks/use-analytics'; // TODO: Implement this hook
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { Alert, AlertDescription } from '@/components/ui/alert';

interface AnalyticsChartProps {
  type: 'line' | 'area' | 'bar' | 'pie';
  title: string;
  timeRange: string;
  category?: string;
  eventType?: string;
  height?: number;
  className?: string;
  colors?: string[];
}

const DEFAULT_COLORS = [
  '#8884d8',
  '#82ca9d', 
  '#ffc658',
  '#ff7300',
  '#00ff00',
  '#ff00ff'
];

export function AnalyticsChart({
  type,
  title,
  timeRange,
  category,
  eventType,
  height = 300,
  className,
  colors = DEFAULT_COLORS
}: AnalyticsChartProps) {
  const query = useMemo(() => ({
    timeRange,
    eventCategory: category,
    eventType,
    groupBy: timeRange === 'today' ? 'hour' : 'day',
    limit: 100
  }), [timeRange, category, eventType]);

  // Mock data for now - replace with actual hook implementation
  const timeSeriesData = useMemo(() => [
    {
      name: 'Activity',
      data: Array.from({ length: 7 }, (_, i) => ({
        timestamp: new Date(Date.now() - (6 - i) * 24 * 60 * 60 * 1000).toISOString(),
        value: 10 + ((i * 7 + 13) % 50)
      }))
    }
  ], []);
  const isLoading = false;
  const error = null;

  const chartData = useMemo(() => {
    if (!timeSeriesData?.length) return [];

    // Convert time series data to chart format
    const dataByTimestamp = new Map();
    
    timeSeriesData.forEach(series => {
      series.data.forEach(point => {
        const timestamp = new Date(point.timestamp).toISOString();
        if (!dataByTimestamp.has(timestamp)) {
          dataByTimestamp.set(timestamp, { timestamp });
        }
        dataByTimestamp.get(timestamp)[series.name] = point.value;
      });
    });

    return Array.from(dataByTimestamp.values()).sort((a, b) => 
      new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );
  }, [timeSeriesData]);

  const formatXAxisLabel = (timestamp: string) => {
    const date = new Date(timestamp);
    if (timeRange === 'today') {
      return date.toLocaleTimeString('en-US', { 
        hour: 'numeric', 
        hour12: true 
      });
    }
    return date.toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric' 
    });
  };

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-background border border-border rounded-lg p-3 shadow-lg">
          <p className="font-medium text-sm mb-1">
            {formatXAxisLabel(label)}
          </p>
          {payload.map((entry: any, index: number) => (
            <p key={index} className="text-sm" style={{ color: entry.color }}>
              {entry.dataKey}: {entry.value}
            </p>
          ))}
        </div>
      );
    }
    return null;
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center" style={{ height }}>
        <LoadingSpinner size="sm" />
        <span className="ml-2 text-sm text-muted-foreground">Loading chart...</span>
      </div>
    );
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertDescription>
          Failed to load chart data. Please try again later.
        </AlertDescription>
      </Alert>
    );
  }

  if (!chartData.length) {
    return (
      <div 
        className="flex items-center justify-center text-muted-foreground text-sm"
        style={{ height }}
      >
        No data available for the selected time range
      </div>
    );
  }

  const renderChart = () => {
    const commonProps = {
      data: chartData,
      margin: { top: 5, right: 30, left: 20, bottom: 5 }
    };

    switch (type) {
      case 'line':
        return (
          <LineChart {...commonProps}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
            <XAxis 
              dataKey="timestamp" 
              tickFormatter={formatXAxisLabel}
              className="text-xs"
            />
            <YAxis className="text-xs" />
            <Tooltip content={<CustomTooltip />} />
            {timeSeriesData?.map((series, index) => (
              <Line
                key={series.name}
                type="monotone"
                dataKey={series.name}
                stroke={colors[index % colors.length]}
                strokeWidth={2}
                dot={{ r: 3 }}
                activeDot={{ r: 5 }}
              />
            ))}
          </LineChart>
        );

      case 'area':
        return (
          <AreaChart {...commonProps}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
            <XAxis 
              dataKey="timestamp" 
              tickFormatter={formatXAxisLabel}
              className="text-xs"
            />
            <YAxis className="text-xs" />
            <Tooltip content={<CustomTooltip />} />
            {timeSeriesData?.map((series, index) => (
              <Area
                key={series.name}
                type="monotone"
                dataKey={series.name}
                stackId="1"
                stroke={colors[index % colors.length]}
                fill={colors[index % colors.length]}
                fillOpacity={0.6}
              />
            ))}
          </AreaChart>
        );

      case 'bar':
        return (
          <BarChart {...commonProps}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
            <XAxis 
              dataKey="timestamp" 
              tickFormatter={formatXAxisLabel}
              className="text-xs"
            />
            <YAxis className="text-xs" />
            <Tooltip content={<CustomTooltip />} />
            {timeSeriesData?.map((series, index) => (
              <Bar
                key={series.name}
                dataKey={series.name}
                fill={colors[index % colors.length]}
                radius={[2, 2, 0, 0]}
              />
            ))}
          </BarChart>
        );

      case 'pie':
        const pieData = timeSeriesData?.map((series, index) => ({
          name: series.name,
          value: series.data.reduce((sum, point) => sum + point.value, 0),
          fill: colors[index % colors.length]
        })) || [];

        return (
          <PieChart>
            <Pie
              data={pieData}
              cx="50%"
              cy="50%"
              outerRadius={80}
              dataKey="value"
              label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
            >
              {pieData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.fill} />
              ))}
            </Pie>
            <Tooltip />
          </PieChart>
        );

      default:
        return <div>Unsupported chart type</div>;
    }
  };

  return (
    <div className={className}>
      <ResponsiveContainer width="100%" height={height}>
        {renderChart()}
      </ResponsiveContainer>
    </div>
  );
}

export default AnalyticsChart;