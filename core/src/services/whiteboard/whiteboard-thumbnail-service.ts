import { Logger } from '../../utils/logger.js';
import {
  Whiteboard,
  WhiteboardElement,
  WhiteboardCanvasData,
  Point,
  Size,
  Bounds,
} from '@shared/types/whiteboard.js';
import { z } from 'zod';

/**
 * Thumbnail generation options
 */
export const ThumbnailOptions = z.object({
  width: z.number().min(100).max(2000).default(400),
  height: z.number().min(100).max(2000).default(300),
  format: z.enum(['png', 'jpeg', 'webp']).default('png'),
  quality: z.number().min(0.1).max(1.0).default(0.8), // For JPEG/WebP
  backgroundColor: z.string().default('#ffffff'),
  padding: z.number().min(0).max(100).default(20), // Padding around content
  includeBackground: z.boolean().default(true),
  maxElements: z.number().min(1).max(1000).default(100), // Limit elements for performance
});
export type ThumbnailOptions = z.infer<typeof ThumbnailOptions>;

/**
 * Thumbnail generation result
 */
export const ThumbnailResult = z.object({
  dataUrl: z.string(), // Base64 data URL
  width: z.number(),
  height: z.number(),
  format: z.string(),
  size: z.number(), // Size in bytes
  generatedAt: z.string().datetime(),
  metadata: z.record(z.string(), z.any()).default({}),
});
export type ThumbnailResult = z.infer<typeof ThumbnailResult>;

/**
 * Element bounds calculation result
 */
interface ElementBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Canvas bounds for all elements
 */
interface CanvasBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  width: number;
  height: number;
}

/**
 * SVG element representation for thumbnail generation
 */
interface SvgElement {
  type: string;
  bounds: ElementBounds;
  style: any;
  data: any;
}

/**
 * Comprehensive thumbnail generation service for whiteboards and templates
 * Generates high-quality previews using SVG rendering and Canvas API
 */
export class WhiteboardThumbnailService {
  private logger: Logger;

  constructor(logger?: Logger) {
    this.logger = logger || new Logger('WhiteboardThumbnailService');
  }

  /**
   * Generate thumbnail for a whiteboard
   */
  async generateWhiteboardThumbnail(
    whiteboard: Whiteboard,
    elements: WhiteboardElement[],
    options?: Partial<ThumbnailOptions>
  ): Promise<ThumbnailResult> {
    try {
      const opts = ThumbnailOptions.parse(options || {});
      
      this.logger.debug('Generating whiteboard thumbnail', { 
        whiteboardId: whiteboard.id, 
        elementCount: elements.length,
        options: opts 
      });

      // Limit elements for performance
      const limitedElements = elements
        .filter(el => el.visible && !el.deletedAt)
        .slice(0, opts.maxElements);

      if (limitedElements.length === 0) {
        return this.generateEmptyThumbnail(opts);
      }

      // Calculate canvas bounds
      const canvasBounds = this.calculateCanvasBounds(limitedElements);
      
      // Generate SVG representation
      const svg = this.generateSvg(limitedElements, canvasBounds, whiteboard.canvasData, opts);
      
      // Convert SVG to image
      const thumbnail = await this.svgToImage(svg, opts);

      this.logger.info('Whiteboard thumbnail generated successfully', {
        whiteboardId: whiteboard.id,
        size: thumbnail.size,
        format: thumbnail.format
      });

      return thumbnail;
    } catch (error) {
      this.logger.error('Failed to generate whiteboard thumbnail', { 
        error, 
        whiteboardId: whiteboard.id 
      });
      throw error;
    }
  }

  /**
   * Generate thumbnail for template data
   */
  async generateTemplateThumbnail(
    templateData: any,
    options?: Partial<ThumbnailOptions>
  ): Promise<ThumbnailResult> {
    try {
      const opts = ThumbnailOptions.parse(options || {});
      
      this.logger.debug('Generating template thumbnail', { 
        elementCount: templateData?.defaultElements?.length || 0,
        options: opts 
      });

      const elements = templateData?.defaultElements || [];
      
      if (elements.length === 0) {
        return this.generateEmptyThumbnail(opts);
      }

      // Convert template elements to whiteboard elements format
      const whiteboardElements = this.convertTemplateElements(elements);
      
      // Calculate canvas bounds
      const canvasBounds = this.calculateCanvasBounds(whiteboardElements);
      
      // Generate SVG representation
      const svg = this.generateSvg(whiteboardElements, canvasBounds, templateData?.canvasData || {}, opts);
      
      // Convert SVG to image
      const thumbnail = await this.svgToImage(svg, opts);

      this.logger.info('Template thumbnail generated successfully', {
        elementCount: elements.length,
        size: thumbnail.size,
        format: thumbnail.format
      });

      return thumbnail;
    } catch (error) {
      this.logger.error('Failed to generate template thumbnail', { error });
      throw error;
    }
  }

