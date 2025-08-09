/**
 * Package Documentation Fetchers
 * 
 * Specialized fetchers for discovering and analyzing API documentation
 * from different package ecosystems (npm, PyPI, docs.rs, etc.)
 */

import type {
  PackageDependency,
  DiscoveredAPIDoc,
  APIDocumentationMetadata,
  DocumentationHealth,
  APIDiscoveryError
} from '../../shared/types/api-documentation.js';

interface FetchOptions {
  timeout?: number;
  retries?: number;
  userAgent?: string;
  rateLimit?: {
    requestsPerSecond: number;
    burstLimit: number;
  };
}

interface DocumentationFetchResult {
  success: boolean;
  documentation?: DiscoveredAPIDoc;
  error?: APIDiscoveryError;
}

/**
 * Rate limiter for external API calls
 */
class RateLimiter {
  private requests: number[] = [];
  private readonly windowMs = 1000;

  constructor(
    private requestsPerSecond: number = 10,
    private burstLimit: number = 20
  ) {}

  async waitForSlot(): Promise<void> {
    const now = Date.now();
    
    // Remove old requests outside the window
    this.requests = this.requests.filter(time => now - time < this.windowMs);
    
    // Check if we're within limits
    if (this.requests.length < this.requestsPerSecond) {
      this.requests.push(now);
      return;
    }

    // Wait for the next available slot
    const oldestRequest = Math.min(...this.requests);
    const waitTime = this.windowMs - (now - oldestRequest);
    await new Promise(resolve => setTimeout(resolve, Math.max(waitTime, 50)));
    
    // Retry
    return this.waitForSlot();
  }
}

/**
 * HTTP client with retry logic and rate limiting
 */
class HTTPClient {
  private rateLimiter: RateLimiter;

  constructor(private options: FetchOptions = {}) {
    this.rateLimiter = new RateLimiter(
      options.rateLimit?.requestsPerSecond || 5,
      options.rateLimit?.burstLimit || 10
    );
  }

  async fetch(url: string, options: RequestInit = {}): Promise<Response> {
    await this.rateLimiter.waitForSlot();
    
    const retries = this.options.retries || 3;
    const timeout = this.options.timeout || 10000;
    
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeout);

        const response = await fetch(url, {
          ...options,
          headers: {
            'User-Agent': this.options.userAgent || 'API Documentation Discovery Service/1.0',
            ...options.headers
          },
          signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (response.ok) {
          return response;
        }

        // Don't retry 4xx errors (except 429)
        if (response.status >= 400 && response.status < 500 && response.status !== 429) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        // Exponential backoff for retryable errors
        if (attempt < retries) {
          const backoffMs = Math.min(1000 * Math.pow(2, attempt - 1), 10000);
          await new Promise(resolve => setTimeout(resolve, backoffMs));
        }

      } catch (error) {
        if (attempt === retries) {
          throw error;
        }
        
        // Wait before retry
        const backoffMs = Math.min(1000 * Math.pow(2, attempt - 1), 10000);
        await new Promise(resolve => setTimeout(resolve, backoffMs));
      }
    }

    throw new Error(`Failed to fetch ${url} after ${retries} attempts`);
  }

  async fetchJson<T>(url: string): Promise<T> {
    const response = await this.fetch(url);
    return await response.json();
  }

  async fetchText(url: string): Promise<string> {
    const response = await this.fetch(url);
    return await response.text();
  }
}

/**
 * Base class for package documentation fetchers
 */
abstract class DocumentationFetcher {
  protected httpClient: HTTPClient;

  constructor(protected options: FetchOptions = {}) {
    this.httpClient = new HTTPClient(options);
  }

  abstract fetchDocumentation(dependency: PackageDependency): Promise<DocumentationFetchResult>;

  protected createError(code: string, message: string, packageName?: string): APIDiscoveryError {
    return {
      code,
      message,
      package_name: packageName,
      timestamp: new Date().toISOString()
    };
  }

