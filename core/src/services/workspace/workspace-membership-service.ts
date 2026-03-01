import { DatabasePool } from '../../utils/database-pool.js';
import { Logger } from '../../utils/logger.js';
import {
  WorkspaceMember,
  WorkspaceMemberWithUser,
  InviteMemberRequest,
  UpdateMemberRequest,
  PaginatedMembers,
  BulkMemberOperation,
  WorkspaceMemberRole,
  WorkspaceMemberStatus,
  WorkspaceError,
} from '@shared/types/workspace.js';
import { randomUUID } from 'crypto';

/**
 * Workspace membership and role management service
 */
export class WorkspaceMembershipService {
  private logger: Logger;

  constructor(
    private db: DatabasePool,
    logger?: Logger
  ) {
    this.logger = logger || new Logger('WorkspaceMembershipService');
  }

  /**
   * Invite a member to workspace
   */
  async inviteMember(
    workspaceId: string,
    inviterId: string,
    tenantId: string,
    request: InviteMemberRequest
  ): Promise<WorkspaceMember> {
    try {
      // Check inviter permissions
      await this.checkMembershipPermission(workspaceId, inviterId, tenantId, 'canInviteMembers');

      // Check workspace member limits
      await this.checkMemberLimit(workspaceId);

      let targetUserId = request.userId;

      // If email provided, look up or create user
      if (request.email && !targetUserId) {
        targetUserId = await this.resolveUserByEmail(request.email, tenantId);
      }

      if (!targetUserId) {
        throw this.createMembershipError('MEMBER_NOT_FOUND', 'User not found');
      }

      // Check if user is already a member
      const existingMember = await this.getMember(workspaceId, targetUserId);
      if (existingMember) {
        if (existingMember.status === 'active') {
          throw this.createMembershipError('CONFLICT_ERROR', 'User is already a member');
        } else {
          // Reactivate existing member
          return await this.updateMemberStatus(workspaceId, targetUserId, 'active', inviterId);
        }
      }

      const memberId = randomUUID();
      const now = new Date().toISOString();

      const member: WorkspaceMember = {
        id: memberId,
        workspaceId,
        userId: targetUserId,
        role: request.role,
        permissions: request.permissions || this.getDefaultPermissions(request.role),
        invitedBy: inviterId,
        joinedAt: now,
        status: 'pending',
        notificationSettings: {},
        createdAt: now,
        updatedAt: now,
      };

      const query = `
        INSERT INTO workspace_members (
          id, workspace_id, user_id, role, permissions, invited_by,
          joined_at, status, notification_settings, created_at, updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        RETURNING *
      `;

      const result = await this.db.query(query, [
        member.id,
        member.workspaceId,
        member.userId,
        member.role,
        JSON.stringify(member.permissions),
        member.invitedBy,
        member.joinedAt,
        member.status,
        JSON.stringify(member.notificationSettings),
        member.createdAt,
        member.updatedAt,
      ]);

      // Update workspace member count
      await this.updateWorkspaceMemberCount(workspaceId);

      // TODO: Send invitation notification
      await this.sendInvitationNotification(workspaceId, targetUserId, inviterId, request.message);

      this.logger.info('Member invited successfully', { workspaceId, targetUserId, inviterId });

      return this.mapDatabaseRowToMember(result.rows[0]);
    } catch (error) {
      this.logger.error('Failed to invite member', { error, workspaceId, inviterId, request });
      throw error;
    }
  }

  /**
   * Accept workspace invitation
   */
  async acceptInvitation(
    workspaceId: string,
    userId: string,
    tenantId: string
  ): Promise<WorkspaceMember> {
    try {
      const member = await this.getMember(workspaceId, userId);
      
      if (!member) {
        throw this.createMembershipError('MEMBER_NOT_FOUND', 'Invitation not found');
      }

      if (member.status !== 'pending') {
        throw this.createMembershipError('CONFLICT_ERROR', 'Invitation already processed');
      }

      return await this.updateMemberStatus(workspaceId, userId, 'active', userId);
    } catch (error) {
      this.logger.error('Failed to accept invitation', { error, workspaceId, userId });
      throw error;
    }
  }