  /**
   * Generate thumbnail from canvas screenshot (client-side integration)
   */
  async generateFromCanvasData(
    canvasDataUrl: string,
    options?: Partial<ThumbnailOptions>
  ): Promise<ThumbnailResult> {
    try {
      const opts = ThumbnailOptions.parse(options || {});
      
      this.logger.debug('Generating thumbnail from canvas data', { options: opts });

      // In a real implementation, this would use a canvas library like node-canvas
      // or puppeteer to process the image data
      
      // For now, return the processed data URL with metadata
      const thumbnail: ThumbnailResult = {
        dataUrl: canvasDataUrl,
        width: opts.width,
        height: opts.height,
        format: opts.format,
        size: this.estimateImageSize(canvasDataUrl),
        generatedAt: new Date().toISOString(),
        metadata: {
          source: 'canvas',
          processed: true,
        },
      };

      this.logger.info('Canvas thumbnail generated successfully', {
        size: thumbnail.size,
        format: thumbnail.format
      });

      return thumbnail;
    } catch (error) {
      this.logger.error('Failed to generate canvas thumbnail', { error });
      throw error;
    }
  }

  /**
   * Generate thumbnail for system templates
   */
  async generateSystemTemplateThumbnail(
    templateType: string,
    options?: Partial<ThumbnailOptions>
  ): Promise<ThumbnailResult> {
    try {
      const opts = ThumbnailOptions.parse(options || {});
      
      this.logger.debug('Generating system template thumbnail', { templateType, options: opts });

      // Generate elements based on template type
      const elements = this.generateSystemTemplateElements(templateType);
      
      if (elements.length === 0) {
        return this.generateEmptyThumbnail(opts);
      }

      // Calculate canvas bounds
      const canvasBounds = this.calculateCanvasBounds(elements);
      
      // Generate SVG representation
      const svg = this.generateSvg(elements, canvasBounds, {}, opts);
      
      // Convert SVG to image
      const thumbnail = await this.svgToImage(svg, opts);

      this.logger.info('System template thumbnail generated successfully', {
        templateType,
        elementCount: elements.length,
        size: thumbnail.size
      });

      return thumbnail;
    } catch (error) {
      this.logger.error('Failed to generate system template thumbnail', { error, templateType });
      throw error;
    }
  }

  // Private helper methods

  private calculateCanvasBounds(elements: WhiteboardElement[]): CanvasBounds {
    if (elements.length === 0) {
      return {
        minX: 0,
        minY: 0,
        maxX: 400,
        maxY: 300,
        width: 400,
        height: 300,
      };
    }

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    elements.forEach(element => {
      const bounds = this.getElementBounds(element);
      minX = Math.min(minX, bounds.x);
      minY = Math.min(minY, bounds.y);
      maxX = Math.max(maxX, bounds.x + bounds.width);
      maxY = Math.max(maxY, bounds.y + bounds.height);
    });

    return {
      minX,
      minY,
      maxX,
      maxY,
      width: maxX - minX,
      height: maxY - minY,
    };
  }

  private getElementBounds(element: WhiteboardElement): ElementBounds {
    const data = element.elementData;
    
    // Handle different element types
    switch (element.elementType) {
      case 'rectangle':
      case 'ellipse':
      case 'text':
      case 'sticky_note':
      case 'frame':
        return {
          x: data.position?.x || 0,
          y: data.position?.y || 0,
          width: data.size?.width || data.bounds?.width || 100,
          height: data.size?.height || data.bounds?.height || 100,
        };
      
      case 'line':
      case 'arrow':
        const start = data.start || { x: 0, y: 0 };
        const end = data.end || { x: 100, y: 100 };
        return {
          x: Math.min(start.x, end.x),
          y: Math.min(start.y, end.y),
          width: Math.abs(end.x - start.x),
          height: Math.abs(end.y - start.y),
        };
      
      case 'freehand':
        if (data.points && Array.isArray(data.points)) {
          const xs = data.points.map((p: any) => p.x || 0);
          const ys = data.points.map((p: any) => p.y || 0);
          return {
            x: Math.min(...xs),
            y: Math.min(...ys),
            width: Math.max(...xs) - Math.min(...xs),
            height: Math.max(...ys) - Math.min(...ys),
          };
        }
        break;
      
      default:
        // Fallback for unknown element types
        return {
          x: data.x || data.position?.x || 0,
          y: data.y || data.position?.y || 0,
          width: data.width || data.size?.width || 100,
          height: data.height || data.size?.height || 100,
        };
    }

    return { x: 0, y: 0, width: 100, height: 100 };
  }

