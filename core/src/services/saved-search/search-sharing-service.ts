import { z } from 'zod';
import { randomBytes, createHash } from 'crypto';
import type { Kysely } from 'kysely';
import {
  type SearchShare,
  type SearchSharingConfig,
  type SharedSearch,
  SearchSharingConfigSchema,
} from '../../shared/types/saved-search.js';

/**
 * Search Sharing Service
 * 
 * Handles all aspects of search collaboration including:
 * - Secure sharing with users and teams
 * - Permission management and access control
 * - Share token generation and validation
 * - Share analytics and tracking
 */
export class SearchSharingService {
  constructor(private db: Kysely<any>) {}

  /**
   * Share a search with users, teams, or generate public link
   */
  async shareSearch(
    searchId: string, 
    sharingConfig: SearchSharingConfig, 
    createdBy: string
  ): Promise<SearchShare[]> {
    const validatedConfig = SearchSharingConfigSchema.parse(sharingConfig);
    
    // Validate search ownership/permission
    await this.validateSearchSharePermission(searchId, createdBy);

    const shares: SearchShare[] = [];

    await this.db.transaction().execute(async (trx) => {
      // Share with specific users
      if (validatedConfig.sharedWithUserIds?.length) {
        for (const userId of validatedConfig.sharedWithUserIds) {
          const shareData = {
            search_id: searchId,
            shared_with_user_id: userId,
            permission_level: validatedConfig.permissionLevel,
            expires_at: validatedConfig.expiresAt,
            created_by: createdBy,
          };

          const [share] = await trx
            .insertInto('search_shares')
            .values(shareData)
            .onConflict((oc) => 
              oc.columns(['search_id', 'shared_with_user_id']).doUpdateSet({
                permission_level: validatedConfig.permissionLevel,
                expires_at: validatedConfig.expiresAt,
                created_by: createdBy,
                created_at: new Date(),
              })
            )
            .returning('*')
            .execute();

          shares.push(this.transformShareFromDb(share));
        }
      }

      // Share with teams (future functionality)
      if (validatedConfig.sharedWithTeamIds?.length) {
        for (const teamId of validatedConfig.sharedWithTeamIds) {
          const shareData = {
            search_id: searchId,
            shared_with_team_id: teamId,
            permission_level: validatedConfig.permissionLevel,
            expires_at: validatedConfig.expiresAt,
            created_by: createdBy,
          };

          const [share] = await trx
            .insertInto('search_shares')
            .values(shareData)
            .onConflict((oc) => 
              oc.columns(['search_id', 'shared_with_team_id']).doUpdateSet({
                permission_level: validatedConfig.permissionLevel,
                expires_at: validatedConfig.expiresAt,
                created_by: createdBy,
                created_at: new Date(),
              })
            )
            .returning('*')
            .execute();

          shares.push(this.transformShareFromDb(share));
        }
      }

      // Generate public share token
      if (validatedConfig.generateShareToken) {
        const shareToken = this.generateSecureToken();
        
        const shareData = {
          search_id: searchId,
          permission_level: validatedConfig.permissionLevel,
          share_token: shareToken,
          expires_at: validatedConfig.expiresAt,
          created_by: createdBy,
        };

        const [share] = await trx
          .insertInto('search_shares')
          .values(shareData)
          .returning('*')
          .execute();

        shares.push(this.transformShareFromDb(share));
      }
    });

    return shares;
  }

  /**
   * Get all searches shared with a specific user
   */
  async getSharedSearches(userId: string): Promise<SharedSearch[]> {
    const results = await this.db
      .selectFrom('search_shares')
      .innerJoin('saved_searches', 'search_shares.search_id', 'saved_searches.id')
      .leftJoin('users as shared_by_user', 'search_shares.created_by', 'shared_by_user.id')
      .select([
        'search_shares.*',
        'saved_searches.name as search_name',
        'saved_searches.description as search_description',
        'saved_searches.query_data',
        'saved_searches.owner_id',
        'saved_searches.is_public',
        'saved_searches.is_favorite',
        'saved_searches.execution_count',
        'saved_searches.last_executed_at',
        'saved_searches.tags',
        'saved_searches.metadata',
        'saved_searches.created_at as search_created_at',
        'saved_searches.updated_at as search_updated_at',
        'shared_by_user.name as shared_by_name',
        'shared_by_user.email as shared_by_email',
      ])
      .where((eb) => eb.or([
        eb('search_shares.shared_with_user_id', '=', userId),
        // Future: team membership check would go here
      ]))
      .where((eb) => eb.or([
        eb('search_shares.expires_at', 'is', null),
        eb('search_shares.expires_at', '>', new Date())
      ]))
      .orderBy('search_shares.created_at', 'desc')
      .execute();

    return results.map(row => this.transformSharedSearchFromDb(row));
  }

