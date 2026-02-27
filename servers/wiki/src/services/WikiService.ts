import { WikiDatabase, Page, NewPage, PageUpdate, Category, Tag, Comment, NewComment } from '../database/index.js';
import { MarkdownProcessor, ParsedMarkdown } from '../utils/markdown.js';
import { 
  CreatePageRequest, 
  UpdatePageRequest, 
  SearchRequest, 
  SearchResult, 
  NavigationTree,
  WikiStats 
} from '../types/index.js';

export class WikiService {
  private markdownProcessor: MarkdownProcessor;

  constructor(private db: WikiDatabase) {
    this.markdownProcessor = new MarkdownProcessor();
  }

  // Page operations
  async createPage(request: CreatePageRequest): Promise<Page> {
    const { title, content, summary, category_ids, tag_names, is_published, parent_id, created_by } = request;

    // Generate slug from title
    const slug = this.markdownProcessor.generateSlug(title);
    
    // Check if slug already exists
    const existingPage = await this.db.getPageBySlug(slug);
    if (existingPage) {
      throw new Error(`A page with slug "${slug}" already exists`);
    }

    // Parse markdown content
    const parsed = this.markdownProcessor.parse(content);
    const finalSummary = summary || parsed.excerpt || '';

    // Create the page
    const newPage: NewPage = {
      title,
      slug,
      content,
      summary: finalSummary,
      is_published: is_published ?? true,
      parent_id: parent_id || null,
      created_by: created_by || null,
      updated_by: created_by || null,
    };

    const page = await this.db.createPage(newPage);

    // Handle categories
    if (category_ids && category_ids.length > 0) {
      await this.assignCategoriesToPage(page.id!, category_ids);
    }

    // Handle tags
    if (tag_names && tag_names.length > 0) {
      await this.assignTagsToPage(page.id!, tag_names);
    }

    // Process internal links
    await this.processPageLinks(page.id!, parsed.links);

    return page;
  }

  async updatePage(pageId: number, request: UpdatePageRequest): Promise<Page> {
    const { title, content, summary, category_ids, tag_names, is_published, parent_id, updated_by, change_reason } = request;

    // Get existing page
    const existingPage = await this.db.getPageById(pageId);
    if (!existingPage) {
      throw new Error(`Page with ID ${pageId} not found`);
    }

    // Create history entry before updating
    if (content !== undefined || title !== undefined) {
      await this.createPageHistory(pageId, existingPage, updated_by, change_reason);
    }

    const updates: PageUpdate = {
      updated_by: updated_by || null,
    };

    // Handle title change (regenerate slug if needed)
    if (title !== undefined && title !== existingPage.title) {
      const newSlug = this.markdownProcessor.generateSlug(title);
      const existingWithSlug = await this.db.getPageBySlug(newSlug);
      
      if (existingWithSlug && existingWithSlug.id !== pageId) {
        throw new Error(`A page with slug "${newSlug}" already exists`);
      }
      
      updates.title = title;
      updates.slug = newSlug;
    }

    // Handle content change
    if (content !== undefined) {
      const parsed = this.markdownProcessor.parse(content);
      updates.content = content;
      
      // Update summary if not explicitly provided
      if (summary === undefined && !existingPage.summary) {
        updates.summary = parsed.excerpt || '';
      }
      
      // Process internal links
      await this.processPageLinks(pageId, parsed.links);
    }

    if (summary !== undefined) {
      updates.summary = summary;
    }

    if (is_published !== undefined) {
      updates.is_published = is_published;
    }

    if (parent_id !== undefined) {
      updates.parent_id = parent_id;
    }

    // Update the page
    const updatedPage = await this.db.updatePage(pageId, updates);

    // Handle category changes
    if (category_ids !== undefined) {
      await this.assignCategoriesToPage(pageId, category_ids);
    }

    // Handle tag changes
    if (tag_names !== undefined) {
      await this.assignTagsToPage(pageId, tag_names);
    }

    return updatedPage;
  }

  async deletePage(pageId: number): Promise<void> {
    const page = await this.db.getPageById(pageId);
    if (!page) {
      throw new Error(`Page with ID ${pageId} not found`);
    }

    // Check if page has children
    const children = await this.db.getPagesByParent(pageId);
    if (children.length > 0) {
      throw new Error('Cannot delete page with child pages. Move or delete child pages first.');
    }

    await this.db.deletePage(pageId);
  }