  private generateSvg(
    elements: WhiteboardElement[],
    canvasBounds: CanvasBounds,
    canvasData: any,
    options: ThumbnailOptions
  ): string {
    const { width, height, backgroundColor, padding } = options;
    
    // Calculate scaling to fit content
    const availableWidth = width - (padding * 2);
    const availableHeight = height - (padding * 2);
    
    const scaleX = availableWidth / canvasBounds.width;
    const scaleY = availableHeight / canvasBounds.height;
    const scale = Math.min(scaleX, scaleY, 1); // Don't scale up
    
    const scaledWidth = canvasBounds.width * scale;
    const scaledHeight = canvasBounds.height * scale;
    
    const offsetX = padding + (availableWidth - scaledWidth) / 2;
    const offsetY = padding + (availableHeight - scaledHeight) / 2;

    let svg = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">`;
    
    // Background
    if (options.includeBackground) {
      const bgColor = canvasData.background?.color || backgroundColor;
      svg += `<rect width="${width}" height="${height}" fill="${bgColor}"/>`;
      
      // Add grid pattern if specified
      if (canvasData.background?.pattern === 'grid') {
        svg += this.generateGridPattern(canvasData.background);
      }
    }
    
    // Transform group for scaling and positioning
    svg += `<g transform="translate(${offsetX},${offsetY}) scale(${scale}) translate(${-canvasBounds.minX},${-canvasBounds.minY})">`;
    
    // Sort elements by layer index
    const sortedElements = [...elements].sort((a, b) => (a.layerIndex || 0) - (b.layerIndex || 0));
    
    // Render elements
    sortedElements.forEach(element => {
      svg += this.renderElementToSvg(element);
    });
    
    svg += '</g></svg>';
    
    return svg;
  }

  private renderElementToSvg(element: WhiteboardElement): string {
    const bounds = this.getElementBounds(element);
    const style = element.styleData || {};
    const data = element.elementData;
    
    let svgElement = '';
    
    switch (element.elementType) {
      case 'rectangle':
        svgElement = this.renderRectangle(bounds, style, data);
        break;
      case 'ellipse':
        svgElement = this.renderEllipse(bounds, style, data);
        break;
      case 'text':
        svgElement = this.renderText(bounds, style, data);
        break;
      case 'sticky_note':
        svgElement = this.renderStickyNote(bounds, style, data);
        break;
      case 'line':
        svgElement = this.renderLine(style, data);
        break;
      case 'arrow':
        svgElement = this.renderArrow(style, data);
        break;
      case 'freehand':
        svgElement = this.renderFreehand(style, data);
        break;
      default:
        // Render as a simple rectangle for unknown types
        svgElement = this.renderRectangle(bounds, style, data);
        break;
    }
    
    return svgElement;
  }

  private renderRectangle(bounds: ElementBounds, style: any, data: any): string {
    const fill = style.color?.fill || '#f0f0f0';
    const stroke = style.color?.stroke || '#ccc';
    const strokeWidth = style.color?.strokeWidth || 1;
    const cornerRadius = data.cornerRadius || 0;
    
    return `<rect x="${bounds.x}" y="${bounds.y}" width="${bounds.width}" height="${bounds.height}" 
            fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}" rx="${cornerRadius}"/>`;
  }

  private renderEllipse(bounds: ElementBounds, style: any, data: any): string {
    const fill = style.color?.fill || '#f0f0f0';
    const stroke = style.color?.stroke || '#ccc';
    const strokeWidth = style.color?.strokeWidth || 1;
    
    const cx = bounds.x + bounds.width / 2;
    const cy = bounds.y + bounds.height / 2;
    const rx = bounds.width / 2;
    const ry = bounds.height / 2;
    
    return `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" 
            fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}"/>`;
  }

  private renderText(bounds: ElementBounds, style: any, data: any): string {
    const text = data.text || '';
    const fontSize = style.text?.fontSize || 16;
    const color = style.text?.color || '#000';
    const fontFamily = style.text?.fontFamily || 'Arial';
    const textAlign = style.text?.textAlign || 'left';
    
    let textAnchor = 'start';
    let x = bounds.x;
    
    if (textAlign === 'center') {
      textAnchor = 'middle';
      x = bounds.x + bounds.width / 2;
    } else if (textAlign === 'right') {
      textAnchor = 'end';
      x = bounds.x + bounds.width;
    }
    
    return `<text x="${x}" y="${bounds.y + fontSize}" font-size="${fontSize}" 
            font-family="${fontFamily}" fill="${color}" text-anchor="${textAnchor}">${this.escapeXml(text)}</text>`;
  }

