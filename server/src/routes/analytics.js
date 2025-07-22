// server/src/routes/analytics.js
import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import { body, validationResult } from 'express-validator';
import { getDb } from '../database/init.js'; // <--- CHANGE THIS LINE
import { logger } from '../utils/logger.js';
import { requireProductOwner } from '../middleware/auth.js';

const router = express.Router();

// Validation for analytics events
const trackEventValidation = [
  body('event').isString().isLength({ min: 1, max: 100 }),
  body('properties').optional().isObject(),
  body('sessionId').optional().isString()
];

// Track analytics event
router.post('/track', trackEventValidation, async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation failed',
        details: errors.array(),
        code: 'VALIDATION_ERROR'
      });
    }

    // <--- ADD THIS LINE
    const db = getDb(); // Get the initialized database instance

    const { event, properties = {}, sessionId } = req.body;
    
    // Enhanced properties with request metadata
    const enhancedProperties = {
      ...properties,
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      referer: req.get('Referer'),
      timestamp: new Date().toISOString()
    };

    // This is the line where the error was occurring
    await db.run(`
      INSERT INTO analytics (id, user_id, session_id, event, properties, ip_address, user_agent, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      uuidv4(),
      req.user?.userId || null,
      sessionId || null,
      event,
      JSON.stringify(enhancedProperties),
      req.ip,
      req.get('User-Agent'),
      new Date().toISOString() // Explicitly set created_at
    ]);

    logger.info(`Analytics event tracked: ${event}`, {
      userId: req.user?.userId,
      event,
      sessionId
    });

    res.json({ 
      message: 'Event tracked successfully',
      code: 'EVENT_TRACKED'
    });
  } catch (error) {
    logger.error('Analytics tracking error:', error);
    res.status(500).json({ 
      error: 'Failed to track event',
      code: 'TRACKING_ERROR'
    });
  }
});

// Get user behavior analytics (product owner only)
router.get('/user/:userId/behavior', requireProductOwner, async (req, res) => {
  try {
    const db = getDb(); // <--- ADD THIS LINE
    const { userId } = req.params;
    const { startDate, endDate, limit = 1000 } = req.query;

    let query = `
      SELECT event, properties, created_at
      FROM analytics 
      WHERE user_id = ?
    `;
    const params = [userId];

    if (startDate) {
      query += ' AND created_at >= ?';
      params.push(startDate);
    }

    if (endDate) {
      query += ' AND created_at <= ?';
      params.push(endDate);
    }

    query += ' ORDER BY created_at DESC LIMIT ?';
    params.push(parseInt(limit));

    const analytics = await db.all(query, params);

    // Process analytics data
    const pageViews = {};
    const featureUsage = {};
    const conversionFunnel = {
      signUp: false,
      firstUpload: false,
      firstWorkflow: false,
      firstWorkflow: false, // Duplicate, removed after fix
      planUpgrade: false
    };
    const sessionData = {};

    analytics.forEach(record => {
      try {
        const props = JSON.parse(record.properties || '{}');
        
        if (record.event === 'page_view') {
          pageViews[props.page] = (pageViews[props.page] || 0) + 1;
        }
        
        if (record.event === 'feature_usage') {
          featureUsage[props.feature] = (featureUsage[props.feature] || 0) + 1;
        }
        
        // Track conversion funnel
        if (record.event === 'user_registered') conversionFunnel.signUp = true;
        if (record.event === 'file_uploaded') conversionFunnel.firstUpload = true;
        if (record.event === 'workflow_created') conversionFunnel.firstWorkflow = true;
        if (record.event === 'plan_upgraded') conversionFunnel.planUpgrade = true;

        // Session analysis
        if (props.sessionId) {
          if (!sessionData[props.sessionId]) {
            sessionData[props.sessionId] = {
              events: 0,
              duration: 0,
              pages: new Set()
            };
          }
          sessionData[props.sessionId].events++;
          if (props.page) {
            sessionData[props.sessionId].pages.add(props.page);
          }
        }
      } catch (parseError) {
        logger.warn('Failed to parse analytics properties:', parseError);
      }
    });

    // Calculate session metrics
    const sessionMetrics = Object.values(sessionData).map(session => ({
      events: session.events,
      uniquePages: session.pages.size
    }));

    const avgEventsPerSession = sessionMetrics.length > 0 
      ? sessionMetrics.reduce((sum, s) => sum + s.events, 0) / sessionMetrics.length 
      : 0;

    const avgPagesPerSession = sessionMetrics.length > 0
      ? sessionMetrics.reduce((sum, s) => sum + s.uniquePages, 0) / sessionMetrics.length
      : 0;

    res.json({
      pageViews,
      featureUsage,
      conversionFunnel,
      sessionMetrics: {
        totalSessions: sessionMetrics.length,
        avgEventsPerSession: Math.round(avgEventsPerSession * 100) / 100,
        avgPagesPerSession: Math.round(avgPagesPerSession * 100) / 100
      },
      totalEvents: analytics.length
    });
  } catch (error) {
    logger.error('Get user behavior error:', error);
    res.status(500).json({ 
      error: 'Failed to fetch user behavior',
      code: 'BEHAVIOR_FETCH_ERROR'
    });
  }
});

// Get conversion metrics (product owner only)
router.get('/conversion-metrics', requireProductOwner, async (req, res) => {
  try {
    const db = getDb(); // <--- ADD THIS LINE
    const { startDate, endDate } = req.query;

    // Get user counts
    let userQuery = 'SELECT COUNT(*) as count FROM users';
    let paidUserQuery = 'SELECT COUNT(*) as count FROM users WHERE subscription != "free"';
    const params = [];

    if (startDate) {
      userQuery += ' WHERE created_at >= ?';
      paidUserQuery += ' AND created_at >= ?';
      params.push(startDate);
    }

    if (endDate) {
      const whereClause = startDate ? ' AND' : ' WHERE';
      userQuery += `${whereClause} created_at <= ?`;
      paidUserQuery += ' AND created_at <= ?';
      params.push(endDate);
    }

    const totalUsers = await db.get(userQuery, params);
    const paidUsers = await db.get(paidUserQuery, params);
    
    const conversionRate = totalUsers.count > 0 
      ? (paidUsers.count / totalUsers.count) * 100 
      : 0;

    // Get monthly signups (last 12 months)
    const monthlySignups = await db.all(`
      SELECT 
        strftime('%Y-%m', created_at) as month,
        COUNT(*) as signups
      FROM users 
      WHERE created_at >= date('now', '-12 months')
      GROUP BY strftime('%Y-%m', created_at)
      ORDER BY month
    `);

    // Get feature usage stats
    const featureUsage = await db.all(`
      SELECT 
        event,
        COUNT(*) as usage_count
      FROM analytics 
      WHERE event IN ('file_uploaded', 'workflow_created', 'workflow_executed')
        AND created_at >= date('now', '-30 days')
      GROUP BY event
    `);

    // Get funnel conversion rates
    const funnelSteps = await db.all(`
      SELECT 
        event,
        COUNT(DISTINCT user_id) as unique_users
      FROM analytics 
      WHERE event IN ('page_view', 'file_uploaded', 'workflow_created', 'plan_upgraded')
        AND user_id IS NOT NULL
        AND created_at >= date('now', '-30 days')
      GROUP BY event
    `);

    // Calculate daily active users (last 30 days)
    const dailyActiveUsers = await db.all(`
      SELECT 
        date(created_at) as date,
        COUNT(DISTINCT user_id) as active_users
      FROM analytics 
      WHERE user_id IS NOT NULL
        AND created_at >= date('now', '-30 days')
      GROUP BY date(created_at)
      ORDER BY date
    `);

    // Get top pages
    const topPages = await db.all(`
      SELECT 
        JSON_EXTRACT(properties, '$.page') as page,
        COUNT(*) as views
      FROM analytics 
      WHERE event = 'page_view'
        AND created_at >= date('now', '-30 days')
        AND JSON_EXTRACT(properties, '$.page') IS NOT NULL
      GROUP BY JSON_EXTRACT(properties, '$.page')
      ORDER BY views DESC
      LIMIT 10
    `);

    res.json({
      overview: {
        totalUsers: totalUsers.count,
        paidUsers: paidUsers.count,
        conversionRate: Math.round(conversionRate * 100) / 100
      },
      monthlySignups,
      featureUsage,
      funnelSteps,
      dailyActiveUsers,
      topPages
    });
  } catch (error) {
    logger.error('Get conversion metrics error:', error);
    res.status(500).json({ 
      error: 'Failed to fetch conversion metrics',
      code: 'METRICS_FETCH_ERROR'
    });
  }
});

// Get real-time analytics dashboard (product owner only)
router.get('/dashboard', requireProductOwner, async (req, res) => {
  try {
    const db = getDb(); // <--- ADD THIS LINE
    // Get real-time metrics (last 24 hours)
    const last24Hours = await db.all(`
      SELECT 
        strftime('%H', created_at) as hour,
        COUNT(*) as events,
        COUNT(DISTINCT user_id) as unique_users
      FROM analytics 
      WHERE created_at >= datetime('now', '-24 hours')
      GROUP BY strftime('%H', created_at)
      ORDER BY hour
    `);

    // Get current active sessions (last 30 minutes)
    const activeSessions = await db.get(`
      SELECT COUNT(DISTINCT session_id) as count
      FROM analytics 
      WHERE session_id IS NOT NULL
        AND created_at >= datetime('now', '-30 minutes')
    `);

    // Get recent events
    const recentEvents = await db.all(`
      SELECT event, properties, created_at, user_id
      FROM analytics 
      ORDER BY created_at DESC 
      LIMIT 50
    `);

    // Get error events
    const errorEvents = await db.all(`
      SELECT properties, created_at, user_id
      FROM analytics 
      WHERE event = 'error_occurred'
        AND created_at >= datetime('now', '-24 hours')
      ORDER BY created_at DESC
      LIMIT 20
    `);

    res.json({
      last24Hours,
      activeSessions: activeSessions.count || 0,
      recentEvents: recentEvents.map(event => ({
        ...event,
        properties: JSON.parse(event.properties || '{}')
      })),
      errorEvents: errorEvents.map(event => ({
        ...event,
        properties: JSON.parse(event.properties || '{}')
      }))
    });
  } catch (error) {
    logger.error('Get analytics dashboard error:', error);
    res.status(500).json({ 
      error: 'Failed to fetch dashboard data',
      code: 'DASHBOARD_FETCH_ERROR'
    });
  }
});

export default router;