  protected calculateHealthScore(metadata: APIDocumentationMetadata): number {
    let score = 0;
    let maxScore = 0;

    // Documentation structure (40% weight)
    const structure = metadata.structure;
    if (structure) {
      maxScore += 40;
      let structureScore = 0;
      if (structure.has_getting_started) structureScore += 10;
      if (structure.has_api_reference) structureScore += 15;
      if (structure.has_examples) structureScore += 10;
      if (structure.has_changelog) structureScore += 5;
      score += structureScore;
    }

    // Popularity (30% weight)
    const popularity = metadata.popularity;
    if (popularity) {
      maxScore += 30;
      let popularityScore = 0;
      
      // Weekly downloads scoring
      if (popularity.weekly_downloads) {
        const downloads = popularity.weekly_downloads;
        if (downloads > 1000000) popularityScore += 15;
        else if (downloads > 100000) popularityScore += 12;
        else if (downloads > 10000) popularityScore += 8;
        else if (downloads > 1000) popularityScore += 5;
        else if (downloads > 100) popularityScore += 2;
      }
      
      // GitHub stars scoring
      if (popularity.github_stars) {
        const stars = popularity.github_stars;
        if (stars > 10000) popularityScore += 15;
        else if (stars > 1000) popularityScore += 12;
        else if (stars > 100) popularityScore += 8;
        else if (stars > 50) popularityScore += 5;
        else if (stars > 10) popularityScore += 2;
      }
      
      score += Math.min(popularityScore, 30);
    }

    // Maintenance (30% weight)
    const maintenance = metadata.maintenance;
    if (maintenance) {
      maxScore += 30;
      let maintenanceScore = 0;
      
      // Recent release scoring
      if (maintenance.last_release) {
        const lastRelease = new Date(maintenance.last_release);
        const monthsAgo = (Date.now() - lastRelease.getTime()) / (1000 * 60 * 60 * 24 * 30);
        
        if (monthsAgo < 3) maintenanceScore += 15;
        else if (monthsAgo < 6) maintenanceScore += 12;
        else if (monthsAgo < 12) maintenanceScore += 8;
        else if (monthsAgo < 24) maintenanceScore += 4;
      }
      
      // Release frequency scoring
      if (maintenance.release_frequency) {
        const freq = maintenance.release_frequency;
        if (freq > 12) maintenanceScore += 10; // More than monthly
        else if (freq > 6) maintenanceScore += 8;  // Bi-monthly
        else if (freq > 2) maintenanceScore += 6;  // Quarterly
        else if (freq > 0) maintenanceScore += 3;  // At least yearly
      }
      
      // Maintainer count
      if (maintenance.maintainer_count && maintenance.maintainer_count > 1) {
        maintenanceScore += 5;
      }
      
      score += Math.min(maintenanceScore, 30);
    }

    // Return percentage score
    return maxScore > 0 ? Math.round((score / maxScore) * 100) : 0;
  }
}

/**
 * NPM package documentation fetcher
 */
export class NPMDocumentationFetcher extends DocumentationFetcher {
  async fetchDocumentation(dependency: PackageDependency): Promise<DocumentationFetchResult> {
    try {
      // Fetch package metadata from npm registry
      const packageData = await this.httpClient.fetchJson<any>(
        `https://registry.npmjs.org/${dependency.name}`
      );

      const latestVersion = packageData['dist-tags']?.latest || dependency.version_constraint.resolved_version;
      const versionData = packageData.versions?.[latestVersion] || packageData.versions?.[Object.keys(packageData.versions).pop()!];

      if (!versionData) {
        return {
          success: false,
          error: this.createError('VERSION_NOT_FOUND', `Version ${latestVersion} not found for ${dependency.name}`, dependency.name)
        };
      }

      // Build documentation metadata
      const metadata: APIDocumentationMetadata = {
        popularity: {
          weekly_downloads: await this.fetchNPMDownloads(dependency.name),
          github_stars: await this.fetchGitHubStars(versionData.repository?.url),
          ranking_score: this.calculateNPMRanking(packageData)
        },
        structure: {
          has_getting_started: this.hasGettingStarted(versionData),
          has_api_reference: this.hasAPIReference(versionData),
          has_examples: this.hasExamples(versionData),
          has_changelog: this.hasChangelog(packageData),
          documented_apis: this.countDocumentedAPIs(versionData)
        },
        maintenance: {
          last_release: packageData.time?.[latestVersion],
          release_frequency: this.calculateReleaseFrequency(packageData.time),
          maintainer_count: packageData.maintainers?.length || 0
        },
        license: versionData.license,
        keywords: versionData.keywords || [],
        categories: this.categorizeNPMPackage(versionData)
      };

      const documentation: DiscoveredAPIDoc = {
        id: crypto.randomUUID(),
        package_name: dependency.name,
        package_version: latestVersion,
        language: 'javascript',
        source_id: '', // This will be set by the calling service
        documentation_url: `https://www.npmjs.com/package/${dependency.name}`,
        api_reference_url: this.getAPIReferenceURL(versionData),
        examples_url: this.getExamplesURL(versionData),
        changelog_url: this.getChangelogURL(packageData),
        repository_url: this.normalizeRepositoryURL(versionData.repository?.url),
        health_score: this.calculateHealthScore(metadata),
        scrape_status: 'completed',
        metadata,
        created_at: new Date().toISOString()
      };

      return { success: true, documentation };

    } catch (error) {
      return {
        success: false,
        error: this.createError(
          'NPM_FETCH_ERROR',
          `Failed to fetch NPM documentation for ${dependency.name}: ${error instanceof Error ? error.message : 'Unknown error'}`,
          dependency.name
        )
      };
    }
  }