  /**
   * Decline workspace invitation
   */
  async declineInvitation(
    workspaceId: string,
    userId: string,
    tenantId: string
  ): Promise<void> {
    try {
      const member = await this.getMember(workspaceId, userId);
      
      if (!member) {
        throw this.createMembershipError('MEMBER_NOT_FOUND', 'Invitation not found');
      }

      if (member.status !== 'pending') {
        throw this.createMembershipError('CONFLICT_ERROR', 'Invitation already processed');
      }

      await this.removeMember(workspaceId, userId, userId, tenantId);

      this.logger.info('Invitation declined', { workspaceId, userId });
    } catch (error) {
      this.logger.error('Failed to decline invitation', { error, workspaceId, userId });
      throw error;
    }
  }

  /**
   * Update member role and permissions
   */
  async updateMember(
    workspaceId: string,
    targetUserId: string,
    updaterId: string,
    tenantId: string,
    request: UpdateMemberRequest
  ): Promise<WorkspaceMember> {
    try {
      // Check updater permissions
      await this.checkMembershipPermission(workspaceId, updaterId, tenantId, 'canRemoveMembers');

      // Prevent demoting workspace owner
      const workspace = await this.getWorkspaceInfo(workspaceId, tenantId);
      if (workspace.ownerId === targetUserId && request.role && request.role !== 'owner') {
        throw this.createMembershipError('MEMBER_ACCESS_DENIED', 'Cannot change owner role');
      }

      const updates: string[] = [];
      const values: any[] = [];
      let valueIndex = 1;

      if (request.role !== undefined) {
        updates.push(`role = $${valueIndex++}`);
        values.push(request.role);
      }

      if (request.permissions !== undefined) {
        updates.push(`permissions = $${valueIndex++}`);
        values.push(JSON.stringify(request.permissions));
      }

      if (request.status !== undefined) {
        updates.push(`status = $${valueIndex++}`);
        values.push(request.status);
      }

      updates.push(`updated_at = $${valueIndex++}`);
      values.push(new Date().toISOString());

      values.push(workspaceId);
      values.push(targetUserId);

      const query = `
        UPDATE workspace_members
        SET ${updates.join(', ')}
        WHERE workspace_id = $${valueIndex++} AND user_id = $${valueIndex++}
        RETURNING *
      `;

      const result = await this.db.query(query, values);

      if (result.rows.length === 0) {
        throw this.createMembershipError('MEMBER_NOT_FOUND', 'Member not found');
      }

      // Update workspace member count if status changed
      if (request.status !== undefined) {
        await this.updateWorkspaceMemberCount(workspaceId);
      }

      this.logger.info('Member updated successfully', { workspaceId, targetUserId, updaterId });

      return this.mapDatabaseRowToMember(result.rows[0]);
    } catch (error) {
      this.logger.error('Failed to update member', { error, workspaceId, targetUserId, updaterId });
      throw error;
    }
  }

  /**
   * Remove member from workspace
   */
  async removeMember(
    workspaceId: string,
    targetUserId: string,
    removerId: string,
    tenantId: string
  ): Promise<void> {
    try {
      // Check remover permissions (unless removing self)
      if (targetUserId !== removerId) {
        await this.checkMembershipPermission(workspaceId, removerId, tenantId, 'canRemoveMembers');
      }

      // Prevent removing workspace owner
      const workspace = await this.getWorkspaceInfo(workspaceId, tenantId);
      if (workspace.ownerId === targetUserId && targetUserId !== removerId) {
        throw this.createMembershipError('MEMBER_ACCESS_DENIED', 'Cannot remove workspace owner');
      }

      const query = `
        DELETE FROM workspace_members
        WHERE workspace_id = $1 AND user_id = $2
      `;

      const result = await this.db.query(query, [workspaceId, targetUserId]);

      if (result.rowCount === 0) {
        throw this.createMembershipError('MEMBER_NOT_FOUND', 'Member not found');
      }

      // Update workspace member count
      await this.updateWorkspaceMemberCount(workspaceId);

      // End any active sessions
      await this.endMemberSessions(workspaceId, targetUserId);

      this.logger.info('Member removed successfully', { workspaceId, targetUserId, removerId });
    } catch (error) {
      this.logger.error('Failed to remove member', { error, workspaceId, targetUserId, removerId });
      throw error;
    }
  }

