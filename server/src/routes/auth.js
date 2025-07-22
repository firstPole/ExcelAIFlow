import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import { body, validationResult } from 'express-validator';
import rateLimit from 'express-rate-limit';
import { getDb } from '../database/init.js';
import { logger } from '../utils/logger.js';

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

// Rate limiting for auth endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 attempts per window
  message: {
    error: 'Too many authentication attempts, please try again later',
    code: 'AUTH_RATE_LIMIT'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Validation rules
const registerValidation = [
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Valid email is required'),
  body('password')
    .isLength({ min: 8 })
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/)
    .withMessage('Password must be at least 8 characters with uppercase, lowercase, number, and special character'),
  body('name')
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage('Name must be between 2 and 50 characters')
];

const loginValidation = [
  body('email').isEmail().normalizeEmail(),
  body('password').exists().withMessage('Password is required')
];

// Register endpoint
router.post('/register', authLimiter, registerValidation, async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ 
        error: 'Validation failed',
        details: errors.array(),
        code: 'VALIDATION_ERROR'
      });
    }
    const db = getDb();
    const { email, password, name } = req.body;

    // Check if user exists
    const existingUser = await db.get('SELECT id FROM users WHERE email = ?', [email]);
    if (existingUser) {
      return res.status(409).json({ 
        error: 'User already exists',
        code: 'USER_EXISTS'
      });
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 12);
    const userId = uuidv4();

    // Create user
    await db.run(`
      INSERT INTO users (id, email, password_hash, name, role, subscription)
      VALUES (?, ?, ?, ?, ?, ?)
    `, [userId, email, passwordHash, name, 'user', 'free']);

    // Generate token
    const token = jwt.sign(
      { userId, email, role: 'user' }, 
      JWT_SECRET, 
      { expiresIn: JWT_EXPIRES_IN }
    );

    // Get user data
    const user = await db.get(`
      SELECT id, email, name, role, subscription, usage_files, usage_workflows, usage_storage, created_at
      FROM users WHERE id = ?
    `, [userId]);

    logger.info(`New user registered: ${email}`, { userId, ip: req.ip });

    res.status(201).json({
      message: 'User created successfully',
      token,
      user: {
        ...user,
        usage: {
          processedFiles: user.usage_files,
          workflowsCreated: user.usage_workflows,
          storageUsed: user.usage_storage
        }
      }
    });
  } catch (error) {
    logger.error('Registration error:', error);
    res.status(500).json({ 
      error: 'Registration failed',
      code: 'REGISTRATION_ERROR'
    });
  }
});

// Login endpoint
router.post('/login', authLimiter, loginValidation, async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ 
        error: 'Validation failed',
        details: errors.array(),
        code: 'VALIDATION_ERROR'
      });
    }
const db = getDb();
    const { email, password } = req.body;

    // Demo account handling
    if (email === 'demo@excelflow.ai' && password === 'demo123') {
      const demoUser = {
        id: 'demo-user-id',
        email: 'demo@excelflow.ai',
        name: 'Demo User',
        role: 'user',
        subscription: 'free',
        usage: {
          processedFiles: 1,
          workflowsCreated: 2,
          storageUsed: 25
        },
        created_at: new Date().toISOString()
      };

      const token = jwt.sign(
        { userId: demoUser.id, email: demoUser.email, role: demoUser.role }, 
        JWT_SECRET, 
        { expiresIn: JWT_EXPIRES_IN }
      );
      
      logger.info(`Demo login: ${email}`, { ip: req.ip });
      
      return res.json({
        message: 'Login successful',
        token,
        user: demoUser
      });
    }

    // Product owner account
    if (email === 'owner@excelflow.ai' && password === 'owner123!') {
      const ownerUser = {
        id: 'product-owner-id',
        email: 'owner@excelflow.ai',
        name: 'Product Owner',
        role: 'product_owner',
        subscription: 'enterprise',
        usage: {
          processedFiles: 50,
          workflowsCreated: 25,
          storageUsed: 500
        },
        created_at: new Date().toISOString()
      };

      const token = jwt.sign(
        { userId: ownerUser.id, email: ownerUser.email, role: ownerUser.role }, 
        JWT_SECRET, 
        { expiresIn: JWT_EXPIRES_IN }
      );
      
      logger.info(`Product owner login: ${email}`, { ip: req.ip });
      
      return res.json({
        message: 'Login successful',
        token,
        user: ownerUser
      });
    }

    // Regular user authentication
    const user = await db.get('SELECT * FROM users WHERE email = ?', [email]);
    if (!user) {
      logger.warn(`Login attempt with non-existent email: ${email}`, { ip: req.ip });
      return res.status(401).json({ 
        error: 'Invalid credentials',
        code: 'INVALID_CREDENTIALS'
      });
    }

    const isValidPassword = await bcrypt.compare(password, user.password_hash);
    if (!isValidPassword) {
      logger.warn(`Invalid password attempt for user: ${email}`, { 
        userId: user.id, 
        ip: req.ip 
      });
      return res.status(401).json({ 
        error: 'Invalid credentials',
        code: 'INVALID_CREDENTIALS'
      });
    }

    // Update last login
    await db.run(
      'UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = ?',
      [user.id]
    );

    // Generate token
    const token = jwt.sign(
      { userId: user.id, email: user.email, role: user.role }, 
      JWT_SECRET, 
      { expiresIn: JWT_EXPIRES_IN }
    );

    logger.info(`User login successful: ${email}`, { userId: user.id, ip: req.ip });

    res.json({
      message: 'Login successful',
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        subscription: user.subscription,
        usage: {
          processedFiles: user.usage_files,
          workflowsCreated: user.usage_workflows,
          storageUsed: user.usage_storage
        },
        created_at: user.created_at
      }
    });
  } catch (error) {
    logger.error('Login error:', error);
    res.status(500).json({ 
      error: 'Login failed',
      code: 'LOGIN_ERROR'
    });
  }
});

