/**
 * Chart utilities for analytics dashboards
 */
import { ChartConfiguration, ChartData, ChartOptions } from 'chart.js';
import { WidgetData, ChartProps } from '../types';

// Chart color palettes
export const chartColors = {
  primary: ['#3B82F6', '#1E40AF', '#1D4ED8'],
  success: ['#10B981', '#059669', '#047857'],
  warning: ['#F59E0B', '#D97706', '#B45309'],
  danger: ['#EF4444', '#DC2626', '#B91C1C'],
  info: ['#06B6D4', '#0891B2', '#0E7490'],
  purple: ['#8B5CF6', '#7C3AED', '#6D28D9'],
  pink: ['#EC4899', '#DB2777', '#BE185D'],
  indigo: ['#6366F1', '#4F46E5', '#4338CA'],
};

export const defaultChartColors = [
  '#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', 
  '#EC4899', '#06B6D4', '#6366F1', '#F97316', '#84CC16'
];

// Chart themes
export const chartThemes = {
  light: {
    backgroundColor: '#FFFFFF',
    textColor: '#374151',
    gridColor: '#E5E7EB',
    borderColor: '#D1D5DB',
  },
  dark: {
    backgroundColor: '#1F2937',
    textColor: '#F9FAFB',
    gridColor: '#374151',
    borderColor: '#4B5563',
  }
};

// Default chart options
export function getDefaultChartOptions(theme: 'light' | 'dark' = 'light'): ChartOptions {
  const colors = chartThemes[theme];
  
  return {
    responsive: true,
    maintainAspectRatio: false,
    interaction: {
      intersect: false,
      mode: 'index',
    },
    plugins: {
      legend: {
        display: true,
        position: 'top',
        labels: {
          color: colors.textColor,
          usePointStyle: true,
          padding: 20,
        },
      },
      tooltip: {
        backgroundColor: colors.backgroundColor,
        titleColor: colors.textColor,
        bodyColor: colors.textColor,
        borderColor: colors.borderColor,
        borderWidth: 1,
        cornerRadius: 8,
        displayColors: true,
        callbacks: {
          title: (tooltipItems) => {
            if (tooltipItems.length > 0) {
              return tooltipItems[0].label;
            }
            return '';
          },
          label: (context) => {
            let label = context.dataset.label || '';
            if (label) {
              label += ': ';
            }
            
            const value = context.parsed.y;
            if (typeof value === 'number') {
              // Format numbers based on magnitude
              if (Math.abs(value) >= 1000000) {
                label += (value / 1000000).toFixed(1) + 'M';
              } else if (Math.abs(value) >= 1000) {
                label += (value / 1000).toFixed(1) + 'K';
              } else {
                label += value.toLocaleString();
              }
            } else {
              label += value;
            }
            
            return label;
          },
        },
      },
    },
    scales: {
      x: {
        grid: {
          color: colors.gridColor,
          drawBorder: false,
        },
        ticks: {
          color: colors.textColor,
          maxTicksLimit: 10,
        },
      },
      y: {
        grid: {
          color: colors.gridColor,
          drawBorder: false,
        },
        ticks: {
          color: colors.textColor,
          callback: function(value) {
            if (typeof value === 'number') {
              if (Math.abs(value) >= 1000000) {
                return (value / 1000000).toFixed(1) + 'M';
              } else if (Math.abs(value) >= 1000) {
                return (value / 1000).toFixed(1) + 'K';
              }
              return value.toLocaleString();
            }
            return value;
          },
        },
        beginAtZero: true,
      },
    },
  };
}

// Convert widget data to Chart.js format
export function convertToChartData(
  widgetData: WidgetData,
  chartType: 'line' | 'bar' | 'pie' | 'doughnut' | 'area'
): ChartData {
  const { labels = [], datasets } = widgetData;
  
  return {
    labels,
    datasets: datasets.map((dataset, index) => {
      const color = dataset.color || defaultChartColors[index % defaultChartColors.length];
      
      const baseDataset = {
        label: dataset.name,
        data: dataset.data,
        borderColor: color,
        backgroundColor: chartType === 'line' || chartType === 'area' 
          ? `${color}20` 
          : color,
      };

      // Chart type specific configurations
      switch (chartType) {
        case 'line':
          return {
            ...baseDataset,
            borderWidth: 2,
            pointRadius: 4,
            pointHoverRadius: 6,
            pointBackgroundColor: color,
            pointBorderColor: '#FFFFFF',
            pointBorderWidth: 2,
            tension: 0.4,
            fill: false,
          };
          
        case 'area':
          return {
            ...baseDataset,
            borderWidth: 2,
            pointRadius: 0,
            pointHoverRadius: 4,
            tension: 0.4,
            fill: true,
          };
          
        case 'bar':
          return {
            ...baseDataset,
            borderWidth: 0,
            borderRadius: 4,
            borderSkipped: false,
          };
          
        case 'pie':
        case 'doughnut':
          return {
            ...baseDataset,
            backgroundColor: datasets.map((_, i) => 
              defaultChartColors[i % defaultChartColors.length]
            ),
            borderWidth: 2,
            borderColor: '#FFFFFF',
          };
          
        default:
          return baseDataset;
      }
    }),
  };
}