  private renderStickyNote(bounds: ElementBounds, style: any, data: any): string {
    const color = data.color || '#FFD700';
    const text = data.text || '';
    
    let svg = `<rect x="${bounds.x}" y="${bounds.y}" width="${bounds.width}" height="${bounds.height}" 
               fill="${color}" stroke="#ccc" stroke-width="1" rx="4"/>`;
    
    if (text) {
      const fontSize = Math.min(14, bounds.height / 4);
      const textY = bounds.y + fontSize + 5;
      svg += `<text x="${bounds.x + 5}" y="${textY}" font-size="${fontSize}" 
              font-family="Arial" fill="#000">${this.escapeXml(text.substring(0, 50))}</text>`;
    }
    
    return svg;
  }

  private renderLine(style: any, data: any): string {
    const start = data.start || { x: 0, y: 0 };
    const end = data.end || { x: 100, y: 100 };
    const stroke = style.color?.stroke || '#000';
    const strokeWidth = style.color?.strokeWidth || 2;
    
    return `<line x1="${start.x}" y1="${start.y}" x2="${end.x}" y2="${end.y}" 
            stroke="${stroke}" stroke-width="${strokeWidth}"/>`;
  }

  private renderArrow(style: any, data: any): string {
    const start = data.start || { x: 0, y: 0 };
    const end = data.end || { x: 100, y: 100 };
    const stroke = style.color?.stroke || '#000';
    const strokeWidth = style.color?.strokeWidth || 2;
    
    // Simple arrowhead calculation
    const angle = Math.atan2(end.y - start.y, end.x - start.x);
    const arrowLength = 10;
    const arrowAngle = Math.PI / 6;
    
    const arrowX1 = end.x - arrowLength * Math.cos(angle - arrowAngle);
    const arrowY1 = end.y - arrowLength * Math.sin(angle - arrowAngle);
    const arrowX2 = end.x - arrowLength * Math.cos(angle + arrowAngle);
    const arrowY2 = end.y - arrowLength * Math.sin(angle + arrowAngle);
    
    return `<g>
      <line x1="${start.x}" y1="${start.y}" x2="${end.x}" y2="${end.y}" 
            stroke="${stroke}" stroke-width="${strokeWidth}"/>
      <polygon points="${end.x},${end.y} ${arrowX1},${arrowY1} ${arrowX2},${arrowY2}" 
               fill="${stroke}"/>
    </g>`;
  }

  private renderFreehand(style: any, data: any): string {
    const points = data.points || [];
    if (points.length < 2) return '';
    
    const stroke = style.color?.stroke || '#000';
    const strokeWidth = style.color?.strokeWidth || 2;
    
    let path = `M ${points[0].x} ${points[0].y}`;
    for (let i = 1; i < points.length; i++) {
      path += ` L ${points[i].x} ${points[i].y}`;
    }
    
    return `<path d="${path}" stroke="${stroke}" stroke-width="${strokeWidth}" 
            fill="none" stroke-linecap="round" stroke-linejoin="round"/>`;
  }

  private generateGridPattern(background: any): string {
    const patternSize = background.patternSize || 20;
    const patternColor = background.patternColor || '#e5e5e5';
    
    return `
      <defs>
        <pattern id="grid" width="${patternSize}" height="${patternSize}" patternUnits="userSpaceOnUse">
          <path d="M ${patternSize} 0 L 0 0 0 ${patternSize}" fill="none" stroke="${patternColor}" stroke-width="1"/>
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#grid)" opacity="0.5"/>
    `;
  }

  private async svgToImage(svg: string, options: ThumbnailOptions): Promise<ThumbnailResult> {
    // In a real implementation, this would use a library like Sharp, node-canvas, or puppeteer
    // to convert SVG to actual image formats
    
    // For now, return a mock result with the SVG as base64 data URL
    const base64Svg = Buffer.from(svg).toString('base64');
    const dataUrl = `data:image/svg+xml;base64,${base64Svg}`;
    
    return {
      dataUrl,
      width: options.width,
      height: options.height,
      format: 'svg',
      size: svg.length,
      generatedAt: new Date().toISOString(),
      metadata: {
        originalFormat: options.format,
        elementCount: (svg.match(/<(rect|ellipse|text|line|path|polygon)/g) || []).length,
      },
    };
  }

