import { MCPServer } from '@tylercoles/mcp-server';
import { DatabaseConnection } from '../database/index.js';
import { Logger } from '../utils/logger.js';
import { WhiteboardService } from '../services/whiteboard-service.js';
import { ElementService } from '../services/element-service.js';
import { createWhiteboardTool } from './create-whiteboard.js';
import { getWhiteboardTool } from './get-whiteboard.js';
import { updateWhiteboardTool } from './update-whiteboard.js';
import { deleteWhiteboardTool } from './delete-whiteboard.js';
import { listWhiteboardsTool } from './list-whiteboards.js';
import { addElementTool } from './add-element.js';
import { updateElementTool } from './update-element.js';
import { deleteElementTool } from './delete-element.js';
import { analyticsTools } from './analytics/analytics-tools.js';

/**
 * Whiteboard tools registry
 * Manages all MCP tools for whiteboard operations
 */
export class WhiteboardTools {
  private whiteboardService: WhiteboardService;
  private elementService: ElementService;
  private logger: Logger;

  constructor(
    private db: DatabaseConnection,
    logger?: Logger
  ) {
    this.logger = logger || new Logger('WhiteboardTools');
    this.whiteboardService = new WhiteboardService(db, logger);
    this.elementService = new ElementService(db, logger);
  }

  /**
   * Register all whiteboard tools with the MCP server
   */
  async registerTools(server: MCPServer): Promise<void> {
    try {
      // Whiteboard management tools
      server.registerTool(createWhiteboardTool(this.whiteboardService, this.logger));
      server.registerTool(getWhiteboardTool(this.whiteboardService, this.logger));
      server.registerTool(updateWhiteboardTool(this.whiteboardService, this.logger));
      server.registerTool(deleteWhiteboardTool(this.whiteboardService, this.logger));
      server.registerTool(listWhiteboardsTool(this.whiteboardService, this.logger));

      // Element management tools
      server.registerTool(addElementTool(this.elementService, this.logger));
      server.registerTool(updateElementTool(this.elementService, this.logger));
      server.registerTool(deleteElementTool(this.elementService, this.logger));

      // Analytics tools
      analyticsTools.forEach(tool => {
        server.registerTool(tool);
      });

      this.logger.info('All whiteboard tools registered successfully');
    } catch (error) {
      this.logger.error('Failed to register whiteboard tools', { error });
      throw error;
    }
  }

  /**
   * Handle resource requests
   */
  async handleResource(uri: string): Promise<any> {
    try {
      // Parse URI
      const url = new URL(uri);
      
      if (url.protocol === 'whiteboard:') {
        const pathParts = url.pathname.split('/').filter(Boolean);
        
        if (pathParts.length >= 2 && pathParts[0] === 'whiteboard') {
          const whiteboardId = pathParts[1];
          const whiteboard = await this.whiteboardService.getWhiteboardWithElements(whiteboardId);
          
          if (!whiteboard) {
            throw new Error('Whiteboard not found');
          }

          return {
            contents: [{
              uri,
              mimeType: 'application/json',
              text: JSON.stringify(whiteboard, null, 2),
            }],
          };
        }
      }

      throw new Error('Unsupported resource URI');
    } catch (error) {
      this.logger.error('Failed to handle resource', { error, uri });
      throw error;
    }
  }
}