  async getPage(pageId: number): Promise<Page | null> {
    const page = await this.db.getPageById(pageId);
    if (!page) return null;

    // Enhance with related data
    const [categories, tags] = await Promise.all([
      this.db.getPageCategories(pageId),
      this.db.getPageTags(pageId),
    ]);

    return {
      ...page,
      categories,
      tags,
    };
  }

  async getPageBySlug(slug: string): Promise<Page | null> {
    const page = await this.db.getPageBySlug(slug);
    if (!page) return null;

    return this.getPage(page.id!);
  }

  async getPages(published_only = false): Promise<Page[]> {
    const pages = await this.db.getPages();
    return published_only ? pages.filter(p => p.is_published) : pages;
  }

  // Search operations
  async searchPages(request: SearchRequest): Promise<SearchResult[]> {
    const { query, category_id, tag_names, include_drafts = false, limit = 50 } = request;

    let pages = await this.db.searchPages(query, limit);

    // Filter by publication status
    if (!include_drafts) {
      pages = pages.filter(page => page.is_published);
    }

    // Filter by category
    if (category_id) {
      const categoryPages = new Set();
      for (const page of pages) {
        const categories = await this.db.getPageCategories(page.id!);
        if (categories.some(cat => cat.id === category_id)) {
          categoryPages.add(page.id);
        }
      }
      pages = pages.filter(page => categoryPages.has(page.id));
    }

    // Filter by tags
    if (tag_names && tag_names.length > 0) {
      const tagPages = new Set();
      for (const page of pages) {
        const tags = await this.db.getPageTags(page.id!);
        const pageTagNames = tags.map(tag => tag.name);
        if (tag_names.some(tagName => pageTagNames.includes(tagName))) {
          tagPages.add(page.id);
        }
      }
      pages = pages.filter(page => tagPages.has(page.id));
    }

    // Convert to search results
    return pages.map(page => ({
      page,
      excerpt: page.summary || undefined,
      score: 1.0, // TODO: Implement proper scoring
    }));
  }

  // Navigation operations
  async getNavigationTree(): Promise<NavigationTree[]> {
    const rootPages = await this.db.getPagesByParent(null);
    
    const buildTree = async (pages: Page[], level = 0): Promise<NavigationTree[]> => {
      const tree: NavigationTree[] = [];
      
      for (const page of pages) {
        const children = await this.db.getPagesByParent(page.id!);
        const childTree = await buildTree(children, level + 1);
        
        tree.push({
          page,
          children: childTree,
          level,
        });
      }
      
      return tree;
    };

    return buildTree(rootPages);
  }

  // Category operations
  async createCategory(name: string, description?: string, color?: string): Promise<Category> {
    return await this.db.createCategory({ name, description, color });
  }

  async getCategories(): Promise<Category[]> {
    return await this.db.getCategories();
  }

  // Tag operations
  async createTag(name: string, color?: string): Promise<Tag> {
    return await this.db.createTag({ name, color });
  }

  async getTags(): Promise<Tag[]> {
    return await this.db.getTags();
  }

  // Comment operations
  async addComment(pageId: number, content: string, author?: string, parentId?: number): Promise<Comment> {
    const page = await this.db.getPageById(pageId);
    if (!page) {
      throw new Error(`Page with ID ${pageId} not found`);
    }

    const newComment: NewComment = {
      page_id: pageId,
      content,
      author: author || null,
      parent_id: parentId || null,
    };

    return await this.db.createComment(newComment);
  }

  async getPageComments(pageId: number): Promise<Comment[]> {
    return await this.db.getPageComments(pageId);
  }

  async deleteComment(commentId: number): Promise<void> {
    await this.db.deleteComment(commentId);
  }

  // Page history operations
  async getPageHistory(pageId: number): Promise<any[]> {
    const page = await this.db.getPageById(pageId);
    if (!page) {
      throw new Error(`Page with ID ${pageId} not found`);
    }

    return await this.db.getPageHistory(pageId);
  }