  private generateEmptyThumbnail(options: ThumbnailOptions): ThumbnailResult {
    const svg = `<svg width="${options.width}" height="${options.height}" xmlns="http://www.w3.org/2000/svg">
      <rect width="${options.width}" height="${options.height}" fill="${options.backgroundColor}"/>
      <text x="${options.width / 2}" y="${options.height / 2}" font-size="16" font-family="Arial" 
            fill="#999" text-anchor="middle" dominant-baseline="middle">Empty Canvas</text>
    </svg>`;
    
    const base64Svg = Buffer.from(svg).toString('base64');
    const dataUrl = `data:image/svg+xml;base64,${base64Svg}`;
    
    return {
      dataUrl,
      width: options.width,
      height: options.height,
      format: 'svg',
      size: svg.length,
      generatedAt: new Date().toISOString(),
      metadata: {
        empty: true,
      },
    };
  }

  private convertTemplateElements(templateElements: any[]): WhiteboardElement[] {
    return templateElements.map((element, index) => ({
      id: `template-element-${index}`,
      whiteboardId: 'template',
      elementType: element.elementType || 'rectangle',
      elementData: element.elementData || {},
      layerIndex: element.layerIndex || index,
      parentId: undefined,
      locked: false,
      visible: true,
      styleData: element.styleData || {},
      metadata: {},
      version: 1,
      createdBy: 'system',
      lastModifiedBy: 'system',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }));
  }

  private generateSystemTemplateElements(templateType: string): WhiteboardElement[] {
    // Generate basic elements for different system template types
    const elements: WhiteboardElement[] = [];
    const now = new Date().toISOString();
    
    switch (templateType.toLowerCase()) {
      case 'brainstorming':
        // Add some sticky notes in a scattered pattern
        for (let i = 0; i < 6; i++) {
          elements.push({
            id: `sticky-${i}`,
            whiteboardId: 'template',
            elementType: 'sticky_note',
            elementData: {
              position: { x: 50 + (i % 3) * 120, y: 50 + Math.floor(i / 3) * 100 },
              size: { width: 100, height: 80 },
              text: `Idea ${i + 1}`,
              color: ['#FFD700', '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7'][i],
            },
            layerIndex: i,
            parentId: undefined,
            locked: false,
            visible: true,
            styleData: {},
            metadata: {},
            version: 1,
            createdBy: 'system',
            lastModifiedBy: 'system',
            createdAt: now,
            updatedAt: now,
          });
        }
        break;
        
      case 'flowchart':
        // Add connected shapes
        elements.push(
          {
            id: 'start',
            whiteboardId: 'template',
            elementType: 'ellipse',
            elementData: {
              position: { x: 50, y: 50 },
              size: { width: 100, height: 60 },
            },
            layerIndex: 0,
            parentId: undefined,
            locked: false,
            visible: true,
            styleData: { color: { fill: '#4ECDC4', stroke: '#333' } },
            metadata: {},
            version: 1,
            createdBy: 'system',
            lastModifiedBy: 'system',
            createdAt: now,
            updatedAt: now,
          },
          {
            id: 'process',
            whiteboardId: 'template',
            elementType: 'rectangle',
            elementData: {
              position: { x: 200, y: 50 },
              size: { width: 120, height: 60 },
            },
            layerIndex: 1,
            parentId: undefined,
            locked: false,
            visible: true,
            styleData: { color: { fill: '#FFD700', stroke: '#333' } },
            metadata: {},
            version: 1,
            createdBy: 'system',
            lastModifiedBy: 'system',
            createdAt: now,
            updatedAt: now,
          }
        );
        break;
        
      default:
        // Generic template with a few basic shapes
        elements.push({
          id: 'default-1',
          whiteboardId: 'template',
          elementType: 'rectangle',
          elementData: {
            position: { x: 100, y: 100 },
            size: { width: 200, height: 100 },
          },
          layerIndex: 0,
          parentId: undefined,
          locked: false,
          visible: true,
          styleData: { color: { fill: '#f0f0f0', stroke: '#ccc' } },
          metadata: {},
          version: 1,
          createdBy: 'system',
          lastModifiedBy: 'system',
          createdAt: now,
          updatedAt: now,
        });
        break;
    }
    
    return elements;
  }

  private escapeXml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  private estimateImageSize(dataUrl: string): number {
    // Rough estimate based on data URL length
    return Math.round(dataUrl.length * 0.75);
  }
}