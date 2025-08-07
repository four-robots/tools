import { Router, Request, Response } from 'express';
import { QualityService, DEFAULT_QUALITY_CONFIG } from '@mcp-tools/core/quality';
import { validateRequest } from '../middleware/validation.middleware.js';
import { z } from 'zod';

const router = Router();

// Initialize quality service (in real implementation, this would be dependency injected)
const qualityService = new QualityService({
  projectPath: process.cwd(),
  projectName: 'mcp-tools',
  scanners: {
    technicalDebt: { ...DEFAULT_QUALITY_CONFIG.technicalDebt, enabled: true },
    security: { ...DEFAULT_QUALITY_CONFIG.security, enabled: true },
    performance: { ...DEFAULT_QUALITY_CONFIG.performance, enabled: true },
    complexity: { ...DEFAULT_QUALITY_CONFIG.complexity, enabled: true }
  },
  reportOutputDir: './reports'
});

// Validation schemas
const ScanRequestSchema = z.object({
  scanTypes: z.array(z.enum(['technical_debt', 'security', 'performance', 'complexity', 'dependencies'])).optional(),
  generateReport: z.boolean().default(true)
});

const TrendsRequestSchema = z.object({
  metricName: z.string(),
  days: z.number().min(1).max(365).default(30)
});

const QualityGateSchema = z.object({
  id: z.string(),
  name: z.string(),
  enabled: z.boolean().default(true),
  rules: z.array(z.object({
    metricType: z.enum(['technical_debt', 'security', 'performance', 'coverage', 'complexity', 'dependencies']),
    metricName: z.string(),
    operator: z.enum(['<', '<=', '>', '>=', '==', '!=']),
    threshold: z.number(),
    severity: z.enum(['low', 'medium', 'high', 'critical']),
    blockMerge: z.boolean().default(false)
  }))
});

/**
 * @swagger
 * /api/v1/quality/overview:
 *   get:
 *     summary: Get overall quality metrics overview
 *     tags: [Quality]
 *     responses:
 *       200:
 *         description: Quality overview
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 qualityScore:
 *                   type: number
 *                 grade:
 *                   type: string
 *                 trend:
 *                   type: string
 *                 stats:
 *                   type: object
 */
router.get('/overview', async (req: Request, res: Response) => {
  try {
    const stats = await qualityService.getDashboardStats();
    
    // Get latest quality report
    const report = await qualityService['db'].getLatestQualityReport('mcp-tools');
    
    const overview = {
      qualityScore: report?.overall.qualityScore || null,
      grade: report?.overall.grade || null,
      trend: report?.overall.trend || 'stable',
      stats,
      lastScan: report?.generatedAt || null
    };

    res.json({
      success: true,
      data: overview
    });
  } catch (error) {
    console.error('Failed to get quality overview:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get quality overview'
    });
  }
});

/**
 * @swagger
 * /api/v1/quality/scan:
 *   post:
 *     summary: Run quality scan
 *     tags: [Quality]
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               scanTypes:
 *                 type: array
 *                 items:
 *                   type: string
 *                   enum: [technical_debt, security, performance, complexity, dependencies]
 *               generateReport:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: Scan completed
 */
router.post('/scan', validateRequest(ScanRequestSchema), async (req: Request, res: Response) => {
  try {
    const { scanTypes, generateReport } = req.body;

    let result;
    
    if (!scanTypes || scanTypes.length === 0) {
      // Run full scan
      result = await qualityService.runFullScan();
    } else {
      // Run specific scans
      const scanResults: any = {};
      
      if (scanTypes.includes('technical_debt')) {
        scanResults.technicalDebt = await qualityService.scanTechnicalDebt();
      }
      if (scanTypes.includes('security')) {
        scanResults.security = await qualityService.scanSecurity();
      }
      if (scanTypes.includes('performance')) {
        scanResults.performance = await qualityService.scanPerformance();
      }
      if (scanTypes.includes('complexity')) {
        scanResults.complexity = await qualityService.scanComplexity();
      }
      if (scanTypes.includes('dependencies')) {
        scanResults.dependencies = await qualityService.scanDependencies();
      }
      
      result = scanResults;
    }

    res.json({
      success: true,
      data: result,
      message: 'Quality scan completed successfully'
    });
  } catch (error) {
    console.error('Quality scan failed:', error);
    res.status(500).json({
      success: false,
      error: 'Quality scan failed'
    });
  }
});