  async restorePageVersion(pageId: number, historyId: number, restoredBy?: string): Promise<Page> {
    const [page, history] = await Promise.all([
      this.db.getPageById(pageId),
      this.db.kysely
        .selectFrom('page_history')
        .selectAll()
        .where('id', '=', historyId)
        .where('page_id', '=', pageId)
        .executeTakeFirst()
    ]);

    if (!page) {
      throw new Error(`Page with ID ${pageId} not found`);
    }

    if (!history) {
      throw new Error(`History entry with ID ${historyId} not found for page ${pageId}`);
    }

    // Create history entry for current version before restoration
    await this.createPageHistory(pageId, page, restoredBy, `Restored to version from ${history.created_at}`);

    // Restore the page content
    const updates: PageUpdate = {
      title: history.title,
      content: history.content,
      summary: history.summary,
      updated_by: restoredBy || null,
    };

    // Generate new slug if title changed
    if (history.title !== page.title) {
      updates.slug = this.markdownProcessor.generateSlug(history.title);
    }

    // Process internal links from restored content
    const parsed = this.markdownProcessor.parse(history.content);
    await this.processPageLinks(pageId, parsed.links);

    return await this.db.updatePage(pageId, updates);
  }

  // Page links operations
  async getPageLinks(pageId: number): Promise<any[]> {
    const page = await this.db.getPageById(pageId);
    if (!page) {
      throw new Error(`Page with ID ${pageId} not found`);
    }

    return await this.db.getPageLinks(pageId);
  }

  async getPageBacklinks(pageId: number): Promise<any[]> {
    const page = await this.db.getPageById(pageId);
    if (!page) {
      throw new Error(`Page with ID ${pageId} not found`);
    }

    return await this.db.getPageBacklinks(pageId);
  }

  // Category assignment operations (public methods)
  async updatePageCategories(pageId: number, categoryIds: number[]): Promise<void> {
    const page = await this.db.getPageById(pageId);
    if (!page) {
      throw new Error(`Page with ID ${pageId} not found`);
    }

    await this.assignCategoriesToPage(pageId, categoryIds);
  }

  // Tag assignment operations (public methods)
  async updatePageTags(pageId: number, tagNames: string[]): Promise<void> {
    const page = await this.db.getPageById(pageId);
    if (!page) {
      throw new Error(`Page with ID ${pageId} not found`);
    }

    await this.assignTagsToPage(pageId, tagNames);
  }

  // Enhanced search with filters
  async searchPagesAdvanced(request: {
    query?: string;
    category_ids?: number[];
    tag_names?: string[];
    include_drafts?: boolean;
    author?: string;
    date_from?: string;
    date_to?: string;
    limit?: number;
  }): Promise<SearchResult[]> {
    const { 
      query, 
      category_ids, 
      tag_names, 
      include_drafts = false, 
      author,
      date_from,
      date_to,
      limit = 50 
    } = request;

    let pages = query ? await this.db.searchPages(query, limit * 2) : await this.db.getPages();

    // Filter by publication status
    if (!include_drafts) {
      pages = pages.filter(page => page.is_published);
    }

    // Filter by author
    if (author) {
      pages = pages.filter(page => 
        page.created_by === author || page.updated_by === author
      );
    }

    // Filter by date range
    if (date_from) {
      pages = pages.filter(page => page.created_at >= date_from);
    }
    if (date_to) {
      pages = pages.filter(page => page.created_at <= date_to);
    }

    // Filter by categories
    if (category_ids && category_ids.length > 0) {
      const categoryPages = new Set();
      for (const page of pages) {
        const categories = await this.db.getPageCategories(page.id!);
        if (categories.some(cat => category_ids.includes(cat.id!))) {
          categoryPages.add(page.id);
        }
      }
      pages = pages.filter(page => categoryPages.has(page.id));
    }

    // Filter by tags
    if (tag_names && tag_names.length > 0) {
      const tagPages = new Set();
      for (const page of pages) {
        const tags = await this.db.getPageTags(page.id!);
        const pageTagNames = tags.map(tag => tag.name);
        if (tag_names.some(tagName => pageTagNames.includes(tagName))) {
          tagPages.add(page.id);
        }
      }
      pages = pages.filter(page => tagPages.has(page.id));
    }

    // Limit results
    pages = pages.slice(0, limit);

    // Convert to search results
    return pages.map(page => ({
      page,
      excerpt: page.summary || undefined,
      score: 1.0, // TODO: Implement proper scoring based on query relevance
    }));
  }