  /**
   * Get workspace members with pagination
   */
  async getMembers(
    workspaceId: string,
    userId: string,
    tenantId: string,
    role?: WorkspaceMemberRole,
    status?: WorkspaceMemberStatus,
    search?: string,
    limit: number = 20,
    offset: number = 0
  ): Promise<PaginatedMembers> {
    try {
      // Check access permissions
      await this.checkWorkspaceAccess(workspaceId, userId, tenantId);

      let whereClause = 'WHERE wm.workspace_id = $1';
      const values: any[] = [workspaceId];
      let valueIndex = 2;

      if (role) {
        whereClause += ` AND wm.role = $${valueIndex++}`;
        values.push(role);
      }

      if (status) {
        whereClause += ` AND wm.status = $${valueIndex++}`;
        values.push(status);
      }

      if (search) {
        whereClause += ` AND (u.name ILIKE $${valueIndex++} OR u.email ILIKE $${valueIndex++})`;
        const searchPattern = `%${search}%`;
        values.push(searchPattern);
        values.push(searchPattern);
      }

      const query = `
        SELECT wm.*, u.name, u.email, u.avatar
        FROM workspace_members wm
        LEFT JOIN users u ON wm.user_id = u.id
        ${whereClause}
        ORDER BY wm.created_at DESC
        LIMIT $${valueIndex++} OFFSET $${valueIndex++}
      `;

      values.push(limit);
      values.push(offset);

      // Get total count
      const countQuery = `
        SELECT COUNT(*) as total
        FROM workspace_members wm
        LEFT JOIN users u ON wm.user_id = u.id
        ${whereClause}
      `;

      const [dataResult, countResult] = await Promise.all([
        this.db.query(query, values),
        this.db.query(countQuery, values.slice(0, -2)) // Remove limit and offset
      ]);

      const total = parseInt(countResult.rows[0]?.total || '0');
      const members = dataResult.rows.map(row => this.mapDatabaseRowToMemberWithUser(row));

      return {
        items: members,
        total,
        limit,
        offset,
        hasMore: offset + limit < total,
      };
    } catch (error) {
      this.logger.error('Failed to get members', { error, workspaceId, userId });
      throw error;
    }
  }

  /**
   * Get single member
   */
  async getMember(
    workspaceId: string,
    userId: string
  ): Promise<WorkspaceMember | null> {
    try {
      const query = `
        SELECT * FROM workspace_members
        WHERE workspace_id = $1 AND user_id = $2
      `;

      const result = await this.db.query(query, [workspaceId, userId]);

      if (result.rows.length === 0) {
        return null;
      }

      return this.mapDatabaseRowToMember(result.rows[0]);
    } catch (error) {
      this.logger.error('Failed to get member', { error, workspaceId, userId });
      throw error;
    }
  }

