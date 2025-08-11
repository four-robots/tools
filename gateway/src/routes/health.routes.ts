/**
 * Health Check Routes
 * 
 * Provides health check endpoints for monitoring and service discovery.
 */

import { Router } from 'express';
import { MCPClientService } from '../services/MCPClientService.js';
import eventSourcingHealthRoutes from './event-sourcing-health.routes';

const router = Router();

// Mount event sourcing health routes
router.use('/event-sourcing', eventSourcingHealthRoutes);

// Basic health check
router.get('/', (req, res: any) => {
  res.success({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    version: '1.0.0'
  });
});

// Detailed health check including MCP server status
router.get('/detailed', async (req, res: any) => {
  try {
    const mcpService: MCPClientService = req.app.locals.mcpService;
    
    const serverStatus = await mcpService.getServerStatus();
    
    const health = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      version: '1.0.0',
      services: {
        gateway: {
          status: 'healthy',
          uptime: process.uptime()
        },
        mcpServers: serverStatus
      },
      memory: {
        used: process.memoryUsage().heapUsed,
        total: process.memoryUsage().heapTotal,
        external: process.memoryUsage().external
      }
    };
    
    // Check if any critical services are down
    const hasDownServices = Object.values(serverStatus).some(service => !service.connected);
    
    if (hasDownServices) {
      res.status(503).json({
        ...health,
        status: 'degraded'
      });
    } else {
      res.success(health);
    }
  } catch (error) {
    res.status(503).error('SERVICE_UNAVAILABLE', 'Health check failed', error);
  }
});

// Readiness probe
router.get('/ready', async (req, res: any) => {
  try {
    const mcpService: MCPClientService = req.app.locals.mcpService;
    const availableServers = mcpService.getAvailableServers();
    
    if (availableServers.length === 0) {
      res.status(503).error('SERVICE_UNAVAILABLE', 'No MCP servers available');
      return;
    }
    
    res.success({
      ready: true,
      availableServers
    });
  } catch (error) {
    res.status(503).error('SERVICE_UNAVAILABLE', 'Readiness check failed');
  }
});

// Liveness probe
router.get('/live', (req, res: any) => {
  res.success({
    alive: true,
    timestamp: new Date().toISOString()
  });
});

export default router;