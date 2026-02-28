/**
 * GitHub Provider Implementation
 * 
 * Implements the GitProvider interface for GitHub repositories.
 * Provides comprehensive GitHub API integration with proper error handling,
 * rate limiting, and authentication support.
 */

import { Octokit } from '@octokit/rest';
import { throttling } from '@octokit/plugin-throttling';
import type { 
  GitProvider,
  RepositoryInfo,
  RepositoryTree,
  BranchInfo,
  ChangeSet,
  FileChange,
  GitProvider as GitProviderEnum
} from '../../../shared/types/repository.js';
import { parseGitHubUrl, detectLanguageFromExtension, isBinaryFile } from './index.js';

// Create Octokit with throttling plugin
const ThrottledOctokit = Octokit.plugin(throttling);

/**
 * GitHub API provider implementation
 */
export class GitHubProvider implements GitProvider {
  readonly name = 'GitHub';
  readonly provider = GitProviderEnum.GITHUB;
  
  private readonly octokit: InstanceType<typeof ThrottledOctokit>;
  private readonly accessToken?: string;

  constructor(accessToken?: string) {
    this.accessToken = accessToken;
    
    this.octokit = new ThrottledOctokit({
      auth: accessToken,
      throttle: {
        onRateLimit: (retryAfter: number, options: any) => {
          console.warn(`GitHub API rate limit exceeded. Retrying after ${retryAfter} seconds`);
          return true; // Retry once
        },
        onAbuseLimit: (retryAfter: number, options: any) => {
          console.warn(`GitHub API abuse limit exceeded. Retrying after ${retryAfter} seconds`);
          return true; // Retry once
        }
      }
    });
  }