  /**
   * Bulk member operations
   */
  async bulkMemberOperation(
    workspaceId: string,
    operatorId: string,
    tenantId: string,
    operation: BulkMemberOperation
  ): Promise<{ success: number; failed: number; errors: any[] }> {
    try {
      // Check operator permissions
      await this.checkMembershipPermission(workspaceId, operatorId, tenantId, 'canRemoveMembers');

      let targetUserIds: string[] = [];

      if (operation.memberIds && operation.memberIds.length > 0) {
        targetUserIds = operation.memberIds;
      }

      if (operation.emails && operation.emails.length > 0) {
        const emailUserIds = await Promise.all(
          operation.emails.map(email => this.resolveUserByEmail(email, tenantId).catch(() => null))
        );
        targetUserIds.push(...emailUserIds.filter(id => id !== null) as string[]);
      }

      const results = { success: 0, failed: 0, errors: [] as any[] };

      for (const userId of targetUserIds) {
        try {
          switch (operation.operation) {
            case 'invite':
              if (operation.role) {
                await this.inviteMember(workspaceId, operatorId, tenantId, {
                  userId,
                  role: operation.role,
                  permissions: operation.permissions,
                });
              }
              break;

            case 'remove':
              await this.removeMember(workspaceId, userId, operatorId, tenantId);
              break;

            case 'update_role':
              if (operation.role) {
                await this.updateMember(workspaceId, userId, operatorId, tenantId, {
                  role: operation.role,
                });
              }
              break;

            case 'update_permissions':
              if (operation.permissions) {
                await this.updateMember(workspaceId, userId, operatorId, tenantId, {
                  permissions: operation.permissions,
                });
              }
              break;
          }
          results.success++;
        } catch (error) {
          results.failed++;
          results.errors.push({ userId, error: error instanceof Error ? error.message : String(error) });
        }
      }

      this.logger.info('Bulk member operation completed', { 
        workspaceId, operatorId, operation: operation.operation, results 
      });

      return results;
    } catch (error) {
      this.logger.error('Failed bulk member operation', { error, workspaceId, operatorId });
      throw error;
    }
  }