// Get current user
router.get('/me', async (req, res) => {
  try {
    const db = getDb();
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) {
      return res.status(401).json({ 
        error: 'No token provided',
        code: 'TOKEN_MISSING'
      });
    }

    const decoded = jwt.verify(token, JWT_SECRET);
    
    // Handle demo and product owner accounts
    if (decoded.userId === 'demo-user-id') {
      return res.json({
        user: {
          id: 'demo-user-id',
          email: 'demo@excelflow.ai',
          name: 'Demo User',
          role: 'user',
          subscription: 'free',
          usage: {
            processedFiles: 1,
            workflowsCreated: 2,
            storageUsed: 25
          }
        }
      });
    }

    if (decoded.userId === 'product-owner-id') {
      return res.json({
        user: {
          id: 'product-owner-id',
          email: 'owner@excelflow.ai',
          name: 'Product Owner',
          role: 'product_owner',
          subscription: 'enterprise',
          usage: {
            processedFiles: 50,
            workflowsCreated: 25,
            storageUsed: 500
          }
        }
      });
    }

    const user = await db.get(`
      SELECT id, email, name, role, subscription, usage_files, usage_workflows, usage_storage, created_at
      FROM users WHERE id = ?
    `, [decoded.userId]);

    if (!user) {
      return res.status(404).json({ 
        error: 'User not found',
        code: 'USER_NOT_FOUND'
      });
    }

    res.json({
      user: {
        ...user,
        usage: {
          processedFiles: user.usage_files,
          workflowsCreated: user.usage_workflows,
          storageUsed: user.usage_storage
        }
      }
    });
  } catch (error) {
    logger.error('Get user error:', error);
    res.status(401).json({ 
      error: 'Invalid token',
      code: 'TOKEN_INVALID'
    });
  }
});

// Logout endpoint
router.post('/logout', (req, res) => {
  // In a production app, you might want to blacklist the token
  logger.info('User logout', { 
    userId: req.user?.userId,
    ip: req.ip 
  });
  
  res.json({ 
    message: 'Logged out successfully',
    code: 'LOGOUT_SUCCESS'
  });
});

// Refresh token endpoint
router.post('/refresh', async (req, res) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) {
      return res.status(401).json({ 
        error: 'No token provided',
        code: 'TOKEN_MISSING'
      });
    }

    const decoded = jwt.verify(token, JWT_SECRET);
    
    // Generate new token
    const newToken = jwt.sign(
      { userId: decoded.userId, email: decoded.email, role: decoded.role }, 
      JWT_SECRET, 
      { expiresIn: JWT_EXPIRES_IN }
    );

    res.json({
      token: newToken,
      message: 'Token refreshed successfully'
    });
  } catch (error) {
    logger.error('Token refresh error:', error);
    res.status(401).json({ 
      error: 'Token refresh failed',
      code: 'REFRESH_FAILED'
    });
  }
});

export default router;