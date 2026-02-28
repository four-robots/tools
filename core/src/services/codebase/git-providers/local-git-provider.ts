/**
 * Local Git Provider Implementation
 * 
 * Implements the GitProvider interface for local Git repositories.
 * Uses direct Git commands via child_process to interact with local repositories.
 */

import { exec, spawn } from 'child_process';
import { promisify } from 'util';
import { promises as fs } from 'fs';
import path from 'path';
import crypto from 'crypto';
import type { 
  GitProvider,
  RepositoryInfo,
  RepositoryTree,
  BranchInfo,
  ChangeSet,
  FileChange,
  GitProvider as GitProviderEnum
} from '../../../shared/types/repository.js';
import { detectLanguageFromExtension, isBinaryFile } from './index.js';

const execAsync = promisify(exec);

/**
 * Local Git repository provider implementation
 */
export class LocalGitProvider implements GitProvider {
  readonly name = 'Local Git';
  readonly provider = GitProviderEnum.LOCAL;

  /**
   * Get repository information from local Git repository
   */
  async getRepositoryInfo(url: string): Promise<RepositoryInfo> {
    try {
      const repoPath = this.normalizeLocalPath(url);
      
      // Verify this is a Git repository
      await this.execGit(['rev-parse', '--git-dir'], repoPath);

      // Get repository information
      const [remoteUrl, defaultBranch, lastCommit] = await Promise.all([
        this.getRemoteUrl(repoPath),
        this.getDefaultBranch(repoPath),
        this.getLastCommitDate(repoPath)
      ]);

      // Extract repository name from path or remote URL
      const name = this.extractRepositoryName(repoPath, remoteUrl);
      
      // Get repository size
      const stats = await fs.stat(repoPath);
      const sizeKb = Math.round(stats.size / 1024);

      return {
        name,
        fullName: name,
        description: undefined,
        language: await this.detectPrimaryLanguage(repoPath),
        defaultBranch,
        starsCount: 0,
        forksCount: 0,
        sizeKb,
        isPrivate: true, // Local repos are considered private
        createdAt: stats.birthtime,
        updatedAt: lastCommit
      };
    } catch (error) {
      throw new Error(`Failed to fetch local repository info: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Get repository tree with file information
   */
  async getRepositoryTree(url: string, branch: string): Promise<RepositoryTree> {
    try {
      const repoPath = this.normalizeLocalPath(url);
      
      // Get the latest commit hash for the branch
      const { stdout: commitHash } = await this.execGit(
        ['rev-parse', branch],
        repoPath
      );

      // Get all files in the repository
      const { stdout: filesOutput } = await this.execGit([
        'ls-tree', '-r', '--name-only', branch
      ], repoPath);

      const filePaths = filesOutput.trim().split('\n').filter(Boolean);
      const files = [];

      for (const filePath of filePaths) {
        try {
          // Get file hash and size
          const { stdout: fileInfo } = await this.execGit([
            'ls-tree', branch, filePath
          ], repoPath);

          const match = fileInfo.match(/^(\d+)\s+blob\s+([a-f0-9]+)\s+(.+)$/);
          if (match) {
            const [, mode, sha, path] = match;
            
            // Get file size
            let size = 0;
            try {
              const { stdout: sizeOutput } = await this.execGit([
                'cat-file', '-s', sha
              ], repoPath);
              size = parseInt(sizeOutput.trim());
            } catch (sizeError) {
              // Size not critical, continue
            }

            files.push({
              path,
              sha,
              size,
              mode
            });
          }
        } catch (fileError) {
          console.warn(`Failed to get info for file ${filePath}:`, fileError);
        }
      }

      return {
        commitHash: commitHash.trim(),
        files
      };
    } catch (error) {
      throw new Error(`Failed to fetch local repository tree: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Get all branches for the repository
   */
  async getBranches(url: string): Promise<BranchInfo[]> {
    try {
      const repoPath = this.normalizeLocalPath(url);
      
      // Get all branches
      const { stdout: branchesOutput } = await this.execGit([
        'for-each-ref', '--format=%(refname:short)|%(objectname)|%(authorname)|%(authoremail)|%(authordate:iso8601)', 'refs/heads/'
      ], repoPath);

      const branches: BranchInfo[] = [];
      const branchLines = branchesOutput.trim().split('\n').filter(Boolean);

      for (const line of branchLines) {
        const [name, commitHash, authorName, authorEmail, authorDate] = line.split('|');
        
        // Get commit message
        let commitMessage = '';
        try {
          const { stdout: messageOutput } = await this.execGit([
            'log', '-1', '--pretty=%s', commitHash
          ], repoPath);
          commitMessage = messageOutput.trim();
        } catch (messageError) {
          // Message not critical
        }

        branches.push({
          name,
          commitHash,
          commitMessage,
          authorName: authorName || undefined,
          authorEmail: authorEmail || undefined,
          lastCommitAt: authorDate ? new Date(authorDate) : undefined,
          isProtected: false // Local repos don't have branch protection
        });
      }

      return branches;
    } catch (error) {
      throw new Error(`Failed to fetch local repository branches: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Get file content from repository
   */
  async getFileContent(url: string, path: string, ref: string): Promise<string> {
    try {
      const repoPath = this.normalizeLocalPath(url);
      
      const { stdout: content } = await this.execGit([
        'show', `${ref}:${path}`
      ], repoPath);

      return content;
    } catch (error) {
      if (error instanceof Error ? error.message : String(error).includes('does not exist')) {
        throw new Error(`File not found: ${path}`);
      }
      throw new Error(`Failed to fetch file content: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Get changes since a specific commit
   */
  async getChangesSince(url: string, branch: string, since: string): Promise<ChangeSet> {
    try {
      const repoPath = this.normalizeLocalPath(url);
      
      // Get the latest commit hash
      const { stdout: latestCommit } = await this.execGit([
        'rev-parse', branch
      ], repoPath);

      // Get changed files between commits
      const { stdout: diffOutput } = await this.execGit([
        'diff', '--name-status', since, branch
      ], repoPath);

      const fileChanges: FileChange[] = [];
      const diffLines = diffOutput.trim().split('\n').filter(Boolean);

      for (const line of diffLines) {
        const [status, ...pathParts] = line.split('\t');
        const filePath = pathParts.join('\t');
        
        let changeType: 'added' | 'modified' | 'deleted';
        if (status === 'A') {
          changeType = 'added';
        } else if (status === 'D') {
          changeType = 'deleted';
        } else {
          changeType = 'modified';
        }

        fileChanges.push({
          path: filePath,
          changeType
        });
      }

      return {
        latestCommit: latestCommit.trim(),
        files: fileChanges
      };
    } catch (error) {
      throw new Error(`Failed to fetch local changes since ${since}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Webhooks are not supported for local repositories
   */
  supportsWebhooks(): boolean {
    return false;
  }

  /**
   * No webhook data to parse for local repositories
   */
  parseWebhookData(data: any): FileChange[] {
    return [];
  }

  /**
   * Validate access to local repository
   */
  async validateAccess(url: string): Promise<boolean> {
    try {
      const repoPath = this.normalizeLocalPath(url);
      await this.execGit(['rev-parse', '--git-dir'], repoPath);
      return true;
    } catch (error) {
      return false;
    }
  }

  // ===================
  // HELPER METHODS
  // ===================

  /**
   * Execute Git command in the specified directory
   */
  private async execGit(args: string[], cwd: string): Promise<{ stdout: string; stderr: string }> {
    try {
      return await execAsync(`git ${args.join(' ')}`, { cwd });
    } catch (error) {
      throw new Error(`Git command failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Normalize local path from URL
   */
  private normalizeLocalPath(url: string): string {
    if (url.startsWith('file://')) {
      return url.replace('file://', '');
    }
    
    if (path.isAbsolute(url)) {
      return url;
    }
    
    return path.resolve(url);
  }

  /**
   * Get remote URL for local repository
   */
  private async getRemoteUrl(repoPath: string): Promise<string | undefined> {
    try {
      const { stdout } = await this.execGit(['remote', 'get-url', 'origin'], repoPath);
      return stdout.trim();
    } catch (error) {
      return undefined;
    }
  }

  /**
   * Get default branch for repository
   */
  private async getDefaultBranch(repoPath: string): Promise<string> {
    try {
      const { stdout } = await this.execGit(['symbolic-ref', 'refs/remotes/origin/HEAD'], repoPath);
      return stdout.trim().replace('refs/remotes/origin/', '');
    } catch (error) {
      // Fallback to common branch names
      const commonBranches = ['main', 'master', 'develop'];
      for (const branch of commonBranches) {
        try {
          await this.execGit(['rev-parse', '--verify', branch], repoPath);
          return branch;
        } catch (branchError) {
          continue;
        }
      }
      return 'main';
    }
  }

  /**
   * Get last commit date
   */
  private async getLastCommitDate(repoPath: string): Promise<Date> {
    try {
      const { stdout } = await this.execGit(['log', '-1', '--format=%ci'], repoPath);
      return new Date(stdout.trim());
    } catch (error) {
      return new Date();
    }
  }

  /**
   * Extract repository name from path or remote URL
   */
  private extractRepositoryName(repoPath: string, remoteUrl?: string): string {
    if (remoteUrl) {
      const match = remoteUrl.match(/\/([^\/]+?)(?:\.git)?$/);
      if (match) {
        return match[1];
      }
    }
    
    return path.basename(repoPath);
  }

  /**
   * Detect primary language in repository
   */
  private async detectPrimaryLanguage(repoPath: string): Promise<string | undefined> {
    try {
      // Get file extensions and count
      const { stdout: filesOutput } = await this.execGit([
        'ls-tree', '-r', '--name-only', 'HEAD'
      ], repoPath);

      const files = filesOutput.trim().split('\n').filter(Boolean);
      const languageCount: Record<string, number> = {};

      for (const file of files) {
        const language = detectLanguageFromExtension(file);
        if (language) {
          languageCount[language] = (languageCount[language] || 0) + 1;
        }
      }

      // Return the most common language
      const languages = Object.entries(languageCount);
      if (languages.length > 0) {
        languages.sort((a, b) => b[1] - a[1]);
        return languages[0][0];
      }
    } catch (error) {
      // Not critical, continue
    }
    
    return undefined;
  }
}