  // Statistics
  async getStats(): Promise<WikiStats> {
    const baseStats = await this.db.getStats();
    
    // Get recent activity from page history
    const recentActivity = await this.db.kysely
      .selectFrom('page_history')
      .innerJoin('pages', 'pages.id', 'page_history.page_id')
      .select([
        'page_history.id',
        'page_history.page_id',
        'page_history.changed_by',
        'page_history.change_reason',
        'page_history.created_at',
        'pages.title as page_title',
        'pages.slug as page_slug',
      ])
      .orderBy('page_history.created_at', 'desc')
      .limit(10)
      .execute();

    // Get popular pages (most linked to)
    const popularPages = await this.db.kysely
      .selectFrom('pages')
      .leftJoin('page_links', 'page_links.target_page_id', 'pages.id')
      .select([
        'pages.id',
        'pages.title',
        'pages.slug',
        'pages.summary',
        'pages.updated_at',
      ])
      .select((eb) => eb.fn.count('page_links.id').as('link_count'))
      .groupBy(['pages.id', 'pages.title', 'pages.slug', 'pages.summary', 'pages.updated_at'])
      .orderBy('link_count', 'desc')
      .limit(10)
      .execute();
    
    return {
      ...baseStats,
      recent_activity: recentActivity.map(activity => ({
        id: activity.id,
        type: 'page_updated',
        page_id: activity.page_id,
        page_title: activity.page_title,
        page_slug: activity.page_slug,
        user: activity.changed_by,
        description: activity.change_reason || 'Page updated',
        timestamp: activity.created_at,
      })),
      popular_pages: popularPages.map(page => ({
        id: page.id,
        title: page.title,
        slug: page.slug,
        summary: page.summary,
        link_count: Number(page.link_count) || 0,
        updated_at: page.updated_at,
      })),
    };
  }

  // Private helper methods
  private async assignCategoriesToPage(pageId: number, categoryIds: number[]): Promise<void> {
    // Remove existing categories
    const existingCategories = await this.db.getPageCategories(pageId);
    for (const category of existingCategories) {
      await this.db.kysely
        .deleteFrom('page_categories')
        .where('page_id', '=', pageId)
        .where('category_id', '=', category.id!)
        .execute();
    }
    
    // Add new categories
    for (const categoryId of categoryIds) {
      // Verify category exists
      const category = await this.db.kysely
        .selectFrom('categories')
        .select('id')
        .where('id', '=', categoryId)
        .executeTakeFirst();
      
      if (!category) {
        throw new Error(`Category with ID ${categoryId} not found`);
      }
      
      // Add category assignment
      await this.db.kysely
        .insertInto('page_categories')
        .values({ page_id: pageId, category_id: categoryId })
        .onConflict((oc) => oc.doNothing())
        .execute();
    }
  }

  private async assignTagsToPage(pageId: number, tagNames: string[]): Promise<void> {
    // Remove existing tags
    const existingTags = await this.db.getPageTags(pageId);
    for (const tag of existingTags) {
      await this.db.removePageTag(pageId, tag.id!);
    }
    
    // Create or get tags and assign them
    for (const tagName of tagNames) {
      const tag = await this.db.getOrCreateTag(tagName);
      await this.db.addPageTag(pageId, tag.id!);
    }
  }

  private async processPageLinks(pageId: number, links: string[]): Promise<void> {
    // Remove existing links from this page
    await this.db.kysely
      .deleteFrom('page_links')
      .where('source_page_id', '=', pageId)
      .execute();

    // Process each internal link
    for (const link of links) {
      // Parse wiki-style links [[PageName]] or [[PageName|Display Text]]
      const linkMatch = link.match(/^\[\[([^|\]]+)(?:\|([^\]]+))?\]\]$/);
      if (!linkMatch) continue;

      const targetSlug = this.markdownProcessor.generateSlug(linkMatch[1]);
      const displayText = linkMatch[2] || linkMatch[1];

      // Find target page by slug
      const targetPage = await this.db.getPageBySlug(targetSlug);
      if (!targetPage) {
        // Link to non-existent page - we could create a "broken link" entry
        // or skip it. For now, we'll skip broken links.
        continue;
      }

      // Create link relationship
      await this.db.kysely
        .insertInto('page_links')
        .values({
          source_page_id: pageId,
          target_page_id: targetPage.id!,
          link_text: displayText,
        })
        .onConflict((oc) => oc.doNothing())
        .execute();
    }
  }

  private async createPageHistory(pageId: number, page: Page, changedBy?: string, reason?: string): Promise<void> {
    await this.db.kysely
      .insertInto('page_history')
      .values({
        page_id: pageId,
        title: page.title,
        content: page.content,
        summary: page.summary,
        changed_by: changedBy || null,
        change_reason: reason || null,
      })
      .execute();
  }
}