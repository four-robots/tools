/**
 * GitLab Provider Implementation
 * 
 * Implements the GitProvider interface for GitLab repositories.
 * Supports both GitLab.com and self-hosted GitLab instances.
 */

import { Gitlab } from '@gitbeaker/rest';
import type { 
  GitProvider,
  RepositoryInfo,
  RepositoryTree,
  BranchInfo,
  ChangeSet,
  FileChange,
  GitProvider as GitProviderEnum
} from '../../../shared/types/repository.js';
import { parseGitLabUrl, detectLanguageFromExtension, isBinaryFile } from './index.js';

/**
 * GitLab API provider implementation
 */
export class GitLabProvider implements GitProvider {
  readonly name = 'GitLab';
  readonly provider = GitProviderEnum.GITLAB;
  
  private readonly gitlab: InstanceType<typeof Gitlab>;
  private readonly accessToken?: string;
  private readonly baseUrl?: string;

  constructor(accessToken?: string, baseUrl?: string) {
    this.accessToken = accessToken;
    this.baseUrl = baseUrl;
    
    this.gitlab = new Gitlab({
      token: accessToken,
      host: baseUrl || 'https://gitlab.com'
    });
  }

  /**
   * Get repository information from GitLab
   */
  async getRepositoryInfo(url: string): Promise<RepositoryInfo> {
    try {
      const { projectPath } = parseGitLabUrl(url);
      const project = await this.gitlab.Projects.show(encodeURIComponent(projectPath));

      return {
        name: project.name,
        fullName: project.path_with_namespace,
        description: project.description || undefined,
        language: project.default_language || undefined,
        defaultBranch: project.default_branch || 'main',
        starsCount: project.star_count || 0,
        forksCount: project.forks_count || 0,
        sizeKb: Math.round((project.statistics?.repository_size || 0) / 1024),
        isPrivate: project.visibility === 'private',
        createdAt: new Date(project.created_at),
        updatedAt: new Date(project.last_activity_at)
      };
    } catch (error) {
      if (error instanceof Error && 'response' in error) {
        const httpError = error as any;
        if (httpError.response?.status === 404) {
          throw new Error(`GitLab repository not found: ${url}`);
        }
        if (httpError.response?.status === 403) {
          throw new Error(`Access denied to GitLab repository: ${url}. Check authentication token.`);
        }
      }
      throw new Error(`Failed to fetch GitLab repository info: ${error.message}`);
    }
  }

  /**
   * Get repository tree with file information
   */
  async getRepositoryTree(url: string, branch: string): Promise<RepositoryTree> {
    try {
      const { projectPath } = parseGitLabUrl(url);
      const projectId = encodeURIComponent(projectPath);

      // Get the latest commit for the branch
      const commits = await this.gitlab.Commits.all(projectId, { 
        ref_name: branch,
        per_page: 1 
      });
      
      if (!commits.length) {
        throw new Error(`No commits found for branch ${branch}`);
      }

      const commitHash = commits[0].id;

      // Get repository tree recursively
      const tree = await this.gitlab.Repositories.allRepositoryTrees(projectId, {
        ref: branch,
        recursive: true,
        per_page: 10000 // GitLab's maximum
      });

      // Filter to only include blob (file) entries
      const files = tree
        .filter(item => item.type === 'blob' && item.path)
        .map(item => ({
          path: item.path!,
          sha: item.id || '', // GitLab uses 'id' for blob SHA
          size: 0, // GitLab tree API doesn't provide size
          mode: item.mode || '100644'
        }));

      return {
        commitHash,
        files
      };
    } catch (error) {
      throw new Error(`Failed to fetch GitLab repository tree: ${error.message}`);
    }
  }

  /**
   * Get all branches for the repository
   */
  async getBranches(url: string): Promise<BranchInfo[]> {
    try {
      const { projectPath } = parseGitLabUrl(url);
      const projectId = encodeURIComponent(projectPath);
      
      // Get all branches
      const branches = await this.gitlab.Branches.all(projectId);

      return branches.map(branch => ({
        name: branch.name,
        commitHash: branch.commit.id,
        commitMessage: branch.commit.message,
        authorName: branch.commit.author_name,
        authorEmail: branch.commit.author_email,
        lastCommitAt: branch.commit.committed_date ? new Date(branch.commit.committed_date) : undefined,
        isProtected: branch.protected || false
      }));
    } catch (error) {
      throw new Error(`Failed to fetch GitLab repository branches: ${error.message}`);
    }
  }

  /**
   * Get file content from repository
   */
  async getFileContent(url: string, path: string, ref: string): Promise<string> {
    try {
      const { projectPath } = parseGitLabUrl(url);
      const projectId = encodeURIComponent(projectPath);
      
      const file = await this.gitlab.RepositoryFiles.show(
        projectId, 
        encodeURIComponent(path), 
        ref
      );

      if (file.encoding === 'base64' && file.content) {
        return Buffer.from(file.content, 'base64').toString('utf-8');
      }

      return file.content || '';
    } catch (error) {
      if (error instanceof Error && 'response' in error) {
        const httpError = error as any;
        if (httpError.response?.status === 404) {
          throw new Error(`File not found: ${path}`);
        }
      }
      throw new Error(`Failed to fetch file content: ${error.message}`);
    }
  }