  /**
   * Get share details by token for public access
   */
  async getShareByToken(shareToken: string): Promise<SharedSearch | null> {
    const result = await this.db
      .selectFrom('search_shares')
      .innerJoin('saved_searches', 'search_shares.search_id', 'saved_searches.id')
      .leftJoin('users as shared_by_user', 'search_shares.created_by', 'shared_by_user.id')
      .select([
        'search_shares.*',
        'saved_searches.name as search_name',
        'saved_searches.description as search_description',
        'saved_searches.query_data',
        'saved_searches.owner_id',
        'saved_searches.is_public',
        'saved_searches.is_favorite',
        'saved_searches.execution_count',
        'saved_searches.last_executed_at',
        'saved_searches.tags',
        'saved_searches.metadata',
        'saved_searches.created_at as search_created_at',
        'saved_searches.updated_at as search_updated_at',
        'shared_by_user.name as shared_by_name',
        'shared_by_user.email as shared_by_email',
      ])
      .where('search_shares.share_token', '=', shareToken)
      .where((eb) => eb.or([
        eb('search_shares.expires_at', 'is', null),
        eb('search_shares.expires_at', '>', new Date())
      ]))
      .executeTakeFirst();

    return result ? this.transformSharedSearchFromDb(result) : null;
  }

  /**
   * Get all shares for a specific search (for the owner)
   */
  async getSearchShares(searchId: string, userId: string): Promise<SearchShare[]> {
    await this.validateSearchSharePermission(searchId, userId);

    const results = await this.db
      .selectFrom('search_shares')
      .selectAll()
      .where('search_id', '=', searchId)
      .orderBy('created_at', 'desc')
      .execute();

    return results.map(row => this.transformShareFromDb(row));
  }

  /**
   * Update share permissions
   */
  async updateSharePermissions(
    shareId: string, 
    permissionLevel: 'view' | 'edit' | 'admin',
    expiresAt: Date | undefined,
    userId: string
  ): Promise<SearchShare> {
    // Validate that user can modify this share
    const existingShare = await this.db
      .selectFrom('search_shares')
      .selectAll()
      .where('id', '=', shareId)
      .executeTakeFirst();

    if (!existingShare) {
      throw new Error('Share not found');
    }

    await this.validateSearchSharePermission(existingShare.search_id, userId);

    const [updatedShare] = await this.db
      .updateTable('search_shares')
      .set({
        permission_level: permissionLevel,
        expires_at: expiresAt,
      })
      .where('id', '=', shareId)
      .returning('*')
      .execute();

    return this.transformShareFromDb(updatedShare);
  }

  /**
   * Revoke a share (delete it)
   */
  async revokeShare(shareId: string, userId: string): Promise<void> {
    // Validate that user can modify this share
    const existingShare = await this.db
      .selectFrom('search_shares')
      .selectAll()
      .where('id', '=', shareId)
      .executeTakeFirst();

    if (!existingShare) {
      throw new Error('Share not found');
    }

    await this.validateSearchSharePermission(existingShare.search_id, userId);

    await this.db
      .deleteFrom('search_shares')
      .where('id', '=', shareId)
      .execute();
  }

  /**
   * Check if user has permission to access a shared search
   */
  async checkShareAccess(
    searchId: string, 
    userId: string,
    requiredPermission: 'view' | 'edit' | 'admin' = 'view'
  ): Promise<boolean> {
    const share = await this.db
      .selectFrom('search_shares')
      .select('permission_level')
      .where('search_id', '=', searchId)
      .where('shared_with_user_id', '=', userId)
      .where((eb) => eb.or([
        eb('expires_at', 'is', null),
        eb('expires_at', '>', new Date())
      ]))
      .executeTakeFirst();

    if (!share) {
      return false;
    }

    return this.checkPermissionLevel(share.permission_level, requiredPermission);
  }

