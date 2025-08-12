/**
 * Permission Indicator Component
 * 
 * Visual indicators for permission states including:
 * - User access level badges
 * - Element-level permission overlays
 * - Area restriction boundaries
 * - Real-time permission status updates
 */

import React, { useMemo } from 'react';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  Shield,
  Eye,
  Edit,
  Lock,
  Unlock,
  AlertTriangle,
  CheckCircle,
  Clock,
  Users,
  Ban,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface PermissionIndicatorProps {
  type: 'user-badge' | 'element-overlay' | 'area-boundary' | 'status-icon';
  permission: 'owner' | 'editor' | 'commenter' | 'viewer' | 'denied' | 'restricted' | 'expired';
  className?: string;
  size?: 'sm' | 'md' | 'lg';
  showTooltip?: boolean;
  tooltipContent?: string;
  elementLocked?: boolean;
  expiresAt?: string;
  children?: React.ReactNode;
}

interface AreaPermissionOverlayProps {
  bounds: { x: number; y: number; width: number; height: number };
  permission: 'restricted' | 'view-only' | 'editable';
  name: string;
  priority: number;
  className?: string;
}

interface ElementPermissionOverlayProps {
  elementId: string;
  permission: 'editable' | 'view-only' | 'locked' | 'denied';
  isSelected?: boolean;
  className?: string;
}

const PERMISSION_COLORS = {
  owner: {
    bg: 'bg-purple-100',
    text: 'text-purple-800',
    border: 'border-purple-200',
    icon: 'text-purple-600',
  },
  editor: {
    bg: 'bg-blue-100',
    text: 'text-blue-800',
    border: 'border-blue-200',
    icon: 'text-blue-600',
  },
  commenter: {
    bg: 'bg-green-100',
    text: 'text-green-800',
    border: 'border-green-200',
    icon: 'text-green-600',
  },
  viewer: {
    bg: 'bg-gray-100',
    text: 'text-gray-800',
    border: 'border-gray-200',
    icon: 'text-gray-600',
  },
  denied: {
    bg: 'bg-red-100',
    text: 'text-red-800',
    border: 'border-red-200',
    icon: 'text-red-600',
  },
  restricted: {
    bg: 'bg-amber-100',
    text: 'text-amber-800',
    border: 'border-amber-200',
    icon: 'text-amber-600',
  },
  expired: {
    bg: 'bg-orange-100',
    text: 'text-orange-800',
    border: 'border-orange-200',
    icon: 'text-orange-600',
  },
};

const PERMISSION_ICONS = {
  owner: Shield,
  editor: Edit,
  commenter: Users,
  viewer: Eye,
  denied: Ban,
  restricted: AlertTriangle,
  expired: Clock,
};

const SIZE_CLASSES = {
  sm: {
    badge: 'text-xs px-1.5 py-0.5',
    icon: 'w-3 h-3',
    overlay: 'text-xs',
  },
  md: {
    badge: 'text-sm px-2 py-1',
    icon: 'w-4 h-4',
    overlay: 'text-sm',
  },
  lg: {
    badge: 'text-base px-3 py-1.5',
    icon: 'w-5 h-5',
    overlay: 'text-base',
  },
};

