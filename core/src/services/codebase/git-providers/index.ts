/**
 * Git Provider Abstraction
 * 
 * Provides a unified interface for interacting with different Git providers
 * (GitHub, GitLab, Bitbucket, local Git repositories).
 * 
 * Key Features:
 * - Unified API across all Git providers
 * - Repository information retrieval
 * - File content and tree operations
 * - Branch management
 * - Change detection for incremental sync
 * - Webhook support and parsing
 */

import type { 
  RepositoryInfo, 
  RepositoryTree, 
  BranchInfo, 
  ChangeSet, 
  FileChange,
  GitProvider as GitProviderEnum
} from '../../../shared/types/repository.js';

// ===================
// PROVIDER INTERFACE
// ===================

/**
 * Unified Git provider interface
 */
export interface GitProvider {
  readonly name: string;
  readonly provider: GitProviderEnum;
  
  // Repository operations
  getRepositoryInfo(url: string): Promise<RepositoryInfo>;
  getRepositoryTree(url: string, branch: string): Promise<RepositoryTree>;
  getBranches(url: string): Promise<BranchInfo[]>;
  getFileContent(url: string, path: string, ref: string): Promise<string>;
  
  // Change detection
  getChangesSince(url: string, branch: string, since: string): Promise<ChangeSet>;
  
  // Webhook support
  supportsWebhooks(): boolean;
  parseWebhookData(data: any): FileChange[];
  
  // Authentication and validation
  validateAccess(url: string): Promise<boolean>;
}

// ===================
// PROVIDER FACTORY
// ===================

/**
 * Factory for creating Git provider instances
 */
export class GitProviderFactory {
  private static instance: GitProviderFactory;
  
  public static getInstance(): GitProviderFactory {
    if (!GitProviderFactory.instance) {
      GitProviderFactory.instance = new GitProviderFactory();
    }
    return GitProviderFactory.instance;
  }

  /**
   * Create a provider instance for the specified provider type
   */
  createProvider(provider: GitProviderEnum | string, accessToken?: string): GitProvider {
    const providerType = typeof provider === 'string' ? provider.toLowerCase() : provider;
    
    switch (providerType) {
      case GitProviderEnum.GITHUB:
      case 'github':
        return new GitHubProvider(accessToken);
        
      case GitProviderEnum.GITLAB:
      case 'gitlab':
        return new GitLabProvider(accessToken);
        
      case GitProviderEnum.BITBUCKET:
      case 'bitbucket':
        return new BitbucketProvider(accessToken);
        
      case GitProviderEnum.LOCAL:
      case 'local':
        return new LocalGitProvider();
        
      default:
        throw new Error(`Unsupported git provider: ${provider}`);
    }
  }

  /**
   * Detect provider from repository URL
   */
  detectProvider(url: string): GitProviderEnum {
    const normalizedUrl = url.toLowerCase();
    
    if (normalizedUrl.includes('github.com')) {
      return GitProviderEnum.GITHUB;
    }
    
    if (normalizedUrl.includes('gitlab.com') || normalizedUrl.includes('gitlab')) {
      return GitProviderEnum.GITLAB;
    }
    
    if (normalizedUrl.includes('bitbucket.org') || normalizedUrl.includes('bitbucket')) {
      return GitProviderEnum.BITBUCKET;
    }
    
    // Default to local for file:// URLs or unrecognized patterns
    return GitProviderEnum.LOCAL;
  }

  /**
   * Create provider instance from repository URL
   */
  createProviderFromUrl(url: string, accessToken?: string): GitProvider {
    const provider = this.detectProvider(url);
    return this.createProvider(provider, accessToken);
  }
}

// ===================
// PROVIDER IMPLEMENTATIONS
// ===================

// Import provider implementations
export { GitHubProvider } from './github-provider.js';
export { GitLabProvider } from './gitlab-provider.js';
export { BitbucketProvider } from './bitbucket-provider.js';
export { LocalGitProvider } from './local-git-provider.js';

// ===================
// UTILITY FUNCTIONS
// ===================

/**
 * Parse GitHub URL to extract owner and repo
 */
