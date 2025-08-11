/**
 * Utility functions for formatting numbers, dates, and other data types
 * used in analytics dashboards and widgets
 */

// Number formatting
export function formatNumber(
  value: number, 
  unit?: string,
  options: {
    decimals?: number;
    compact?: boolean;
    notation?: 'standard' | 'scientific' | 'engineering' | 'compact';
  } = {}
): string {
  const { decimals = 0, compact = false, notation = 'standard' } = options;
  
  if (typeof value !== 'number' || isNaN(value)) {
    return '—';
  }

  let formattedValue: string;

  if (compact && Math.abs(value) >= 1000) {
    // Use compact notation for large numbers
    formattedValue = new Intl.NumberFormat('en-US', {
      notation: 'compact',
      maximumFractionDigits: 1,
    }).format(value);
  } else {
    // Standard number formatting
    formattedValue = new Intl.NumberFormat('en-US', {
      notation,
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    }).format(value);
  }

  // Add unit if provided
  if (unit && unit !== 'count') {
    return `${formattedValue}${unit}`;
  }

  return formattedValue;
}

// Currency formatting
export function formatCurrency(
  value: number,
  currency: string = 'USD',
  options: {
    compact?: boolean;
    showSymbol?: boolean;
  } = {}
): string {
  const { compact = false, showSymbol = true } = options;
  
  if (typeof value !== 'number' || isNaN(value)) {
    return '—';
  }

  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    notation: compact && Math.abs(value) >= 1000 ? 'compact' : 'standard',
    minimumFractionDigits: compact ? 0 : 2,
    maximumFractionDigits: compact ? 1 : 2,
    currencyDisplay: showSymbol ? 'symbol' : 'code',
  }).format(value);
}

// Percentage formatting
export function formatPercentage(
  value: number,
  options: {
    decimals?: number;
    showSign?: boolean;
  } = {}
): string {
  const { decimals = 1, showSign = false } = options;
  
  if (typeof value !== 'number' || isNaN(value)) {
    return '—';
  }

  const formatted = new Intl.NumberFormat('en-US', {
    style: 'percent',
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
    signDisplay: showSign ? 'always' : 'auto',
  }).format(value);

  return formatted;
}

// Duration formatting
export function formatDuration(
  value: number,
  unit: 'milliseconds' | 'seconds' | 'minutes' | 'hours' | 'days' = 'milliseconds'
): string {
  if (typeof value !== 'number' || isNaN(value)) {
    return '—';
  }

  let milliseconds: number;

  // Convert to milliseconds
  switch (unit) {
    case 'seconds':
      milliseconds = value * 1000;
      break;
    case 'minutes':
      milliseconds = value * 60 * 1000;
      break;
    case 'hours':
      milliseconds = value * 60 * 60 * 1000;
      break;
    case 'days':
      milliseconds = value * 24 * 60 * 60 * 1000;
      break;
    default:
      milliseconds = value;
  }

  // Format based on magnitude
  if (milliseconds < 1000) {
    return `${Math.round(milliseconds)}ms`;
  } else if (milliseconds < 60000) {
    return `${(milliseconds / 1000).toFixed(1)}s`;
  } else if (milliseconds < 3600000) {
    const minutes = Math.floor(milliseconds / 60000);
    const seconds = Math.round((milliseconds % 60000) / 1000);
    return seconds > 0 ? `${minutes}m ${seconds}s` : `${minutes}m`;
  } else if (milliseconds < 86400000) {
    const hours = Math.floor(milliseconds / 3600000);
    const minutes = Math.round((milliseconds % 3600000) / 60000);
    return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
  } else {
    const days = Math.floor(milliseconds / 86400000);
    const hours = Math.round((milliseconds % 86400000) / 3600000);
    return hours > 0 ? `${days}d ${hours}h` : `${days}d`;
  }
}

// Bytes formatting
export function formatBytes(
  bytes: number,
  decimals: number = 2
): string {
  if (typeof bytes !== 'number' || isNaN(bytes)) {
    return '—';
  }

  if (bytes === 0) return '0 Bytes';

  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];

  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}

// Date and time formatting
export function formatDate(
  date: Date | string | number,
  options: {
    style?: 'full' | 'long' | 'medium' | 'short';
    includeTime?: boolean;
    relative?: boolean;
  } = {}
): string {
  const { style = 'medium', includeTime = false, relative = false } = options;
  
  const dateObj = new Date(date);
  
  if (isNaN(dateObj.getTime())) {
    return '—';
  }

  if (relative) {
    return formatRelativeTime(dateObj);
  }

  const dateFormatOptions: Intl.DateTimeFormatOptions = {
    dateStyle: style,
  };

  if (includeTime) {
    dateFormatOptions.timeStyle = style;
  }

  return new Intl.DateTimeFormat('en-US', dateFormatOptions).format(dateObj);
}