  private async fetchNPMDownloads(packageName: string): Promise<number | undefined> {
    try {
      const data = await this.httpClient.fetchJson<any>(
        `https://api.npmjs.org/downloads/point/last-week/${packageName}`
      );
      return data.downloads;
    } catch {
      return undefined;
    }
  }

  private async fetchGitHubStars(repositoryUrl?: string): Promise<number | undefined> {
    if (!repositoryUrl) return undefined;

    try {
      const match = repositoryUrl.match(/github\.com\/([^\/]+)\/([^\/]+)/);
      if (!match) return undefined;

      const [, owner, repo] = match;
      const cleanRepo = repo.replace(/\.git$/, '');
      
      const data = await this.httpClient.fetchJson<any>(
        `https://api.github.com/repos/${owner}/${cleanRepo}`
      );
      return data.stargazers_count;
    } catch {
      return undefined;
    }
  }

  private calculateNPMRanking(packageData: any): number {
    // Simple ranking based on download count and age
    const weeklyDownloads = packageData.downloads?.weekly || 0;
    const age = Date.now() - new Date(packageData.time?.created).getTime();
    const ageInYears = age / (1000 * 60 * 60 * 24 * 365);
    
    return Math.min(1, (weeklyDownloads / 100000) * (1 / (ageInYears + 1)));
  }

  private hasGettingStarted(versionData: any): boolean {
    const readme = versionData.readme?.toLowerCase() || '';
    return readme.includes('getting started') || readme.includes('quick start') || readme.includes('installation');
  }

  private hasAPIReference(versionData: any): boolean {
    const readme = versionData.readme?.toLowerCase() || '';
    return readme.includes('api') || readme.includes('reference') || readme.includes('documentation');
  }

  private hasExamples(versionData: any): boolean {
    const readme = versionData.readme?.toLowerCase() || '';
    return readme.includes('example') || readme.includes('usage') || readme.includes('demo');
  }

  private hasChangelog(packageData: any): boolean {
    return !!packageData.time && Object.keys(packageData.time).length > 2; // More than just 'created' and 'modified'
  }