  /**
   * Get member activity summary
   */
  async getMemberActivity(
    workspaceId: string,
    userId: string,
    requesterId: string,
    tenantId: string,
    days: number = 30
  ): Promise<any> {
    try {
      // Check access permissions
      await this.checkWorkspaceAccess(workspaceId, requesterId, tenantId);

      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);

      const query = `
        SELECT 
          COUNT(DISTINCT wal.id) as total_activities,
          COUNT(DISTINCT ws.id) as total_sessions,
          AVG(EXTRACT(EPOCH FROM (ws.ended_at - ws.started_at))) as avg_session_duration,
          MAX(wm.last_active_at) as last_active,
          array_agg(DISTINCT wal.action) FILTER (WHERE wal.action IS NOT NULL) as recent_actions
        FROM workspace_members wm
        LEFT JOIN workspace_activity_log wal ON wm.workspace_id = wal.workspace_id 
                                             AND wm.user_id = wal.user_id 
                                             AND wal.created_at >= $3
        LEFT JOIN workspace_sessions ws ON wm.workspace_id = ws.workspace_id 
                                        AND wm.user_id = ws.user_id 
                                        AND ws.started_at >= $3
        WHERE wm.workspace_id = $1 AND wm.user_id = $2
        GROUP BY wm.id
      `;

      const result = await this.db.query(query, [workspaceId, userId, startDate.toISOString()]);

      if (result.rows.length === 0) {
        return null;
      }

      const row = result.rows[0];
      
      return {
        userId,
        workspaceId,
        period: {
          days,
          startDate: startDate.toISOString(),
          endDate: new Date().toISOString(),
        },
        metrics: {
          totalActivities: parseInt(row.total_activities) || 0,
          totalSessions: parseInt(row.total_sessions) || 0,
          averageSessionDuration: parseFloat(row.avg_session_duration) || 0,
          lastActive: row.last_active?.toISOString(),
          recentActions: row.recent_actions || [],
        },
      };
    } catch (error) {
      this.logger.error('Failed to get member activity', { error, workspaceId, userId });
      throw error;
    }
  }

  // Private helper methods

  private async checkMembershipPermission(
    workspaceId: string,
    userId: string,
    tenantId: string,
    permission: string
  ): Promise<void> {
    const query = `
      SELECT wm.role, wm.permissions, w.owner_id
      FROM workspace_members wm
      JOIN collaborative_workspaces w ON wm.workspace_id = w.id
      WHERE wm.workspace_id = $1 AND wm.user_id = $2 AND w.tenant_id = $3 AND wm.status = 'active'
    `;

    const result = await this.db.query(query, [workspaceId, userId, tenantId]);

    if (result.rows.length === 0) {
      throw this.createMembershipError('MEMBER_ACCESS_DENIED', 'Access denied to workspace');
    }

    const row = result.rows[0];
    
    // Owners have all permissions
    if (row.owner_id === userId) {
      return;
    }

    // Check role-based permissions
    const role = row.role;
    const permissions = row.permissions || {};

    if (role === 'admin' && ['canInviteMembers', 'canRemoveMembers'].includes(permission)) {
      return;
    }

    if (permissions[permission] === true) {
      return;
    }

    throw this.createMembershipError('MEMBER_ACCESS_DENIED', `Permission denied: ${permission}`);
  }

  private async checkWorkspaceAccess(
    workspaceId: string,
    userId: string,
    tenantId: string
  ): Promise<void> {
    const query = `
      SELECT wm.status, w.visibility
      FROM collaborative_workspaces w
      LEFT JOIN workspace_members wm ON w.id = wm.workspace_id AND wm.user_id = $2
      WHERE w.id = $1 AND w.tenant_id = $3 AND w.deleted_at IS NULL
    `;

    const result = await this.db.query(query, [workspaceId, userId, tenantId]);

    if (result.rows.length === 0) {
      throw this.createMembershipError('WORKSPACE_NOT_FOUND', 'Workspace not found');
    }

    const row = result.rows[0];
    
    if (row.visibility === 'public' || row.status === 'active') {
      return;
    }

    throw this.createMembershipError('MEMBER_ACCESS_DENIED', 'Access denied to workspace');
  }

  private async checkMemberLimit(workspaceId: string): Promise<void> {
    const query = `
      SELECT w.max_members, COUNT(wm.id) as current_members
      FROM collaborative_workspaces w
      LEFT JOIN workspace_members wm ON w.id = wm.workspace_id AND wm.status = 'active'
      WHERE w.id = $1
      GROUP BY w.max_members
    `;

    const result = await this.db.query(query, [workspaceId]);

    if (result.rows.length === 0) {
      throw this.createMembershipError('WORKSPACE_NOT_FOUND', 'Workspace not found');
    }

    const row = result.rows[0];
    const currentMembers = parseInt(row.current_members) || 0;
    const maxMembers = row.max_members || 100;

    if (currentMembers >= maxMembers) {
      throw this.createMembershipError('MEMBER_LIMIT_EXCEEDED', 'Member limit exceeded for workspace');
    }
  }

  private async resolveUserByEmail(email: string, tenantId: string): Promise<string> {
    // TODO: Integrate with user service to resolve user by email
    // For now, assume user exists and return a placeholder
    const query = `SELECT id FROM users WHERE email = $1 AND tenant_id = $2`;
    const result = await this.db.query(query, [email, tenantId]);
    
    if (result.rows.length === 0) {
      throw this.createMembershipError('MEMBER_NOT_FOUND', `User not found for email: ${email}`);
    }

    return result.rows[0].id;
  }

  private async getWorkspaceInfo(workspaceId: string, tenantId: string): Promise<{ ownerId: string }> {
    const query = `
      SELECT owner_id
      FROM collaborative_workspaces
      WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL
    `;

    const result = await this.db.query(query, [workspaceId, tenantId]);

    if (result.rows.length === 0) {
      throw this.createMembershipError('WORKSPACE_NOT_FOUND', 'Workspace not found');
    }

    return { ownerId: result.rows[0].owner_id };
  }

  private async updateWorkspaceMemberCount(workspaceId: string): Promise<void> {
    const query = `
      UPDATE collaborative_workspaces
      SET current_members = (
        SELECT COUNT(*)
        FROM workspace_members
        WHERE workspace_id = $1 AND status = 'active'
      ),
      updated_at = NOW()
      WHERE id = $1
    `;

    await this.db.query(query, [workspaceId]);
  }

  private async updateMemberStatus(
    workspaceId: string,
    userId: string,
    status: WorkspaceMemberStatus,
    updaterId: string
  ): Promise<WorkspaceMember> {
    const query = `
      UPDATE workspace_members
      SET status = $1, 
          last_active_at = CASE WHEN $1 = 'active' THEN NOW() ELSE last_active_at END,
          updated_at = NOW()
      WHERE workspace_id = $2 AND user_id = $3
      RETURNING *
    `;

    const result = await this.db.query(query, [status, workspaceId, userId]);

    if (result.rows.length === 0) {
      throw this.createMembershipError('MEMBER_NOT_FOUND', 'Member not found');
    }

    // Update workspace member count
    await this.updateWorkspaceMemberCount(workspaceId);

    return this.mapDatabaseRowToMember(result.rows[0]);
  }

  private async endMemberSessions(workspaceId: string, userId: string): Promise<void> {
    const query = `
      UPDATE workspace_sessions
      SET status = 'ended', ended_at = NOW()
      WHERE workspace_id = $1 AND user_id = $2 AND status = 'active'
    `;

    await this.db.query(query, [workspaceId, userId]);
  }

  private async sendInvitationNotification(
    workspaceId: string,
    userId: string,
    inviterId: string,
    message?: string
  ): Promise<void> {
    // TODO: Implement notification service integration
    this.logger.info('Sending invitation notification', { workspaceId, userId, inviterId, message });
  }

  private getDefaultPermissions(role: WorkspaceMemberRole): any {
    const defaultPermissions = {
      owner: {
        canInviteMembers: true,
        canRemoveMembers: true,
        canEditSettings: true,
        canManageResources: true,
        canCreateContent: true,
        canDeleteContent: true,
        canManageIntegrations: true,
        canViewAnalytics: true,
        canExportData: true,
      },
      admin: {
        canInviteMembers: true,
        canRemoveMembers: true,
        canEditSettings: false,
        canManageResources: true,
        canCreateContent: true,
        canDeleteContent: true,
        canManageIntegrations: false,
        canViewAnalytics: true,
        canExportData: false,
      },
      member: {
        canInviteMembers: false,
        canRemoveMembers: false,
        canEditSettings: false,
        canManageResources: true,
        canCreateContent: true,
        canDeleteContent: false,
        canManageIntegrations: false,
        canViewAnalytics: false,
        canExportData: false,
      },
      viewer: {
        canInviteMembers: false,
        canRemoveMembers: false,
        canEditSettings: false,
        canManageResources: false,
        canCreateContent: false,
        canDeleteContent: false,
        canManageIntegrations: false,
        canViewAnalytics: false,
        canExportData: false,
      },
    };

    return defaultPermissions[role] || defaultPermissions.member;
  }

  private mapDatabaseRowToMember(row: any): WorkspaceMember {
    return {
      id: row.id,
      workspaceId: row.workspace_id,
      userId: row.user_id,
      role: row.role,
      permissions: row.permissions || {},
      invitedBy: row.invited_by,
      joinedAt: row.joined_at.toISOString(),
      status: row.status,
      lastActiveAt: row.last_active_at?.toISOString(),
      notificationSettings: row.notification_settings || {},
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
    };
  }

  private mapDatabaseRowToMemberWithUser(row: any): WorkspaceMemberWithUser {
    const member = this.mapDatabaseRowToMember(row);
    return {
      ...member,
      user: row.name ? {
        id: row.user_id,
        name: row.name,
        email: row.email,
        avatar: row.avatar,
      } : undefined,
    };
  }

  private createMembershipError(code: string, message: string, details?: any): WorkspaceError {
    const error = new Error(message) as any;
    error.code = code;
    error.details = details;
    return error;
  }
}