// Create chart configuration
export function createChartConfig(
  chartType: 'line' | 'bar' | 'pie' | 'doughnut' | 'area',
  data: WidgetData,
  options: Partial<ChartOptions> = {},
  theme: 'light' | 'dark' = 'light'
): ChartConfiguration {
  const defaultOptions = getDefaultChartOptions(theme);
  
  // Chart type specific options
  const typeSpecificOptions: Partial<ChartOptions> = {};
  
  switch (chartType) {
    case 'pie':
    case 'doughnut':
      typeSpecificOptions.plugins = {
        ...defaultOptions.plugins,
        legend: {
          ...defaultOptions.plugins?.legend,
          position: 'right',
        },
      };
      // Remove scales for pie/doughnut charts
      delete typeSpecificOptions.scales;
      break;
      
    case 'area':
      // Area charts use line type with fill
      chartType = 'line';
      break;
  }
  
  return {
    type: chartType,
    data: convertToChartData(data, chartType),
    options: {
      ...defaultOptions,
      ...typeSpecificOptions,
      ...options,
    },
  };
}

// Animation configurations
export const chartAnimations = {
  fadeIn: {
    duration: 1000,
    easing: 'easeOutQuart',
  },
  slideUp: {
    duration: 800,
    easing: 'easeOutCubic',
    delay: (context: any) => context.dataIndex * 50,
  },
  bounce: {
    duration: 1200,
    easing: 'easeOutBounce',
  },
};

// Responsive breakpoints for charts
export const chartBreakpoints = {
  xs: 0,
  sm: 576,
  md: 768,
  lg: 992,
  xl: 1200,
  xxl: 1400,
};

// Get responsive chart height
export function getResponsiveHeight(
  breakpoint: keyof typeof chartBreakpoints,
  baseHeight: number = 300
): number {
  const multipliers = {
    xs: 0.7,
    sm: 0.8,
    md: 0.9,
    lg: 1.0,
    xl: 1.1,
    xxl: 1.2,
  };
  
  return Math.round(baseHeight * multipliers[breakpoint]);
}

// Chart data processing utilities
export function aggregateDataByPeriod(
  data: Array<{ timestamp: Date; value: number }>,
  period: 'hour' | 'day' | 'week' | 'month'
): Array<{ label: string; value: number }> {
  const groupedData = new Map<string, number[]>();
  
  data.forEach(({ timestamp, value }) => {
    let key: string;
    
    switch (period) {
      case 'hour':
        key = timestamp.toISOString().slice(0, 13) + ':00:00';
        break;
      case 'day':
        key = timestamp.toISOString().slice(0, 10);
        break;
      case 'week':
        const weekStart = new Date(timestamp);
        weekStart.setDate(weekStart.getDate() - weekStart.getDay());
        key = weekStart.toISOString().slice(0, 10);
        break;
      case 'month':
        key = timestamp.toISOString().slice(0, 7) + '-01';
        break;
    }
    
    if (!groupedData.has(key)) {
      groupedData.set(key, []);
    }
    groupedData.get(key)!.push(value);
  });
  
  return Array.from(groupedData.entries())
    .map(([label, values]) => ({
      label: formatPeriodLabel(label, period),
      value: values.reduce((sum, val) => sum + val, 0) / values.length,
    }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

function formatPeriodLabel(dateString: string, period: 'hour' | 'day' | 'week' | 'month'): string {
  const date = new Date(dateString);
  
  switch (period) {
    case 'hour':
      return date.toLocaleString('en-US', { 
        month: 'short', 
        day: 'numeric', 
        hour: 'numeric' 
      });
    case 'day':
      return date.toLocaleDateString('en-US', { 
        month: 'short', 
        day: 'numeric' 
      });
    case 'week':
      const endDate = new Date(date);
      endDate.setDate(endDate.getDate() + 6);
      return `${date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${endDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
    case 'month':
      return date.toLocaleDateString('en-US', { 
        year: 'numeric', 
        month: 'long' 
      });
    default:
      return dateString;
  }
}

// Calculate trend from data points
export function calculateTrend(
  data: number[],
  periods: number = 2
): {
  direction: 'up' | 'down' | 'stable';
  percentage: number;
  isSignificant: boolean;
} {
  if (data.length < periods) {
    return {
      direction: 'stable',
      percentage: 0,
      isSignificant: false,
    };
  }
  
  const recent = data.slice(-periods);
  const earlier = data.slice(-periods * 2, -periods);
  
  if (earlier.length === 0) {
    return {
      direction: 'stable',
      percentage: 0,
      isSignificant: false,
    };
  }
  
  const recentAvg = recent.reduce((sum, val) => sum + val, 0) / recent.length;
  const earlierAvg = earlier.reduce((sum, val) => sum + val, 0) / earlier.length;
  
  const change = recentAvg - earlierAvg;
  const percentage = earlierAvg === 0 ? 0 : (change / Math.abs(earlierAvg)) * 100;
  
  return {
    direction: Math.abs(percentage) < 5 ? 'stable' : percentage > 0 ? 'up' : 'down',
    percentage: Math.abs(percentage),
    isSignificant: Math.abs(percentage) >= 10,
  };
}

// Export utility functions
export default {
  chartColors,
  defaultChartColors,
  chartThemes,
  getDefaultChartOptions,
  convertToChartData,
  createChartConfig,
  chartAnimations,
  getResponsiveHeight,
  aggregateDataByPeriod,
  calculateTrend,
};