export default function PermissionIndicator({
  type,
  permission,
  className = '',
  size = 'md',
  showTooltip = true,
  tooltipContent,
  elementLocked = false,
  expiresAt,
  children,
}: PermissionIndicatorProps) {
  const colors = PERMISSION_COLORS[permission];
  const IconComponent = PERMISSION_ICONS[permission];
  const sizeClasses = SIZE_CLASSES[size];

  const isExpiringSoon = useMemo(() => {
    if (!expiresAt) return false;
    const expiryDate = new Date(expiresAt);
    const now = new Date();
    const hoursUntilExpiry = (expiryDate.getTime() - now.getTime()) / (1000 * 60 * 60);
    return hoursUntilExpiry > 0 && hoursUntilExpiry <= 24; // Expires within 24 hours
  }, [expiresAt]);

  const tooltipText = useMemo(() => {
    if (tooltipContent) return tooltipContent;
    
    const baseText = {
      owner: 'Full access to all whiteboard features',
      editor: 'Can create, edit, and manage content',
      commenter: 'Can view content and add comments',
      viewer: 'Read-only access to the whiteboard',
      denied: 'Access denied to this resource',
      restricted: 'Limited access with restrictions',
      expired: 'Permissions have expired',
    }[permission];

    if (expiresAt) {
      const expiryDate = new Date(expiresAt);
      return `${baseText}. Expires: ${expiryDate.toLocaleDateString()} at ${expiryDate.toLocaleTimeString()}`;
    }

    return baseText;
  }, [permission, tooltipContent, expiresAt]);

  const renderUserBadge = () => (
    <Badge
      className={cn(
        colors.bg,
        colors.text,
        colors.border,
        sizeClasses.badge,
        isExpiringSoon && 'animate-pulse',
        className
      )}
      variant="outline"
    >
      <IconComponent className={cn(sizeClasses.icon, 'mr-1')} />
      {permission}
      {elementLocked && <Lock className={cn(sizeClasses.icon, 'ml-1')} />}
      {isExpiringSoon && <Clock className={cn(sizeClasses.icon, 'ml-1 text-amber-500')} />}
    </Badge>
  );

  const renderStatusIcon = () => (
    <div
      className={cn(
        'flex items-center justify-center rounded-full',
        colors.bg,
        isExpiringSoon && 'animate-pulse',
        size === 'sm' && 'w-6 h-6',
        size === 'md' && 'w-8 h-8',
        size === 'lg' && 'w-10 h-10',
        className
      )}
    >
      <IconComponent className={cn(sizeClasses.icon, colors.icon)} />
      {elementLocked && (
        <Lock className={cn(sizeClasses.icon, 'absolute -top-1 -right-1 bg-white rounded-full p-0.5')} />
      )}
    </div>
  );

  const renderElementOverlay = () => (
    <div
      className={cn(
        'absolute inset-0 pointer-events-none border-2 rounded',
        permission === 'editable' && 'border-green-400 bg-green-50/20',
        permission === 'view-only' && 'border-blue-400 bg-blue-50/20',
        permission === 'locked' && 'border-amber-400 bg-amber-50/20',
        permission === 'denied' && 'border-red-400 bg-red-50/20',
        className
      )}
    >
      <div className="absolute top-1 right-1">
        <div className={cn(
          'flex items-center justify-center rounded-full w-5 h-5',
          permission === 'editable' && 'bg-green-500 text-white',
          permission === 'view-only' && 'bg-blue-500 text-white',
          permission === 'locked' && 'bg-amber-500 text-white',
          permission === 'denied' && 'bg-red-500 text-white'
        )}>
          {permission === 'editable' && <Edit className="w-3 h-3" />}
          {permission === 'view-only' && <Eye className="w-3 h-3" />}
          {permission === 'locked' && <Lock className="w-3 h-3" />}
          {permission === 'denied' && <Ban className="w-3 h-3" />}
        </div>
      </div>
    </div>
  );

  const renderAreaBoundary = () => (
    <div
      className={cn(
        'absolute border-2 border-dashed pointer-events-none',
        permission === 'restricted' && 'border-amber-400 bg-amber-50/10',
        permission === 'denied' && 'border-red-400 bg-red-50/10',
        className
      )}
    >
      <div className="absolute -top-6 left-0">
        <Badge
          className={cn(
            colors.bg,
            colors.text,
            colors.border,
            sizeClasses.badge
          )}
          variant="outline"
        >
          <IconComponent className={cn(sizeClasses.icon, 'mr-1')} />
          Restricted Area
        </Badge>
      </div>
    </div>
  );

  const content = () => {
    switch (type) {
      case 'user-badge':
        return renderUserBadge();
      case 'element-overlay':
        return renderElementOverlay();
      case 'area-boundary':
        return renderAreaBoundary();
      case 'status-icon':
        return renderStatusIcon();
      default:
        return null;
    }
  };

  if (!showTooltip) {
    return content();
  }

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          {content()}
        </TooltipTrigger>
        <TooltipContent>
          <p>{tooltipText}</p>
          {children}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

/**
 * Area Permission Overlay Component
 * Shows restricted areas on the whiteboard canvas
 */
export function AreaPermissionOverlay({
  bounds,
  permission,
  name,
  priority,
  className = '',
}: AreaPermissionOverlayProps) {
  const permissionColors = {
    restricted: 'border-amber-400 bg-amber-50/10',
    'view-only': 'border-blue-400 bg-blue-50/10',
    editable: 'border-green-400 bg-green-50/10',
  };

  const permissionIcons = {
    restricted: AlertTriangle,
    'view-only': Eye,
    editable: CheckCircle,
  };

  const IconComponent = permissionIcons[permission];

  return (
    <div
      className={cn(
        'absolute border-2 border-dashed pointer-events-none',
        permissionColors[permission],
        className
      )}
      style={{
        left: bounds.x,
        top: bounds.y,
        width: bounds.width,
        height: bounds.height,
      }}
    >
      {/* Area Label */}
      <div className="absolute -top-8 left-0 flex items-center gap-1">
        <Badge
          variant="outline"
          className={cn(
            'text-xs',
            permission === 'restricted' && 'bg-amber-100 text-amber-800 border-amber-200',
            permission === 'view-only' && 'bg-blue-100 text-blue-800 border-blue-200',
            permission === 'editable' && 'bg-green-100 text-green-800 border-green-200'
          )}
        >
          <IconComponent className="w-3 h-3 mr-1" />
          {name}
          {priority > 0 && (
            <span className="ml-1 text-xs opacity-75">P{priority}</span>
          )}
        </Badge>
      </div>

      {/* Corner Indicators */}
      <div className="absolute top-1 right-1">
        <IconComponent className={cn(
          'w-4 h-4',
          permission === 'restricted' && 'text-amber-500',
          permission === 'view-only' && 'text-blue-500',
          permission === 'editable' && 'text-green-500'
        )} />
      </div>
    </div>
  );
}

/**
 * Element Permission Overlay Component
 * Shows permission status for individual elements
 */
export function ElementPermissionOverlay({
  elementId,
  permission,
  isSelected = false,
  className = '',
}: ElementPermissionOverlayProps) {
  const permissionConfig = {
    editable: {
      border: 'border-green-400',
      bg: 'bg-green-50/20',
      icon: Edit,
      iconBg: 'bg-green-500',
      label: 'Editable',
    },
    'view-only': {
      border: 'border-blue-400',
      bg: 'bg-blue-50/20',
      icon: Eye,
      iconBg: 'bg-blue-500',
      label: 'View Only',
    },
    locked: {
      border: 'border-amber-400',
      bg: 'bg-amber-50/20',
      icon: Lock,
      iconBg: 'bg-amber-500',
      label: 'Locked',
    },
    denied: {
      border: 'border-red-400',
      bg: 'bg-red-50/20',
      icon: Ban,
      iconBg: 'bg-red-500',
      label: 'Access Denied',
    },
  };

  const config = permissionConfig[permission];
  const IconComponent = config.icon;

  return (
    <div
      className={cn(
        'absolute inset-0 pointer-events-none border-2 rounded',
        config.border,
        config.bg,
        isSelected && 'border-4',
        className
      )}
      data-element-id={elementId}
      data-permission={permission}
    >
      {/* Permission Icon */}
      <div className="absolute -top-2 -right-2">
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <div className={cn(
                'flex items-center justify-center rounded-full w-5 h-5 text-white shadow-sm',
                config.iconBg
              )}>
                <IconComponent className="w-3 h-3" />
              </div>
            </TooltipTrigger>
            <TooltipContent>
              <p>{config.label}</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>

      {/* Permission Label (only show when selected) */}
      {isSelected && (
        <div className="absolute -bottom-6 left-0">
          <Badge
            variant="outline"
            className={cn(
              'text-xs',
              permission === 'editable' && 'bg-green-100 text-green-800 border-green-200',
              permission === 'view-only' && 'bg-blue-100 text-blue-800 border-blue-200',
              permission === 'locked' && 'bg-amber-100 text-amber-800 border-amber-200',
              permission === 'denied' && 'bg-red-100 text-red-800 border-red-200'
            )}
          >
            <IconComponent className="w-3 h-3 mr-1" />
            {config.label}
          </Badge>
        </div>
      )}
    </div>
  );
}

/**
 * Bulk Permission Status Component
 * Shows permission status for multiple selected elements
 */
interface BulkPermissionStatusProps {
  selectedElements: Array<{ id: string; permission: 'editable' | 'view-only' | 'locked' | 'denied' }>;
  className?: string;
}

export function BulkPermissionStatus({ selectedElements, className = '' }: BulkPermissionStatusProps) {
  const permissionCounts = useMemo(() => {
    const counts = {
      editable: 0,
      'view-only': 0,
      locked: 0,
      denied: 0,
    };
    
    selectedElements.forEach(el => {
      counts[el.permission]++;
    });
    
    return counts;
  }, [selectedElements]);

  const totalElements = selectedElements.length;
  const hasVariedPermissions = Object.values(permissionCounts).filter(count => count > 0).length > 1;

  if (totalElements === 0) return null;

  return (
    <div className={cn(
      'flex items-center gap-2 px-3 py-2 bg-white border border-gray-200 rounded-lg shadow-sm',
      className
    )}>
      <span className="text-sm font-medium">
        {totalElements} element{totalElements > 1 ? 's' : ''} selected
      </span>
      
      {hasVariedPermissions ? (
        <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">
          <AlertTriangle className="w-3 h-3 mr-1" />
          Mixed Permissions
        </Badge>
      ) : (
        <>
          {permissionCounts.editable > 0 && (
            <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
              <Edit className="w-3 h-3 mr-1" />
              Editable
            </Badge>
          )}
          {permissionCounts['view-only'] > 0 && (
            <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
              <Eye className="w-3 h-3 mr-1" />
              View Only
            </Badge>
          )}
          {permissionCounts.locked > 0 && (
            <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">
              <Lock className="w-3 h-3 mr-1" />
              Locked
            </Badge>
          )}
          {permissionCounts.denied > 0 && (
            <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200">
              <Ban className="w-3 h-3 mr-1" />
              Access Denied
            </Badge>
          )}
        </>
      )}
    </div>
  );
}