  private countDocumentedAPIs(versionData: any): number {
    // Simple heuristic based on README content
    const readme = versionData.readme?.toLowerCase() || '';
    const methodMatches = readme.match(/\w+\(/g) || [];
    return methodMatches.length;
  }

  private calculateReleaseFrequency(timeData: any): number {
    if (!timeData) return 0;
    
    const releases = Object.keys(timeData).filter(key => key !== 'created' && key !== 'modified');
    if (releases.length < 2) return 0;
    
    const firstRelease = new Date(timeData.created);
    const lastRelease = new Date(Math.max(...releases.map(r => new Date(timeData[r]).getTime())));
    const yearsActive = (lastRelease.getTime() - firstRelease.getTime()) / (1000 * 60 * 60 * 24 * 365);
    
    return yearsActive > 0 ? releases.length / yearsActive : 0;
  }

  private getAPIReferenceURL(versionData: any): string | undefined {
    if (versionData.homepage && versionData.homepage.includes('docs')) {
      return versionData.homepage;
    }
    return undefined;
  }

  private getExamplesURL(versionData: any): string | undefined {
    const repoUrl = this.normalizeRepositoryURL(versionData.repository?.url);
    if (repoUrl) {
      return `${repoUrl}/tree/main/examples`;
    }
    return undefined;
  }

  private getChangelogURL(packageData: any): string | undefined {
    const repoUrl = this.normalizeRepositoryURL(packageData.repository?.url);
    if (repoUrl) {
      return `${repoUrl}/blob/main/CHANGELOG.md`;
    }
    return undefined;
  }

  private normalizeRepositoryURL(url?: string): string | undefined {
    if (!url) return undefined;
    
    // Remove git+ prefix and .git suffix
    let cleanUrl = url.replace(/^git\+/, '').replace(/\.git$/, '');
    
    // Convert SSH to HTTPS
    cleanUrl = cleanUrl.replace(/^git@github\.com:/, 'https://github.com/');
    
    return cleanUrl.startsWith('http') ? cleanUrl : undefined;
  }

  private categorizeNPMPackage(versionData: any): string[] {
    const categories: string[] = [];
    const keywords = versionData.keywords || [];
    const description = versionData.description?.toLowerCase() || '';
    const name = versionData.name.toLowerCase();

    // Common categories based on keywords and description
    if (keywords.some((k: string) => ['react', 'vue', 'angular'].includes(k.toLowerCase())) || 
        description.includes('component') || description.includes('ui')) {
      categories.push('UI Framework');
    }

    if (keywords.some((k: string) => ['test', 'testing', 'jest', 'mocha'].includes(k.toLowerCase())) ||
        description.includes('test')) {
      categories.push('Testing');
    }

    if (keywords.some((k: string) => ['build', 'webpack', 'rollup', 'bundler'].includes(k.toLowerCase())) ||
        description.includes('build') || description.includes('bundler')) {
      categories.push('Build Tools');
    }

    if (keywords.some((k: string) => ['server', 'express', 'api', 'http'].includes(k.toLowerCase())) ||
        description.includes('server') || description.includes('api')) {
      categories.push('Server/API');
    }

    return categories;
  }
}

/**
 * PyPI package documentation fetcher
 */
export class PyPIDocumentationFetcher extends DocumentationFetcher {
  async fetchDocumentation(dependency: PackageDependency): Promise<DocumentationFetchResult> {
    try {
      // Fetch package metadata from PyPI
      const packageData = await this.httpClient.fetchJson<any>(
        `https://pypi.org/pypi/${dependency.name}/json`
      );

      const info = packageData.info;
      const latestVersion = info.version;

      const metadata: APIDocumentationMetadata = {
        popularity: {
          ranking_score: this.calculatePyPIRanking(packageData)
        },
        structure: {
          has_getting_started: this.hasGettingStarted(info),
          has_api_reference: this.hasAPIReference(info),
          has_examples: this.hasExamples(info),
          documented_apis: this.countDocumentedAPIs(info)
        },
        maintenance: {
          maintainer_count: info.maintainer ? 1 : 0
        },
        license: info.license,
        keywords: info.keywords?.split(',').map((k: string) => k.trim()) || [],
        categories: this.categorizePyPIPackage(info)
      };

      const documentation: DiscoveredAPIDoc = {
        id: crypto.randomUUID(),
        package_name: dependency.name,
        package_version: latestVersion,
        language: 'python',
        source_id: '',
        documentation_url: `https://pypi.org/project/${dependency.name}/`,
        repository_url: info.home_page || info.project_url,
        health_score: this.calculateHealthScore(metadata),
        scrape_status: 'completed',
        metadata,
        created_at: new Date().toISOString()
      };

      return { success: true, documentation };

    } catch (error) {
      return {
        success: false,
        error: this.createError(
          'PYPI_FETCH_ERROR',
          `Failed to fetch PyPI documentation for ${dependency.name}: ${error instanceof Error ? error.message : 'Unknown error'}`,
          dependency.name
        )
      };
    }
  }

  private calculatePyPIRanking(packageData: any): number {
    // PyPI doesn't provide download stats easily, so we use other signals
    const info = packageData.info;
    let score = 0;

    // Has description
    if (info.summary && info.summary.length > 10) score += 0.2;
    
    // Has detailed description
    if (info.description && info.description.length > 100) score += 0.3;
    
    // Has home page
    if (info.home_page) score += 0.2;
    
    // Has classifiers
    if (info.classifiers && info.classifiers.length > 0) score += 0.2;
    
    // Recent release
    const lastRelease = new Date(packageData.releases?.[info.version]?.[0]?.upload_time);
    if (lastRelease && Date.now() - lastRelease.getTime() < 365 * 24 * 60 * 60 * 1000) {
      score += 0.1;
    }

    return Math.min(1, score);
  }

  private hasGettingStarted(info: any): boolean {
    const description = info.description?.toLowerCase() || '';
    const summary = info.summary?.toLowerCase() || '';
    return description.includes('getting started') || description.includes('installation') ||
           summary.includes('getting started') || summary.includes('quick start');
  }

