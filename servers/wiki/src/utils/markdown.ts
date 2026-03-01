import { marked } from 'marked';
import matter from 'gray-matter';
import slugify from 'slugify';

export interface ParsedMarkdown {
  content: string;
  frontmatter: Record<string, any>;
  excerpt?: string;
  links: string[];
  headings: Heading[];
}

export interface Heading {
  level: number;
  text: string;
  id: string;
}

export class MarkdownProcessor {
  private renderer: marked.Renderer;

  constructor() {
    this.renderer = new marked.Renderer();
    this.setupRenderer();
    this.configureMarked();
  }

  private setupRenderer(): void {
    // Override heading renderer to add IDs
    this.renderer.heading = (text: string, level: number): string => {
      const id = slugify(text, { lower: true, strict: true });
      const safeText = this.escapeHtml(text);
      return `<h${level} id="${id}">${safeText}</h${level}>`;
    };

    // Override link renderer to track internal links
    this.renderer.link = (href: string, title: string | null | undefined, text: string): string => {
      const safeTitle = title ? this.escapeHtml(title) : null;
      const titleAttr = safeTitle ? ` title="${safeTitle}"` : '';
      
      // Block dangerous protocols
      if (/^(javascript|data|vbscript):/i.test(href)) {
        return this.escapeHtml(text);
      }

      // Check if it's an internal link (starts with [[]] or is a relative path)
      if (href.startsWith('[[') && href.endsWith(']]')) {
        const pageSlug = encodeURIComponent(href.slice(2, -2));
        return `<a href="/wiki/${pageSlug}" class="internal-link"${titleAttr}>${text}</a>`;
      }

      // External links
      if (href.startsWith('http')) {
        const safeHref = this.escapeHtml(href);
        return `<a href="${safeHref}" target="_blank" rel="noopener noreferrer"${titleAttr}>${text}</a>`;
      }

      // Internal relative links
      const safeHref = this.escapeHtml(href);
      return `<a href="${safeHref}"${titleAttr}>${text}</a>`;
    };

    // Override code renderer for syntax highlighting support
    this.renderer.code = (code: string, language: string | undefined): string => {
      const lang = language || 'text';
      return `<pre><code class="language-${lang}">${this.escapeHtml(code)}</code></pre>`;
    };
  }

  private configureMarked(): void {
    marked.setOptions({
      renderer: this.renderer,
      gfm: true,
      breaks: false,
      pedantic: false,
    });
  }

  private escapeHtml(text: string): string {
    const map: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    };
    return text.replace(/[&<>"']/g, (char) => map[char]);
  }

  parse(content: string): ParsedMarkdown {
    // Parse frontmatter
    const { data: frontmatter, content: markdownContent } = matter(content);

    // Extract headings
    const headings = this.extractHeadings(markdownContent);

    // Extract links
    const links = this.extractLinks(markdownContent);

    // Convert to HTML
    const htmlContent = marked(markdownContent);

    // Generate excerpt from frontmatter or content
    const excerpt = frontmatter.excerpt || this.generateExcerpt(markdownContent);

    return {
      content: htmlContent,
      frontmatter,
      excerpt,
      links,
      headings,
    };
  }

  private extractHeadings(content: string): Heading[] {
    const headings: Heading[] = [];
    const headingRegex = /^(#{1,6})\s+(.+)$/gm;
    let match;

    while ((match = headingRegex.exec(content)) !== null) {
      const level = match[1].length;
      const text = match[2].trim();
      const id = slugify(text, { lower: true, strict: true });

      headings.push({ level, text, id });
    }

    return headings;
  }

  private extractLinks(content: string): string[] {
    const links: string[] = [];
    
    // Extract wiki-style links [[page]] or [[page|display text]]
    const wikiLinkRegex = /\[\[([^\]]+)\]\]/g;
    let match;

    while ((match = wikiLinkRegex.exec(content)) !== null) {
      // Store the full link format for processing
      links.push(`[[${match[1]}]]`);
    }

    return [...new Set(links)]; // Remove duplicates
  }

  private generateExcerpt(content: string, maxLength = 300): string {
    // Remove markdown formatting and get plain text
    const plainText = content
      .replace(/#{1,6}\s+/g, '') // Remove headers
      .replace(/\*\*([^*]+)\*\*/g, '$1') // Remove bold
      .replace(/\*([^*]+)\*/g, '$1') // Remove italic
      .replace(/`([^`]+)`/g, '$1') // Remove inline code
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // Remove links, keep text
      .replace(/\n\s*\n/g, ' ') // Replace multiple newlines with space
      .replace(/\n/g, ' ') // Replace single newlines with space
      .trim();

    if (plainText.length <= maxLength) {
      return plainText;
    }

    // Find the last complete sentence within the limit
    const excerpt = plainText.substring(0, maxLength);
    const lastSentence = excerpt.lastIndexOf('.');
    
    if (lastSentence > maxLength * 0.7) {
      return excerpt.substring(0, lastSentence + 1);
    }

    // Fall back to word boundary
    const lastSpace = excerpt.lastIndexOf(' ');
    return excerpt.substring(0, lastSpace) + '...';
  }

  generateSlug(title: string): string {
    return slugify(title, {
      lower: true,
      strict: true,
      remove: /[*+~.()'"!:@]/g,
    });
  }

  renderTableOfContents(headings: Heading[]): string {
    if (headings.length === 0) return '';

    let toc = '<div class="table-of-contents"><h3>Table of Contents</h3><ul>';
    let currentLevel = 0;

    for (const heading of headings) {
      if (heading.level > currentLevel) {
        // Opening new level(s)
        for (let i = currentLevel; i < heading.level - 1; i++) {
          toc += '<li><ul>';
        }
        if (currentLevel > 0) toc += '<li>';
      } else if (heading.level < currentLevel) {
        // Closing level(s)
        for (let i = currentLevel; i > heading.level; i--) {
          toc += '</ul></li>';
        }
        toc += '</li><li>';
      } else if (currentLevel > 0) {
        // Same level
        toc += '</li><li>';
      } else {
        toc += '<li>';
      }

      toc += `<a href="#${heading.id}">${this.escapeHtml(heading.text)}</a>`;
      currentLevel = heading.level;
    }

    // Close remaining levels
    for (let i = currentLevel; i > 0; i--) {
      toc += '</li>';
      if (i > 1) toc += '</ul>';
    }

    toc += '</ul></div>';
    return toc;
  }

  // Utility method to convert HTML back to markdown (basic)
  htmlToMarkdown(html: string): string {
    return html
      .replace(/<h([1-6]).*?>(.*?)<\/h[1-6]>/g, (_, level, text) => {
        return '#'.repeat(parseInt(level, 10)) + ' ' + text + '\n\n';
      })
      .replace(/<p>(.*?)<\/p>/g, '$1\n\n')
      .replace(/<strong>(.*?)<\/strong>/g, '**$1**')
      .replace(/<em>(.*?)<\/em>/g, '*$1*')
      .replace(/<code>(.*?)<\/code>/g, '`$1`')
      .replace(/<a href="([^"]*)".*?>(.*?)<\/a>/g, '[$2]($1)')
      .replace(/<br\s*\/?>/g, '\n')
      .trim();
  }
}