  /**
   * Get changes since a specific commit
   */
  async getChangesSince(url: string, branch: string, since: string): Promise<ChangeSet> {
    try {
      const { projectPath } = parseGitLabUrl(url);
      const projectId = encodeURIComponent(projectPath);
      
      // Get commits since the specified commit
      const commits = await this.gitlab.Commits.all(projectId, {
        ref_name: branch,
        since: new Date(since).toISOString(),
        per_page: 100
      });

      const fileChanges = new Map<string, FileChange>();
      
      // Process each commit to get file changes
      for (const commit of commits) {
        if (commit.id === since) continue;
        
        try {
          const commitDiff = await this.gitlab.Commits.diff(projectId, commit.id);
          
          for (const diff of commitDiff) {
            let changeType: 'added' | 'modified' | 'deleted';
            
            if (diff.new_file) {
              changeType = 'added';
            } else if (diff.deleted_file) {
              changeType = 'deleted';
            } else {
              changeType = 'modified';
            }

            const path = diff.new_path || diff.old_path;
            if (path) {
              fileChanges.set(path, {
                path,
                changeType
              });
            }
          }
        } catch (diffError) {
          console.warn(`Failed to fetch commit diff for ${commit.id}:`, diffError);
        }
      }

      return {
        latestCommit: commits[0]?.id || branch,
        files: Array.from(fileChanges.values())
      };
    } catch (error) {
      throw new Error(`Failed to fetch GitLab changes since ${since}: ${error.message}`);
    }
  }

  /**
   * Check if webhooks are supported (true for GitLab)
   */
  supportsWebhooks(): boolean {
    return true;
  }

  /**
   * Parse GitLab webhook payload to extract file changes
   */
  parseWebhookData(data: any): FileChange[] {
    try {
      if (data.object_kind === 'push' && data.commits) {
        const fileChanges = new Map<string, FileChange>();
        
        for (const commit of data.commits) {
          // Process added files
          if (commit.added && Array.isArray(commit.added)) {
            for (const path of commit.added) {
              fileChanges.set(path, {
                path,
                changeType: 'added'
              });
            }
          }

          // Process modified files
          if (commit.modified && Array.isArray(commit.modified)) {
            for (const path of commit.modified) {
              fileChanges.set(path, {
                path,
                changeType: 'modified'
              });
            }
          }

          // Process removed files
          if (commit.removed && Array.isArray(commit.removed)) {
            for (const path of commit.removed) {
              fileChanges.set(path, {
                path,
                changeType: 'deleted'
              });
            }
          }
        }

        return Array.from(fileChanges.values());
      }

      return [];
    } catch (error) {
      console.warn('Failed to parse GitLab webhook data:', error);
      return [];
    }
  }

  /**
   * Validate access to repository
   */
  async validateAccess(url: string): Promise<boolean> {
    try {
      await this.getRepositoryInfo(url);
      return true;
    } catch (error) {
      return false;
    }
  }

  // ===================
  // WEBHOOK MANAGEMENT
  // ===================

  /**
   * Create a webhook for the repository
   */
  async createWebhook(url: string, webhookUrl: string, secret: string, events: string[] = ['push']): Promise<string> {
    try {
      const { projectPath } = parseGitLabUrl(url);
      const projectId = encodeURIComponent(projectPath);
      
      // Convert generic events to GitLab-specific events
      const gitlabEvents = this.convertEventsToGitLab(events);
      
      const webhook = await this.gitlab.ProjectHooks.add(projectId, webhookUrl, {
        token: secret,
        ...gitlabEvents
      });

      return webhook.id.toString();
    } catch (error) {
      throw new Error(`Failed to create GitLab webhook: ${error.message}`);
    }
  }

  /**
   * Delete a webhook
   */
  async deleteWebhook(url: string, webhookId: string): Promise<void> {
    try {
      const { projectPath } = parseGitLabUrl(url);
      const projectId = encodeURIComponent(projectPath);
      
      await this.gitlab.ProjectHooks.remove(projectId, parseInt(webhookId));
    } catch (error) {
      throw new Error(`Failed to delete GitLab webhook: ${error.message}`);
    }
  }

  /**
   * Convert generic events to GitLab webhook events
   */
  private convertEventsToGitLab(events: string[]): Record<string, boolean> {
    const gitlabEvents: Record<string, boolean> = {};
    
    for (const event of events) {
      switch (event) {
        case 'push':
          gitlabEvents.push_events = true;
          break;
        case 'pull_request':
          gitlabEvents.merge_requests_events = true;
          break;
        case 'issues':
          gitlabEvents.issues_events = true;
          break;
        case 'tag':
          gitlabEvents.tag_push_events = true;
          break;
        default:
          console.warn(`Unknown GitLab webhook event: ${event}`);
      }
    }
    
    return gitlabEvents;
  }
}