  private hasAPIReference(info: any): boolean {
    const description = info.description?.toLowerCase() || '';
    return description.includes('api') || description.includes('reference') || description.includes('docs');
  }

  private hasExamples(info: any): boolean {
    const description = info.description?.toLowerCase() || '';
    return description.includes('example') || description.includes('usage') || description.includes('demo');
  }

  private countDocumentedAPIs(info: any): number {
    const description = info.description?.toLowerCase() || '';
    const methodMatches = description.match(/def \w+/g) || [];
    const classMatches = description.match(/class \w+/g) || [];
    return methodMatches.length + classMatches.length;
  }

  private categorizePyPIPackage(info: any): string[] {
    const categories: string[] = [];
    const classifiers = info.classifiers || [];
    const keywords = info.keywords?.toLowerCase() || '';
    const description = info.description?.toLowerCase() || '';

    // Extract categories from classifiers
    for (const classifier of classifiers) {
      if (classifier.startsWith('Topic ::')) {
        const topic = classifier.replace('Topic ::', '').trim();
        categories.push(topic);
      }
    }

    // Additional categories based on keywords
    if (keywords.includes('web') || keywords.includes('django') || keywords.includes('flask')) {
      categories.push('Web Framework');
    }
    
    if (keywords.includes('data') || keywords.includes('science') || keywords.includes('ml')) {
      categories.push('Data Science');
    }

    if (keywords.includes('test') || description.includes('testing')) {
      categories.push('Testing');
    }

    return categories;
  }
}

/**
 * docs.rs (Rust) documentation fetcher
 */
export class DocsRsDocumentationFetcher extends DocumentationFetcher {
  async fetchDocumentation(dependency: PackageDependency): Promise<DocumentationFetchResult> {
    try {
      // Fetch crate metadata from crates.io
      const crateData = await this.httpClient.fetchJson<any>(
        `https://crates.io/api/v1/crates/${dependency.name}`
      );

      const crate = crateData.crate;
      const latestVersion = crate.max_version;

      const metadata: APIDocumentationMetadata = {
        popularity: {
          weekly_downloads: crate.downloads,
          ranking_score: this.calculateCratesRanking(crate)
        },
        structure: {
          has_getting_started: true, // docs.rs always has basic structure
          has_api_reference: true,   // docs.rs is primarily API reference
          has_examples: this.hasExamples(crate),
          documented_apis: 100 // Placeholder - docs.rs has comprehensive API docs
        },
        maintenance: {
          last_release: crate.updated_at,
          maintainer_count: 1 // Simplified
        },
        license: crate.license,
        keywords: crate.keywords || [],
        categories: crate.categories || []
      };

      const documentation: DiscoveredAPIDoc = {
        id: crypto.randomUUID(),
        package_name: dependency.name,
        package_version: latestVersion,
        language: 'rust',
        source_id: '',
        documentation_url: `https://docs.rs/${dependency.name}/${latestVersion}`,
        repository_url: crate.repository,
        health_score: this.calculateHealthScore(metadata),
        scrape_status: 'completed',
        metadata,
        created_at: new Date().toISOString()
      };

      return { success: true, documentation };

    } catch (error) {
      return {
        success: false,
        error: this.createError(
          'DOCSRS_FETCH_ERROR',
          `Failed to fetch docs.rs documentation for ${dependency.name}: ${error instanceof Error ? error.message : 'Unknown error'}`,
          dependency.name
        )
      };
    }
  }

  private calculateCratesRanking(crate: any): number {
    const downloads = crate.downloads || 0;
    const recentDownloads = crate.recent_downloads || 0;
    
    // Weight recent downloads more heavily
    const score = (downloads / 1000000) + (recentDownloads / 10000);
    return Math.min(1, score);
  }

  private hasExamples(crate: any): boolean {
    const description = crate.description?.toLowerCase() || '';
    return description.includes('example') || crate.categories?.includes('example');
  }
}

/**
 * Factory for creating documentation fetchers
 */
export class DocumentationFetcherFactory {
  static createFetcher(ecosystem: string, options: FetchOptions = {}): DocumentationFetcher {
    switch (ecosystem) {
      case 'npm':
        return new NPMDocumentationFetcher(options);
      case 'pypi':
        return new PyPIDocumentationFetcher(options);
      case 'crates':
        return new DocsRsDocumentationFetcher(options);
      default:
        throw new Error(`Unsupported ecosystem: ${ecosystem}`);
    }
  }
}