export function formatRelativeTime(date: Date | string | number): string {
  const dateObj = new Date(date);
  
  if (isNaN(dateObj.getTime())) {
    return '—';
  }

  const now = new Date();
  const diffInSeconds = Math.floor((now.getTime() - dateObj.getTime()) / 1000);

  if (diffInSeconds < 60) {
    return 'just now';
  } else if (diffInSeconds < 3600) {
    const minutes = Math.floor(diffInSeconds / 60);
    return `${minutes}m ago`;
  } else if (diffInSeconds < 86400) {
    const hours = Math.floor(diffInSeconds / 3600);
    return `${hours}h ago`;
  } else if (diffInSeconds < 2592000) {
    const days = Math.floor(diffInSeconds / 86400);
    return `${days}d ago`;
  } else if (diffInSeconds < 31536000) {
    const months = Math.floor(diffInSeconds / 2592000);
    return `${months}mo ago`;
  } else {
    const years = Math.floor(diffInSeconds / 31536000);
    return `${years}y ago`;
  }
}

export function formatTimeRange(start: Date, end: Date): string {
  const startTime = start.toLocaleTimeString('en-US', { 
    hour12: false, 
    hour: '2-digit', 
    minute: '2-digit' 
  });
  const endTime = end.toLocaleTimeString('en-US', { 
    hour12: false, 
    hour: '2-digit', 
    minute: '2-digit' 
  });

  // Same day
  if (start.toDateString() === end.toDateString()) {
    return `${start.toLocaleDateString()} ${startTime} - ${endTime}`;
  }

  // Different days
  return `${start.toLocaleDateString()} ${startTime} - ${end.toLocaleDateString()} ${endTime}`;
}

// Rate formatting (e.g., requests per second)
export function formatRate(
  value: number,
  unit: string = 'ops/s',
  options: {
    decimals?: number;
  } = {}
): string {
  const { decimals = 2 } = options;
  
  if (typeof value !== 'number' || isNaN(value)) {
    return '—';
  }

  return `${value.toFixed(decimals)} ${unit}`;
}

// Latency percentile formatting
export function formatLatency(
  value: number,
  percentile?: number,
  unit: 'ms' | 's' = 'ms'
): string {
  if (typeof value !== 'number' || isNaN(value)) {
    return '—';
  }

  const formattedValue = unit === 's' ? value.toFixed(3) : Math.round(value);
  const suffix = percentile ? `p${percentile}` : '';
  
  return `${formattedValue}${unit}${suffix ? ` (${suffix})` : ''}`;
}

// Status formatting
export function formatStatus(
  status: string | number,
  options: {
    capitalize?: boolean;
    showIcon?: boolean;
  } = {}
): string {
  const { capitalize = true, showIcon = false } = options;
  
  let formattedStatus = String(status);
  
  if (capitalize) {
    formattedStatus = formattedStatus.charAt(0).toUpperCase() + formattedStatus.slice(1).toLowerCase();
  }

  if (showIcon) {
    const icons: Record<string, string> = {
      'healthy': '🟢',
      'warning': '🟡',
      'critical': '🔴',
      'unknown': '⚪',
      'active': '🟢',
      'inactive': '⚪',
      'error': '🔴',
    };
    
    const icon = icons[status.toString().toLowerCase()];
    if (icon) {
      formattedStatus = `${icon} ${formattedStatus}`;
    }
  }

  return formattedStatus;
}

// Trend formatting
export function formatTrend(
  currentValue: number,
  previousValue: number,
  options: {
    showSign?: boolean;
    showIcon?: boolean;
    asPercentage?: boolean;
  } = {}
): string {
  const { showSign = true, showIcon = false, asPercentage = true } = options;
  
  if (typeof currentValue !== 'number' || typeof previousValue !== 'number' || 
      isNaN(currentValue) || isNaN(previousValue) || previousValue === 0) {
    return '—';
  }

  const change = currentValue - previousValue;
  const percentageChange = (change / Math.abs(previousValue)) * 100;
  
  let formattedChange: string;
  
  if (asPercentage) {
    formattedChange = formatPercentage(percentageChange / 100, { 
      decimals: 1, 
      showSign 
    });
  } else {
    const sign = showSign && change > 0 ? '+' : '';
    formattedChange = `${sign}${formatNumber(change, undefined, { decimals: 2 })}`;
  }

  if (showIcon) {
    const icon = change > 0 ? '↗️' : change < 0 ? '↘️' : '➡️';
    formattedChange = `${icon} ${formattedChange}`;
  }

  return formattedChange;
}

// Utility function for safe numeric operations
export function safeNumber(
  value: unknown,
  fallback: number = 0
): number {
  if (typeof value === 'number' && !isNaN(value)) {
    return value;
  }
  
  if (typeof value === 'string') {
    const parsed = parseFloat(value);
    if (!isNaN(parsed)) {
      return parsed;
    }
  }
  
  return fallback;
}

// Format change indicators
export function formatChangeIndicator(
  change: number,
  options: {
    threshold?: number;
    showNeutral?: boolean;
  } = {}
): {
  direction: 'up' | 'down' | 'neutral';
  color: string;
  icon: string;
} {
  const { threshold = 0.001, showNeutral = true } = options;
  
  if (Math.abs(change) < threshold && showNeutral) {
    return {
      direction: 'neutral',
      color: 'text-muted-foreground',
      icon: '→'
    };
  }
  
  if (change > 0) {
    return {
      direction: 'up',
      color: 'text-green-600',
      icon: '↗'
    };
  }
  
  return {
    direction: 'down',
    color: 'text-red-600',
    icon: '↘'
  };
}