/**
 * @swagger
 * /api/v1/quality/technical-debt:
 *   get:
 *     summary: Get technical debt analysis
 *     tags: [Quality]
 *     parameters:
 *       - in: query
 *         name: filePath
 *         schema:
 *           type: string
 *       - in: query
 *         name: resolved
 *         schema:
 *           type: boolean
 *     responses:
 *       200:
 *         description: Technical debt items
 */
router.get('/technical-debt', async (req: Request, res: Response) => {
  try {
    const { filePath, resolved } = req.query;
    
    const debtItems = await qualityService['db'].getTechnicalDebtItems(
      filePath as string,
      resolved !== undefined ? resolved === 'true' : undefined
    );

    // Generate summary statistics
    const summary = {
      total: debtItems.length,
      byType: {} as Record<string, number>,
      bySeverity: {} as Record<string, number>,
      totalEffortHours: 0
    };

    for (const item of debtItems) {
      summary.byType[item.debtType] = (summary.byType[item.debtType] || 0) + 1;
      summary.bySeverity[item.severity] = (summary.bySeverity[item.severity] || 0) + 1;
      summary.totalEffortHours += item.estimatedEffort || 0;
    }

    res.json({
      success: true,
      data: {
        items: debtItems,
        summary
      }
    });
  } catch (error) {
    console.error('Failed to get technical debt:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get technical debt data'
    });
  }
});

/**
 * @swagger
 * /api/v1/quality/security:
 *   get:
 *     summary: Get security vulnerabilities
 *     tags: [Quality]
 *     parameters:
 *       - in: query
 *         name: resolved
 *         schema:
 *           type: boolean
 *     responses:
 *       200:
 *         description: Security vulnerabilities
 */
router.get('/security', async (req: Request, res: Response) => {
  try {
    const { resolved } = req.query;
    
    const vulnerabilities = await qualityService['db'].getSecurityVulnerabilities(
      resolved !== undefined ? resolved === 'true' : undefined
    );

    // Generate summary statistics
    const summary = {
      total: vulnerabilities.length,
      bySeverity: { low: 0, medium: 0, high: 0, critical: 0 } as Record<string, number>,
      byPackage: {} as Record<string, number>
    };

    for (const vuln of vulnerabilities) {
      summary.bySeverity[vuln.severity]++;
      summary.byPackage[vuln.packageName] = (summary.byPackage[vuln.packageName] || 0) + 1;
    }

    res.json({
      success: true,
      data: {
        vulnerabilities,
        summary
      }
    });
  } catch (error) {
    console.error('Failed to get security data:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get security data'
    });
  }
});

/**
 * @swagger
 * /api/v1/quality/performance:
 *   get:
 *     summary: Get performance budget status
 *     tags: [Quality]
 *     responses:
 *       200:
 *         description: Performance budgets
 */
router.get('/performance', async (req: Request, res: Response) => {
  try {
    const budgets = await qualityService['db'].getPerformanceBudgets();

    // Generate summary statistics
    const summary = {
      total: budgets.length,
      compliant: budgets.filter(b => b.isCompliant).length,
      violations: budgets.filter(b => !b.isCompliant).length,
      complianceRate: budgets.length > 0 ? Math.round((budgets.filter(b => b.isCompliant).length / budgets.length) * 100) : 100
    };

    res.json({
      success: true,
      data: {
        budgets,
        summary
      }
    });
  } catch (error) {
    console.error('Failed to get performance data:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get performance data'
    });
  }
});

