// server/src/middleware/auth.js
import jwt from 'jsonwebtoken';
import { logger } from '../utils/logger.js';
import { getDb } from '../database/init.js';

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

export async function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    logger.warn('Authentication failed: No access token provided.');
    // If no token, explicitly return 401 Unauthorized.
    // This ensures routes requiring authentication will not proceed.
    return res.status(401).json({
      error: 'Authentication required: No token provided.',
      code: 'TOKEN_MISSING'
    });
  }

  try {
    const decodedUser = jwt.verify(token, JWT_SECRET); // Decoded user from token

    const db = getDb();

    // Verify if the user_id from the token actually exists in your 'users' table
    const user = await db.get('SELECT id, role FROM users WHERE id = ?', [decodedUser.userId]);

    if (!user) {
      // User ID from token does not exist in the database (e.g., user was deleted)
      logger.warn(`Authentication failed: User ID ${decodedUser.userId} from token does not exist.`);
      return res.status(401).json({
        error: 'Invalid token: User does not exist.',
        code: 'USER_NOT_FOUND'
      });
    }

    // Attach the verified user details to the request object
    req.user = { userId: user.id, role: user.role }; // Ensure userId and role are set
    logger.info(`User authenticated: ${req.user.userId}`);
    next();
  } catch (err) {
    logger.warn(`Authentication failed: ${err.message}`, {
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      errorName: err.name
    });

    if (err.name === 'TokenExpiredError') {
      return res.status(403).json({
        error: 'Token expired',
        code: 'TOKEN_EXPIRED'
      });
    }
    if (err.name === 'JsonWebTokenError') {
      return res.status(403).json({
        error: 'Invalid token',
        code: 'TOKEN_INVALID'
      });
    }
    // Generic error for unexpected JWT verification issues
    return res.status(403).json({
      error: 'Authentication failed',
      code: 'AUTH_FAILED'
    });
  }
}

// requireRole and requireProductOwner remain mostly the same,
// as they now rely on authenticateToken setting req.user correctly.

export function requireRole(roles) {
  return (req, res, next) => {
    // This check is now less likely to be hit if authenticateToken works correctly,
    // but it's a good defensive check for routes that specifically use requireRole.
    if (!req.user || !req.user.userId) {
      logger.warn('Authorization failed: User not authenticated or userId missing.');
      return res.status(401).json({
        error: 'Authentication required',
        code: 'AUTH_REQUIRED'
      });
    }

    // Ensure req.user.role is treated as an array for consistency with roles parameter
    const userRoles = Array.isArray(req.user.roles) ? req.user.roles : [req.user.role];
    const requiredRoles = Array.isArray(roles) ? roles : [roles];

    const hasRole = requiredRoles.some(role => userRoles.includes(role));

    if (!hasRole) {
      logger.warn(`Access denied: User ${req.user.userId} attempted to access ${req.path} without required role`, {
        userId: req.user.userId,
        userRoles,
        requiredRoles,
        path: req.path
      });

      return res.status(403).json({
        error: 'Insufficient permissions',
        code: 'INSUFFICIENT_PERMISSIONS',
        required: requiredRoles
      });
    }

    next();
  };
}

export function requireProductOwner(req, res, next) {
  return requireRole('product_owner')(req, res, next);
}