  /**
   * Get sharing statistics for a search
   */
  async getShareStatistics(searchId: string, userId: string): Promise<{
    totalShares: number;
    activeShares: number;
    expiredShares: number;
    sharesByPermission: Record<string, number>;
    mostRecentShare: Date | null;
  }> {
    await this.validateSearchSharePermission(searchId, userId);

    const shares = await this.db
      .selectFrom('search_shares')
      .select(['permission_level', 'created_at', 'expires_at'])
      .where('search_id', '=', searchId)
      .execute();

    const now = new Date();
    const activeShares = shares.filter(s => !s.expires_at || s.expires_at > now);
    const expiredShares = shares.filter(s => s.expires_at && s.expires_at <= now);
    
    const sharesByPermission = shares.reduce((acc, share) => {
      acc[share.permission_level] = (acc[share.permission_level] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const mostRecentShare = shares.length > 0 
      ? shares.reduce((latest, share) => 
          share.created_at > latest ? share.created_at : latest, shares[0].created_at)
      : null;

    return {
      totalShares: shares.length,
      activeShares: activeShares.length,
      expiredShares: expiredShares.length,
      sharesByPermission,
      mostRecentShare,
    };
  }

  /**
   * Cleanup expired shares (maintenance task)
   */
  async cleanupExpiredShares(): Promise<number> {
    const result = await this.db
      .deleteFrom('search_shares')
      .where('expires_at', '<=', new Date())
      .returning('id')
      .execute();

    return result.length;
  }

  // ============================================================================
  // HELPER METHODS
  // ============================================================================

  private async validateSearchSharePermission(searchId: string, userId: string): Promise<void> {
    const search = await this.db
      .selectFrom('saved_searches')
      .select('owner_id')
      .where('id', '=', searchId)
      .executeTakeFirst();

    if (!search) {
      throw new Error('Search not found');
    }

    if (search.owner_id !== userId) {
      throw new Error('Only the search owner can manage shares');
    }
  }

  private checkPermissionLevel(grantedLevel: string, requiredLevel: string): boolean {
    const levels = { view: 1, edit: 2, admin: 3 };
    return levels[grantedLevel as keyof typeof levels] >= levels[requiredLevel as keyof typeof levels];
  }

  private generateSecureToken(): string {
    // Generate a secure random token
    const randomData = randomBytes(32);
    const timestamp = Date.now().toString();
    const combined = randomData.toString('hex') + timestamp;
    
    // Hash the combined data to create a consistent length token
    const hash = createHash('sha256').update(combined).digest('hex');
    
    // Return first 64 characters for a reasonable length
    return hash.substring(0, 64);
  }

  private transformShareFromDb(row: any): SearchShare {
    return {
      id: row.id,
      searchId: row.search_id,
      sharedWithUserId: row.shared_with_user_id,
      sharedWithTeamId: row.shared_with_team_id,
      permissionLevel: row.permission_level,
      shareToken: row.share_token,
      expiresAt: row.expires_at,
      createdBy: row.created_by,
      createdAt: row.created_at,
    };
  }

  private transformSharedSearchFromDb(row: any): SharedSearch {
    return {
      id: row.id,
      searchId: row.search_id,
      sharedWithUserId: row.shared_with_user_id,
      sharedWithTeamId: row.shared_with_team_id,
      permissionLevel: row.permission_level,
      shareToken: row.share_token,
      expiresAt: row.expires_at,
      createdBy: row.created_by,
      createdAt: row.created_at,
      search: {
        id: row.search_id,
        name: row.search_name,
        description: row.search_description,
        queryData: JSON.parse(row.query_data),
        ownerId: row.owner_id,
        isPublic: row.is_public,
        isFavorite: row.is_favorite,
        executionCount: row.execution_count,
        lastExecutedAt: row.last_executed_at,
        tags: row.tags || [],
        metadata: row.metadata || {},
        createdAt: row.search_created_at,
        updatedAt: row.search_updated_at,
      },
      sharedBy: row.shared_by_name ? {
        id: row.created_by,
        name: row.shared_by_name,
        email: row.shared_by_email,
      } : undefined,
    };
  }
}