export function parseGitHubUrl(url: string): { owner: string; repo: string } {
  const patterns = [
    /github\.com\/([^\/]+)\/([^\/\.]+)/i,
    /github\.com\/([^\/]+)\/([^\/]+)\.git/i
  ];
  
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) {
      return { owner: match[1], repo: match[2] };
    }
  }
  
  throw new Error(`Invalid GitHub URL: ${url}`);
}

/**
 * Parse GitLab URL to extract project path
 */
export function parseGitLabUrl(url: string): { projectPath: string; baseUrl?: string } {
  // Handle gitlab.com URLs
  const gitlabComMatch = url.match(/gitlab\.com\/([^\/]+\/[^\/\.]+)/i);
  if (gitlabComMatch) {
    return { projectPath: gitlabComMatch[1] };
  }
  
  // Handle self-hosted GitLab URLs
  const selfHostedMatch = url.match(/(https?:\/\/[^\/]+)\/([^\/]+\/[^\/\.]+)/i);
  if (selfHostedMatch) {
    return { 
      projectPath: selfHostedMatch[2], 
      baseUrl: selfHostedMatch[1]
    };
  }
  
  throw new Error(`Invalid GitLab URL: ${url}`);
}

/**
 * Parse Bitbucket URL to extract workspace and repo
 */
export function parseBitbucketUrl(url: string): { workspace: string; repo: string } {
  const patterns = [
    /bitbucket\.org\/([^\/]+)\/([^\/\.]+)/i,
    /bitbucket\.org\/([^\/]+)\/([^\/]+)\.git/i
  ];
  
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) {
      return { workspace: match[1], repo: match[2] };
    }
  }
  
  throw new Error(`Invalid Bitbucket URL: ${url}`);
}

/**
 * Normalize repository URL for consistent processing
 */
export function normalizeRepositoryUrl(url: string): string {
  // Remove .git suffix if present
  let normalized = url.replace(/\.git$/, '');
  
  // Ensure https:// prefix for web URLs
  if (normalized.startsWith('git@')) {
    // Convert SSH to HTTPS
    normalized = normalized
      .replace('git@github.com:', 'https://github.com/')
      .replace('git@gitlab.com:', 'https://gitlab.com/')
      .replace('git@bitbucket.org:', 'https://bitbucket.org/');
  }
  
  return normalized;
}

/**
 * Extract file extension and determine language
 */
export function detectLanguageFromExtension(filename: string): string | undefined {
  const extension = filename.split('.').pop()?.toLowerCase();
  
  const languageMap: Record<string, string> = {
    'js': 'javascript',
    'jsx': 'javascript',
    'ts': 'typescript', 
    'tsx': 'typescript',
    'py': 'python',
    'rb': 'ruby',
    'php': 'php',
    'java': 'java',
    'cs': 'csharp',
    'cpp': 'cpp',
    'c': 'c',
    'go': 'go',
    'rs': 'rust',
    'kt': 'kotlin',
    'swift': 'swift',
    'scala': 'scala',
    'sh': 'shell',
    'bash': 'shell',
    'ps1': 'powershell',
    'sql': 'sql',
    'md': 'markdown',
    'json': 'json',
    'xml': 'xml',
    'html': 'html',
    'css': 'css',
    'scss': 'scss',
    'sass': 'sass',
    'less': 'less',
    'yml': 'yaml',
    'yaml': 'yaml'
  };
  
  return extension ? languageMap[extension] : undefined;
}

/**
 * Check if file is binary based on extension
 */
export function isBinaryFile(filename: string): boolean {
  const extension = filename.split('.').pop()?.toLowerCase();
  
  const binaryExtensions = new Set([
    'jpg', 'jpeg', 'png', 'gif', 'bmp', 'svg', 'ico',
    'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx',
    'zip', 'tar', 'gz', 'rar', '7z',
    'exe', 'dll', 'so', 'dylib',
    'mp4', 'avi', 'mov', 'wmv', 'flv',
    'mp3', 'wav', 'flac', 'aac',
    'ttf', 'otf', 'woff', 'woff2',
    'bin', 'dat', 'db'
  ]);
  
  return extension ? binaryExtensions.has(extension) : false;
}