  /**
   * Get comprehensive repository information from GitHub
   */
  async getRepositoryInfo(url: string): Promise<RepositoryInfo> {
    try {
      const { owner, repo } = parseGitHubUrl(url);
      const { data } = await this.octokit.rest.repos.get({ 
        owner, 
        repo 
      });

      return {
        name: data.name,
        fullName: data.full_name,
        description: data.description || undefined,
        language: data.language || undefined,
        defaultBranch: data.default_branch,
        starsCount: data.stargazers_count,
        forksCount: data.forks_count,
        sizeKb: data.size,
        isPrivate: data.private,
        createdAt: new Date(data.created_at),
        updatedAt: new Date(data.updated_at)
      };
    } catch (error) {
      if (error instanceof Error && 'status' in error) {
        const httpError = error as any;
        if (httpError.status === 404) {
          throw new Error(`Repository not found: ${url}`);
        }
        if (httpError.status === 403) {
          throw new Error(`Access denied to repository: ${url}. Check authentication token.`);
        }
      }
      throw new Error(`Failed to fetch repository info: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Get complete repository tree with file information
   */
  async getRepositoryTree(url: string, branch: string): Promise<RepositoryTree> {
    try {
      const { owner, repo } = parseGitHubUrl(url);
      
      // First get the latest commit for the branch
      const { data: commit } = await this.octokit.rest.repos.getCommit({
        owner,
        repo,
        ref: branch
      });

      // Get the complete tree recursively
      const { data: tree } = await this.octokit.rest.git.getTree({
        owner,
        repo,
        tree_sha: commit.commit.tree.sha,
        recursive: 'true'
      });

      // Filter to only include blob (file) entries
      const files = tree.tree
        .filter(item => item.type === 'blob' && item.path && item.sha)
        .map(item => ({
          path: item.path!,
          sha: item.sha!,
          size: item.size || 0,
          mode: item.mode!
        }));

      return {
        commitHash: commit.sha,
        files
      };
    } catch (error) {
      throw new Error(`Failed to fetch repository tree: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Get all branches for the repository
   */
  async getBranches(url: string): Promise<BranchInfo[]> {
    try {
      const { owner, repo } = parseGitHubUrl(url);
      
      // Get all branches (paginated)
      const branches = await this.octokit.paginate(
        this.octokit.rest.repos.listBranches,
        { owner, repo }
      );

      // Get repository info to determine default branch
      const { data: repoData } = await this.octokit.rest.repos.get({ owner, repo });

      return Promise.all(branches.map(async (branch) => {
        try {
          // Get commit details for each branch
          const { data: commit } = await this.octokit.rest.repos.getCommit({
            owner,
            repo,
            ref: branch.commit.sha
          });

          return {
            name: branch.name,
            commitHash: branch.commit.sha,
            commitMessage: commit.commit.message,
            authorName: commit.commit.author?.name,
            authorEmail: commit.commit.author?.email,
            lastCommitAt: commit.commit.author?.date ? new Date(commit.commit.author.date) : undefined,
            isProtected: branch.protected
          };
        } catch (error) {
          // If we can't get commit details, return basic info
          return {
            name: branch.name,
            commitHash: branch.commit.sha,
            isProtected: branch.protected
          };
        }
      }));
    } catch (error) {
      throw new Error(`Failed to fetch repository branches: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Get file content from repository
   */
  async getFileContent(url: string, path: string, ref: string): Promise<string> {
    try {
      const { owner, repo } = parseGitHubUrl(url);
      
      const { data } = await this.octokit.rest.repos.getContent({
        owner,
        repo,
        path,
        ref
      });

      if (Array.isArray(data) || data.type !== 'file') {
        throw new Error(`Path is not a file: ${path}`);
      }

      if (data.encoding === 'base64' && data.content) {
        return Buffer.from(data.content, 'base64').toString('utf-8');
      }

      throw new Error(`Unable to decode file content for: ${path}`);
    } catch (error) {
      if (error instanceof Error && 'status' in error) {
        const httpError = error as any;
        if (httpError.status === 404) {
          throw new Error(`File not found: ${path}`);
        }
      }
      throw new Error(`Failed to fetch file content: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Get changes since a specific commit
   */
  async getChangesSince(url: string, branch: string, since: string): Promise<ChangeSet> {
    try {
      const { owner, repo } = parseGitHubUrl(url);
      
      // Get commits since the specified commit
      const { data: comparison } = await this.octokit.rest.repos.compareCommits({
        owner,
        repo,
        base: since,
        head: branch
      });

      // Extract file changes from commits
      const fileChanges = new Map<string, FileChange>();
      
      for (const commit of comparison.commits) {
        if (commit.sha === since) continue; // Skip the base commit
        
        // Get detailed commit info to access files
        try {
          const { data: commitDetails } = await this.octokit.rest.repos.getCommit({
            owner,
            repo,
            ref: commit.sha
          });

          if (commitDetails.files) {
            for (const file of commitDetails.files) {
              // Determine change type
              let changeType: 'added' | 'modified' | 'deleted';
              if (file.status === 'added') {
                changeType = 'added';
              } else if (file.status === 'removed') {
                changeType = 'deleted';
              } else {
                changeType = 'modified';
              }

              fileChanges.set(file.filename, {
                path: file.filename,
                changeType,
                sha: file.sha || undefined
              });
            }
          }
        } catch (commitError) {
          console.warn(`Failed to fetch commit details for ${commit.sha}:`, commitError);
        }
      }

      return {
        latestCommit: comparison.commits[comparison.commits.length - 1]?.sha || branch,
        files: Array.from(fileChanges.values())
      };
    } catch (error) {
      throw new Error(`Failed to fetch changes since ${since}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Check if webhooks are supported (true for GitHub)
   */
  supportsWebhooks(): boolean {
    return true;
  }

  /**
   * Parse GitHub webhook payload to extract file changes
   */
  parseWebhookData(data: any): FileChange[] {
    try {
      // Handle push events
      if (data.zen || data.hook_id) {
        // This is a ping event, no file changes
        return [];
      }

      if (data.commits && Array.isArray(data.commits)) {
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
      console.warn('Failed to parse GitHub webhook data:', error);
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
      const { owner, repo } = parseGitHubUrl(url);
      
      const { data: webhook } = await this.octokit.rest.repos.createWebhook({
        owner,
        repo,
        config: {
          url: webhookUrl,
          content_type: 'json',
          secret,
          insecure_ssl: '0'
        },
        events,
        active: true
      });

      return webhook.id.toString();
    } catch (error) {
      throw new Error(`Failed to create GitHub webhook: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Delete a webhook
   */
  async deleteWebhook(url: string, webhookId: string): Promise<void> {
    try {
      const { owner, repo } = parseGitHubUrl(url);
      
      await this.octokit.rest.repos.deleteWebhook({
        owner,
        repo,
        hook_id: parseInt(webhookId)
      });
    } catch (error) {
      throw new Error(`Failed to delete GitHub webhook: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * List webhooks for repository
   */
  async listWebhooks(url: string): Promise<any[]> {
    try {
      const { owner, repo } = parseGitHubUrl(url);
      
      const { data: webhooks } = await this.octokit.rest.repos.listWebhooks({
        owner,
        repo
      });

      return webhooks;
    } catch (error) {
      throw new Error(`Failed to list GitHub webhooks: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}