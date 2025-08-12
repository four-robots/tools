/**
 * Permission Panel Component
 * 
 * Comprehensive UI for managing whiteboard permissions including:
 * - User role assignments
 * - Granular permission controls
 * - Element-level permissions
 * - Area-based restrictions
 * - Time-based access controls
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Users,
  Shield,
  Clock,
  MapPin,
  Layers,
  Settings,
  Plus,
  Trash2,
  Edit,
  Eye,
  EyeOff,
  Lock,
  Unlock,
  UserPlus,
  AlertTriangle,
  CheckCircle,
  XCircle,
  MoreHorizontal,
} from 'lucide-react';

import { useWhiteboardPermissions } from '@/hooks/useWhiteboardPermissions';
import { useToast } from '@/hooks/use-toast';

// Types based on the permission service
interface WhiteboardPermission {
  id: string;
  whiteboardId: string;
  userId: string;
  userName?: string;
  userEmail?: string;
  role: 'owner' | 'editor' | 'commenter' | 'viewer' | 'custom';
  permissions: CustomPermissionSet;
  grantedBy: string;
  grantedAt: string;
  expiresAt?: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

interface CustomPermissionSet {
  canView: boolean;
  canEdit: boolean;
  canDelete: boolean;
  canComment: boolean;
  canCreateElements: boolean;
  canUpdateElements: boolean;
  canDeleteElements: boolean;
  canMoveElements: boolean;
  canResizeElements: boolean;
  canStyleElements: boolean;
  canLockElements: boolean;
  canGroupElements: boolean;
  canManagePermissions: boolean;
  canShare: boolean;
  canExport: boolean;
  canCreateTemplates: boolean;
  canViewHistory: boolean;
  canRestoreVersions: boolean;
  canManageComments: boolean;
  canSeePresence: boolean;
  canSeeCursors: boolean;
  canUseVoiceChat: boolean;
  canScreenShare: boolean;
  elementPermissions: ElementPermission[];
  areaPermissions: AreaPermission[];
  layerPermissions: LayerPermission[];
  timeBased?: TimeBasedPermission;
}

interface ElementPermission {
  elementId: string;
  elementType: string;
  canView: boolean;
  canEdit: boolean;
  canDelete: boolean;
  canMove: boolean;
  canStyle: boolean;
  canComment: boolean;
}

interface AreaPermission {
  areaId: string;
  name: string;
  bounds: { x: number; y: number; width: number; height: number };
  canView: boolean;
  canEdit: boolean;
  canComment: boolean;
  priority: number;
}

interface LayerPermission {
  layerIndex: number;
  layerName?: string;
  canView: boolean;
  canEdit: boolean;
  canReorder: boolean;
}

interface TimeBasedPermission {
  startTime?: string;
  endTime?: string;
  timezone: string;
  isActive: boolean;
  recurringPattern: 'none' | 'daily' | 'weekly' | 'monthly';
}

interface PermissionPanelProps {
  whiteboardId: string;
  currentUserId: string;
  isOpen: boolean;
  onClose: () => void;
}

const ROLE_DESCRIPTIONS = {
  owner: 'Full access to all whiteboard features and permissions management',
  editor: 'Can create, edit, and manage content but cannot change permissions',
  commenter: 'Can view content and add comments, but cannot edit',
  viewer: 'Read-only access to the whiteboard',
  custom: 'Custom permission set with specific granular controls',
};

const ROLE_COLORS = {
  owner: 'bg-purple-100 text-purple-800 border-purple-200',
  editor: 'bg-blue-100 text-blue-800 border-blue-200',
  commenter: 'bg-green-100 text-green-800 border-green-200',
  viewer: 'bg-gray-100 text-gray-800 border-gray-200',
  custom: 'bg-orange-100 text-orange-800 border-orange-200',
};

export default function PermissionPanel({
  whiteboardId,
  currentUserId,
  isOpen,
  onClose,
}: PermissionPanelProps) {
  const { toast } = useToast();
  const {
    permissions,
    loading,
    error,
    grantPermission,
    revokePermission,
    updatePermission,
    refreshPermissions,
  } = useWhiteboardPermissions(whiteboardId);

  const [activeTab, setActiveTab] = useState('users');
  const [selectedPermission, setSelectedPermission] = useState<WhiteboardPermission | null>(null);
  const [showAddUserDialog, setShowAddUserDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState<WhiteboardPermission | null>(null);
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserRole, setNewUserRole] = useState<'editor' | 'commenter' | 'viewer'>('viewer');
  const [searchTerm, setSearchTerm] = useState('');
  const [showAreaDialog, setShowAreaDialog] = useState(false);
  const [showLayerDialog, setShowLayerDialog] = useState(false);
  const [showScheduleDialog, setShowScheduleDialog] = useState(false);

  // Current user's permissions
  const currentUserPermission = useMemo(
    () => permissions.find(p => p.userId === currentUserId),
    [permissions, currentUserId]
  );

  const canManagePermissions = currentUserPermission?.permissions.canManagePermissions || false;

  // Filtered permissions based on search
  const filteredPermissions = useMemo(
    () => permissions.filter(p => 
      p.userName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.userEmail?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.role.toLowerCase().includes(searchTerm.toLowerCase())
    ),
    [permissions, searchTerm]
  );

  const handleAddUser = useCallback(async () => {
    if (!newUserEmail.trim() || !canManagePermissions) return;

    try {
      await grantPermission(newUserEmail, currentUserId, newUserRole);
      setNewUserEmail('');
      setNewUserRole('viewer');
      setShowAddUserDialog(false);
      toast({
        title: 'Permission granted',
        description: `Successfully granted ${newUserRole} access to ${newUserEmail}`,
      });
    } catch (error) {
      toast({
        title: 'Failed to grant permission',
        description: error instanceof Error ? error.message : 'An error occurred',
        variant: 'destructive',
      });
    }
  }, [newUserEmail, newUserRole, canManagePermissions, grantPermission, currentUserId, toast]);

  const handleDeletePermission = useCallback(async (permission: WhiteboardPermission) => {
    if (!canManagePermissions || permission.role === 'owner') return;

    try {
      await revokePermission(permission.userId, currentUserId);
      setShowDeleteDialog(null);
      toast({
        title: 'Permission revoked',
        description: `Removed access for ${permission.userEmail}`,
      });
    } catch (error) {
      toast({
        title: 'Failed to revoke permission',
        description: error instanceof Error ? error.message : 'An error occurred',
        variant: 'destructive',
      });
    }
  }, [canManagePermissions, revokePermission, currentUserId, toast]);

  const handleUpdateRole = useCallback(async (
    permission: WhiteboardPermission,
    newRole: 'owner' | 'editor' | 'commenter' | 'viewer' | 'custom'
  ) => {
    if (!canManagePermissions) return;

    try {
      await updatePermission(permission.userId, currentUserId, { role: newRole });
      toast({
        title: 'Role updated',
        description: `Changed ${permission.userEmail}'s role to ${newRole}`,
      });
    } catch (error) {
      toast({
        title: 'Failed to update role',
        description: error instanceof Error ? error.message : 'An error occurred',
        variant: 'destructive',
      });
    }
  }, [canManagePermissions, updatePermission, currentUserId, toast]);

  if (!isOpen) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Shield className="w-5 h-5" />
            Whiteboard Permissions
          </DialogTitle>
          <DialogDescription>
            Manage who can access and edit this whiteboard with granular permission controls.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-hidden">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="h-full">
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="users" className="flex items-center gap-2">
                <Users className="w-4 h-4" />
                Users
              </TabsTrigger>
              <TabsTrigger value="areas" className="flex items-center gap-2">
                <MapPin className="w-4 h-4" />
                Areas
              </TabsTrigger>
              <TabsTrigger value="layers" className="flex items-center gap-2">
                <Layers className="w-4 h-4" />
                Layers
              </TabsTrigger>
              <TabsTrigger value="schedule" className="flex items-center gap-2">
                <Clock className="w-4 h-4" />
                Schedule
              </TabsTrigger>
            </TabsList>

            <TabsContent value="users" className="space-y-4 h-[500px] overflow-y-auto">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 flex-1">
                  <Input
                    placeholder="Search users..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="max-w-sm"
                  />
                </div>
                {canManagePermissions && (
                  <Dialog open={showAddUserDialog} onOpenChange={setShowAddUserDialog}>
                    <DialogTrigger asChild>
                      <Button>
                        <UserPlus className="w-4 h-4 mr-2" />
                        Add User
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Grant Whiteboard Access</DialogTitle>
                        <DialogDescription>
                          Enter a user's email address and select their role.
                        </DialogDescription>
                      </DialogHeader>
                      <div className="space-y-4">
                        <div>
                          <Label htmlFor="email">Email Address</Label>
                          <Input
                            id="email"
                            type="email"
                            placeholder="user@example.com"
                            value={newUserEmail}
                            onChange={(e) => setNewUserEmail(e.target.value)}
                          />
                        </div>
                        <div>
                          <Label htmlFor="role">Role</Label>
                          <Select value={newUserRole} onValueChange={(value: any) => setNewUserRole(value)}>
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="editor">Editor</SelectItem>
                              <SelectItem value="commenter">Commenter</SelectItem>
                              <SelectItem value="viewer">Viewer</SelectItem>
                            </SelectContent>
                          </Select>
                          <p className="text-sm text-muted-foreground mt-1">
                            {ROLE_DESCRIPTIONS[newUserRole]}
                          </p>
                        </div>
                      </div>
                      <DialogFooter>
                        <Button
                          variant="outline"
                          onClick={() => setShowAddUserDialog(false)}
                        >
                          Cancel
                        </Button>
                        <Button onClick={handleAddUser} disabled={!newUserEmail.trim()}>
                          Grant Access
                        </Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                )}
              </div>

              {loading ? (
                <div className="text-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 mx-auto"></div>
                  <p className="text-muted-foreground mt-2">Loading permissions...</p>
                </div>
              ) : error ? (
                <div className="text-center py-8">
                  <AlertTriangle className="w-12 h-12 text-red-500 mx-auto mb-2" />
                  <p className="text-red-600">Failed to load permissions</p>
                  <Button onClick={refreshPermissions} variant="outline" className="mt-2">
                    Retry
                  </Button>
                </div>
              ) : (
                <div className="space-y-2">
                  {filteredPermissions.map((permission) => (
                    <Card key={permission.id} className="hover:shadow-md transition-shadow">
                      <CardContent className="p-4">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 bg-gradient-to-r from-blue-500 to-purple-600 rounded-full flex items-center justify-center text-white font-medium text-sm">
                              {permission.userName?.charAt(0)?.toUpperCase() || permission.userEmail?.charAt(0)?.toUpperCase()}
                            </div>
                            <div>
                              <div className="font-medium">{permission.userName || 'Unknown User'}</div>
                              <div className="text-sm text-muted-foreground">{permission.userEmail}</div>
                              {permission.expiresAt && (
                                <div className="text-xs text-amber-600 flex items-center gap-1">
                                  <Clock className="w-3 h-3" />
                                  Expires {new Date(permission.expiresAt).toLocaleDateString()}
                                </div>
                              )}
                            </div>
                          </div>
                          
                          <div className="flex items-center gap-2">
                            <Badge className={ROLE_COLORS[permission.role]}>
                              {permission.role}
                            </Badge>
                            
                            {permission.userId === currentUserId && (
                              <Badge variant="secondary">You</Badge>
                            )}
                            
                            {canManagePermissions && permission.userId !== currentUserId && (
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button variant="ghost" size="sm">
                                    <MoreHorizontal className="w-4 h-4" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                  <DropdownMenuLabel>Change Role</DropdownMenuLabel>
                                  <DropdownMenuItem
                                    onClick={() => handleUpdateRole(permission, 'editor')}
                                    disabled={permission.role === 'editor'}
                                  >
                                    <Edit className="w-4 h-4 mr-2" />
                                    Editor
                                  </DropdownMenuItem>
                                  <DropdownMenuItem
                                    onClick={() => handleUpdateRole(permission, 'commenter')}
                                    disabled={permission.role === 'commenter'}
                                  >
                                    <Edit className="w-4 h-4 mr-2" />
                                    Commenter
                                  </DropdownMenuItem>
                                  <DropdownMenuItem
                                    onClick={() => handleUpdateRole(permission, 'viewer')}
                                    disabled={permission.role === 'viewer'}
                                  >
                                    <Eye className="w-4 h-4 mr-2" />
                                    Viewer
                                  </DropdownMenuItem>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem
                                    onClick={() => setSelectedPermission(permission)}
                                    className="text-blue-600"
                                  >
                                    <Settings className="w-4 h-4 mr-2" />
                                    Custom Permissions
                                  </DropdownMenuItem>
                                  {permission.role !== 'owner' && (
                                    <>
                                      <DropdownMenuSeparator />
                                      <DropdownMenuItem
                                        onClick={() => setShowDeleteDialog(permission)}
                                        className="text-red-600"
                                      >
                                        <Trash2 className="w-4 h-4 mr-2" />
                                        Remove Access
                                      </DropdownMenuItem>
                                    </>
                                  )}
                                </DropdownMenuContent>
                              </DropdownMenu>
                            )}
                          </div>
                        </div>
                        
                        {permission.role === 'custom' && (
                          <div className="mt-3 pt-3 border-t">
                            <div className="text-sm text-muted-foreground mb-2">Custom Permissions:</div>
                            <div className="flex flex-wrap gap-1">
                              {Object.entries(permission.permissions)
                                .filter(([key, value]) => 
                                  typeof value === 'boolean' && value && 
                                  !key.includes('can') && 
                                  !['elementPermissions', 'areaPermissions', 'layerPermissions', 'timeBased'].includes(key)
                                )
                                .slice(0, 5)
                                .map(([key]) => (
                                  <Badge key={key} variant="outline" className="text-xs">
                                    {key.replace('can', '').replace(/([A-Z])/g, ' $1').trim()}
                                  </Badge>
                                ))}
                              {Object.keys(permission.permissions).filter(key => permission.permissions[key as keyof CustomPermissionSet] === true).length > 5 && (
                                <Badge variant="outline" className="text-xs">
                                  +{Object.keys(permission.permissions).filter(key => permission.permissions[key as keyof CustomPermissionSet] === true).length - 5} more
                                </Badge>
                              )}
                            </div>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </TabsContent>

            <TabsContent value="areas" className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-medium">Area-Based Permissions</h3>
                {canManagePermissions && (
                  <Button onClick={() => setShowAreaDialog(true)}>
                    <Plus className="w-4 h-4 mr-2" />
                    Add Area Restriction
                  </Button>
                )}
              </div>
              
              <p className="text-muted-foreground text-sm">
                Control access to specific areas of the whiteboard. Users can only interact with areas they have permissions for.
              </p>
              
              <div className="grid gap-4">
                {selectedPermission?.permissions.areaPermissions?.map((area) => (
                  <Card key={area.areaId} className="p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <h4 className="font-medium">{area.name}</h4>
                        <p className="text-sm text-muted-foreground">
                          Area: {area.bounds.x}, {area.bounds.y} - {area.bounds.width}×{area.bounds.height}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant={area.canEdit ? 'default' : 'secondary'}>
                          {area.canEdit ? 'Edit' : area.canView ? 'View' : 'No Access'}
                        </Badge>
                        <Badge variant="outline">Priority: {area.priority}</Badge>
                      </div>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <div className="flex items-center gap-2">
                        <Switch 
                          checked={area.canView}
                          disabled={!canManagePermissions}
                          size="sm"
                        />
                        <Label className="text-xs">View</Label>
                      </div>
                      <div className="flex items-center gap-2">
                        <Switch 
                          checked={area.canEdit}
                          disabled={!canManagePermissions}
                          size="sm"
                        />
                        <Label className="text-xs">Edit</Label>
                      </div>
                      <div className="flex items-center gap-2">
                        <Switch 
                          checked={area.canComment}
                          disabled={!canManagePermissions}
                          size="sm"
                        />
                        <Label className="text-xs">Comment</Label>
                      </div>
                    </div>
                  </Card>
                )) || (
                  <div className="text-center py-8">
                    <MapPin className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                    <p className="text-muted-foreground">No area restrictions defined</p>
                    <p className="text-xs text-muted-foreground mt-2">
                      Area permissions allow granular control over whiteboard regions
                    </p>
                  </div>
                )}
              </div>
            </TabsContent>

            <TabsContent value="layers" className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-medium">Layer-Based Permissions</h3>
                {canManagePermissions && (
                  <Button onClick={() => setShowLayerDialog(true)}>
                    <Plus className="w-4 h-4 mr-2" />
                    Configure Layer Access
                  </Button>
                )}
              </div>
              
              <p className="text-muted-foreground text-sm">
                Control access to specific layers in the whiteboard. Users can be restricted to certain depth levels.
              </p>
              
              <div className="grid gap-4">
                {selectedPermission?.permissions.layerPermissions?.map((layer) => (
                  <Card key={layer.layerIndex} className="p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <h4 className="font-medium">
                          Layer {layer.layerIndex} {layer.layerName && `- ${layer.layerName}`}
                        </h4>
                        <p className="text-sm text-muted-foreground">
                          Z-index: {layer.layerIndex}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant={layer.canEdit ? 'default' : 'secondary'}>
                          {layer.canEdit ? 'Edit' : layer.canView ? 'View' : 'Hidden'}
                        </Badge>
                      </div>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-4">
                      <div className="flex items-center gap-2">
                        <Switch 
                          checked={layer.canView}
                          disabled={!canManagePermissions}
                          size="sm"
                        />
                        <Label className="text-xs">View Layer</Label>
                      </div>
                      <div className="flex items-center gap-2">
                        <Switch 
                          checked={layer.canEdit}
                          disabled={!canManagePermissions}
                          size="sm"
                        />
                        <Label className="text-xs">Edit Layer</Label>
                      </div>
                      <div className="flex items-center gap-2">
                        <Switch 
                          checked={layer.canReorder}
                          disabled={!canManagePermissions}
                          size="sm"
                        />
                        <Label className="text-xs">Reorder Layer</Label>
                      </div>
                    </div>
                  </Card>
                )) || (
                  <div className="text-center py-8">
                    <Layers className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                    <p className="text-muted-foreground">No layer restrictions defined</p>
                    <p className="text-xs text-muted-foreground mt-2">
                      Layer permissions control which drawing layers users can access
                    </p>
                  </div>
                )}
              </div>
            </TabsContent>

            <TabsContent value="schedule" className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-medium">Time-Based Access</h3>
                {canManagePermissions && (
                  <Button onClick={() => setShowScheduleDialog(true)}>
                    <Plus className="w-4 h-4 mr-2" />
                    Create Schedule
                  </Button>
                )}
              </div>
              
              <p className="text-muted-foreground text-sm">
                Control when users can access the whiteboard. Set specific time windows and recurring patterns.
              </p>
              
              <div className="space-y-4">
                {selectedPermission?.permissions.timeBased ? (
                  <Card className="p-4">
                    <div className="flex items-center justify-between mb-4">
                      <h4 className="font-medium">Access Schedule</h4>
                      <Badge variant={selectedPermission.permissions.timeBased.isActive ? 'default' : 'secondary'}>
                        {selectedPermission.permissions.timeBased.isActive ? 'Active' : 'Inactive'}
                      </Badge>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-4 mb-4">
                      <div>
                        <Label className="text-xs font-medium">Start Time</Label>
                        <p className="text-sm">
                          {selectedPermission.permissions.timeBased.startTime 
                            ? new Date(selectedPermission.permissions.timeBased.startTime).toLocaleString()
                            : 'No restriction'
                          }
                        </p>
                      </div>
                      <div>
                        <Label className="text-xs font-medium">End Time</Label>
                        <p className="text-sm">
                          {selectedPermission.permissions.timeBased.endTime
                            ? new Date(selectedPermission.permissions.timeBased.endTime).toLocaleString()
                            : 'No restriction'
                          }
                        </p>
                      </div>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label className="text-xs font-medium">Timezone</Label>
                        <p className="text-sm">{selectedPermission.permissions.timeBased.timezone}</p>
                      </div>
                      <div>
                        <Label className="text-xs font-medium">Recurring Pattern</Label>
                        <p className="text-sm capitalize">
                          {selectedPermission.permissions.timeBased.recurringPattern}
                        </p>
                      </div>
                    </div>
                    
                    <div className="mt-4 flex items-center gap-2">
                      <Switch 
                        checked={selectedPermission.permissions.timeBased.isActive}
                        disabled={!canManagePermissions}
                      />
                      <Label className="text-sm">Schedule is active</Label>
                    </div>
                  </Card>
                ) : (
                  <div className="text-center py-8">
                    <Clock className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                    <p className="text-muted-foreground">No schedule restrictions defined</p>
                    <p className="text-xs text-muted-foreground mt-2">
                      Time-based permissions allow access control during specific hours or dates
                    </p>
                  </div>
                )}
              </div>
            </TabsContent>
          </Tabs>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
        </DialogFooter>

        {/* Delete Permission Dialog */}
        <AlertDialog open={!!showDeleteDialog} onOpenChange={() => setShowDeleteDialog(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Remove Access</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to remove access for {showDeleteDialog?.userEmail}? 
                They will no longer be able to view or edit this whiteboard.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => showDeleteDialog && handleDeletePermission(showDeleteDialog)}
                className="bg-red-600 hover:bg-red-700"
              >
                Remove Access
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Custom Permission Editor Dialog */}
        {selectedPermission && (
          <CustomPermissionDialog
            permission={selectedPermission}
            onClose={() => setSelectedPermission(null)}
            onSave={(updates) => {
              updatePermission(selectedPermission.userId, currentUserId, { permissions: updates });
              setSelectedPermission(null);
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

// Custom Permission Editor Dialog Component
interface CustomPermissionDialogProps {
  permission: WhiteboardPermission;
  onClose: () => void;
  onSave: (permissions: Partial<CustomPermissionSet>) => void;
}

function CustomPermissionDialog({ permission, onClose, onSave }: CustomPermissionDialogProps) {
  const [customPermissions, setCustomPermissions] = useState<CustomPermissionSet>(
    permission.permissions
  );

  const handleTogglePermission = (key: keyof CustomPermissionSet, value: boolean) => {
    setCustomPermissions(prev => ({
      ...prev,
      [key]: value,
    }));
  };

  const handleSave = () => {
    onSave(customPermissions);
  };

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Custom Permissions for {permission.userEmail}</DialogTitle>
          <DialogDescription>
            Configure granular permissions for this user's access to the whiteboard.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          <div>
            <h3 className="text-sm font-medium mb-3">Basic Permissions</h3>
            <div className="grid grid-cols-2 gap-3">
              {[
                { key: 'canView', label: 'View whiteboard' },
                { key: 'canEdit', label: 'Edit whiteboard' },
                { key: 'canDelete', label: 'Delete whiteboard' },
                { key: 'canComment', label: 'Add comments' },
              ].map(({ key, label }) => (
                <div key={key} className="flex items-center justify-between p-2 border rounded">
                  <Label htmlFor={key} className="text-sm">{label}</Label>
                  <Switch
                    id={key}
                    checked={customPermissions[key as keyof CustomPermissionSet] as boolean}
                    onCheckedChange={(value) => handleTogglePermission(key as keyof CustomPermissionSet, value)}
                  />
                </div>
              ))}
            </div>
          </div>

          <div>
            <h3 className="text-sm font-medium mb-3">Element Permissions</h3>
            <div className="grid grid-cols-2 gap-3">
              {[
                { key: 'canCreateElements', label: 'Create elements' },
                { key: 'canUpdateElements', label: 'Update elements' },
                { key: 'canDeleteElements', label: 'Delete elements' },
                { key: 'canMoveElements', label: 'Move elements' },
                { key: 'canResizeElements', label: 'Resize elements' },
                { key: 'canStyleElements', label: 'Style elements' },
                { key: 'canLockElements', label: 'Lock elements' },
                { key: 'canGroupElements', label: 'Group elements' },
              ].map(({ key, label }) => (
                <div key={key} className="flex items-center justify-between p-2 border rounded">
                  <Label htmlFor={key} className="text-sm">{label}</Label>
                  <Switch
                    id={key}
                    checked={customPermissions[key as keyof CustomPermissionSet] as boolean}
                    onCheckedChange={(value) => handleTogglePermission(key as keyof CustomPermissionSet, value)}
                  />
                </div>
              ))}
            </div>
          </div>

          <div>
            <h3 className="text-sm font-medium mb-3">Advanced Permissions</h3>
            <div className="grid grid-cols-2 gap-3">
              {[
                { key: 'canManagePermissions', label: 'Manage permissions' },
                { key: 'canShare', label: 'Share whiteboard' },
                { key: 'canExport', label: 'Export whiteboard' },
                { key: 'canCreateTemplates', label: 'Create templates' },
                { key: 'canViewHistory', label: 'View history' },
                { key: 'canRestoreVersions', label: 'Restore versions' },
                { key: 'canManageComments', label: 'Manage comments' },
                { key: 'canSeePresence', label: 'See user presence' },
              ].map(({ key, label }) => (
                <div key={key} className="flex items-center justify-between p-2 border rounded">
                  <Label htmlFor={key} className="text-sm">{label}</Label>
                  <Switch
                    id={key}
                    checked={customPermissions[key as keyof CustomPermissionSet] as boolean}
                    onCheckedChange={(value) => handleTogglePermission(key as keyof CustomPermissionSet, value)}
                  />
                </div>
              ))}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSave}>
            Save Permissions
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}