/**
 * @swagger
 * /api/v1/quality/trends:
 *   get:
 *     summary: Get quality trends over time
 *     tags: [Quality]
 *     parameters:
 *       - in: query
 *         name: metricName
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: days
 *         schema:
 *           type: number
 *           default: 30
 *     responses:
 *       200:
 *         description: Quality trends
 */
router.get('/trends', validateRequest(TrendsRequestSchema, 'query'), async (req: Request, res: Response) => {
  try {
    const { metricName, days } = req.query;
    
    const trends = await qualityService.getQualityTrends(
      metricName as string,
      parseInt(days as string) || 30
    );

    res.json({
      success: true,
      data: {
        metricName,
        days,
        trends
      }
    });
  } catch (error) {
    console.error('Failed to get quality trends:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get quality trends'
    });
  }
});

/**
 * @swagger
 * /api/v1/quality/reports:
 *   get:
 *     summary: Get latest quality report
 *     tags: [Quality]
 *     responses:
 *       200:
 *         description: Latest quality report
 */
router.get('/reports', async (req: Request, res: Response) => {
  try {
    const report = await qualityService['db'].getLatestQualityReport('mcp-tools');
    
    if (!report) {
      res.status(404).json({
        success: false,
        error: 'No quality reports found'
      });
      return;
    }

    res.json({
      success: true,
      data: report
    });
  } catch (error) {
    console.error('Failed to get quality report:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get quality report'
    });
  }
});

/**
 * @swagger
 * /api/v1/quality/gates/check:
 *   post:
 *     summary: Check quality gates
 *     tags: [Quality]
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: array
 *             items:
 *               $ref: '#/components/schemas/QualityGate'
 *     responses:
 *       200:
 *         description: Quality gate results
 */
router.post('/gates/check', async (req: Request, res: Response) => {
  try {
    const gates = req.body;
    
    // Validate gates
    for (const gate of gates) {
      QualityGateSchema.parse(gate);
    }

    const results = await qualityService.checkQualityGates(gates);

    res.json({
      success: true,
      data: results
    });
  } catch (error) {
    console.error('Quality gate check failed:', error);
    res.status(500).json({
      success: false,
      error: 'Quality gate check failed'
    });
  }
});

/**
 * @swagger
 * /api/v1/quality/technical-debt/{id}/resolve:
 *   patch:
 *     summary: Mark technical debt item as resolved
 *     tags: [Quality]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               resolutionCommit:
 *                 type: string
 *     responses:
 *       200:
 *         description: Technical debt item resolved
 */
router.patch('/technical-debt/:id/resolve', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { resolutionCommit } = req.body;

    if (!resolutionCommit) {
      res.status(400).json({
        success: false,
        error: 'Resolution commit hash is required'
      });
      return;
    }

    await qualityService['db'].resolveTechnicalDebtItem(id, resolutionCommit);

    res.json({
      success: true,
      message: 'Technical debt item marked as resolved'
    });
  } catch (error) {
    console.error('Failed to resolve technical debt item:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to resolve technical debt item'
    });
  }
});

/**
 * @swagger
 * /api/v1/quality/metrics:
 *   get:
 *     summary: Get quality metrics
 *     tags: [Quality]
 *     parameters:
 *       - in: query
 *         name: metricType
 *         schema:
 *           type: string
 *       - in: query
 *         name: limit
 *         schema:
 *           type: number
 *           default: 100
 *     responses:
 *       200:
 *         description: Quality metrics
 */
router.get('/metrics', async (req: Request, res: Response) => {
  try {
    const { metricType, limit } = req.query;
    
    const metrics = await qualityService['db'].getQualityMetrics(
      'mcp-tools',
      metricType as string,
      parseInt(limit as string) || 100
    );

    res.json({
      success: true,
      data: metrics
    });
  } catch (error) {
    console.error('Failed to get quality metrics:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get quality metrics'
    });
  }
});

// Health check endpoint
router.get('/health', (req: Request, res: Response) => {
  res.json({
    success: true,
    service: 'Quality Monitoring',
    status: 'healthy',
    timestamp: new Date().toISOString()
  });
});

export default router;