// server/src/database/init.js
import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import pg from 'pg'; // Keep pg for PostgreSQL support
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { logger } from '../utils/logger.js';
import { v4 as uuidv4 } from 'uuid'; // Added for default product owner ID
import bcrypt from 'bcryptjs'; // Added for password hashing

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let _dbInstance = null; // Renamed to _dbInstance for clarity

// Database configuration
const config = {
  type: process.env.DB_TYPE || 'sqlite',
  sqlite: {
    filename: process.env.NODE_ENV === 'production'
      ? path.join(__dirname, '../../data/production.db')
      : path.join(__dirname, '../../data/development.db')
  },
  postgres: {
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 5432,
    database: process.env.DB_NAME || 'excelflow_ai',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || '',
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
  }
};

// SQL Schema
const schema = `
  -- Users table
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    name TEXT NOT NULL,
    role TEXT DEFAULT 'user' CHECK (role IN ('user', 'admin', 'product_owner')),
    subscription TEXT DEFAULT 'free' CHECK (subscription IN ('free', 'pro', 'enterprise')),
    usage_files INTEGER DEFAULT 0,
    usage_workflows INTEGER DEFAULT 0,
    usage_storage INTEGER DEFAULT 0,
    email_verified BOOLEAN DEFAULT FALSE,
    last_login DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    settings TEXT -- ADDED: New settings column for user-specific configurations
  );

  -- Files table
  CREATE TABLE IF NOT EXISTS files (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    filename TEXT NOT NULL,
    original_name TEXT NOT NULL,
    size INTEGER NOT NULL,
    mime_type TEXT NOT NULL,
    file_path TEXT NOT NULL,
    processed_data TEXT,
    status TEXT DEFAULT 'uploaded' CHECK (status IN ('uploaded', 'processing', 'processed', 'error')),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
  );

  -- Workflows table
  CREATE TABLE IF NOT EXISTS workflows (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    tasks TEXT NOT NULL,
    files TEXT DEFAULT '[]',
    status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'running', 'completed', 'failed', 'paused')),
    results TEXT,
    execution_time INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
  );

  -- Workflow results table
  CREATE TABLE IF NOT EXISTS workflow_results (
    id TEXT PRIMARY KEY,
    workflow_id TEXT NOT NULL,
    task_id TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('pending', 'running', 'completed', 'failed')),
    output TEXT,
    error TEXT,
    metrics TEXT,
    started_at DATETIME,
    completed_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (workflow_id) REFERENCES workflows (id) ON DELETE CASCADE
  );

  -- Analytics table
  CREATE TABLE IF NOT EXISTS analytics (
    id TEXT PRIMARY KEY,
    user_id TEXT,
    session_id TEXT,
    event TEXT NOT NULL,
    properties TEXT,
    ip_address TEXT,
    user_agent TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE SET NULL
  );

  -- API keys table (for enterprise users)
  CREATE TABLE IF NOT EXISTS api_keys (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    key_hash TEXT NOT NULL,
    name TEXT NOT NULL,
    permissions TEXT DEFAULT '[]',
    last_used DATETIME,
    expires_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
  );

  -- Indexes for performance
  CREATE INDEX IF NOT EXISTS idx_users_email ON users (email);
  CREATE INDEX IF NOT EXISTS idx_files_user_id ON files (user_id);
  CREATE INDEX IF NOT EXISTS idx_workflows_user_id ON workflows (user_id);
  CREATE INDEX IF NOT EXISTS idx_workflows_status ON workflows (status);
  CREATE INDEX IF NOT EXISTS idx_workflow_results_workflow_id ON workflow_results (workflow_id);
  CREATE INDEX IF NOT EXISTS idx_analytics_user_id ON analytics (user_id);
  CREATE INDEX IF NOT EXISTS idx_analytics_event ON analytics (event);
  CREATE INDEX IF NOT EXISTS idx_analytics_created_at ON analytics (created_at);
  CREATE INDEX IF NOT EXISTS idx_api_keys_user_id ON api_keys (user_id);
`;

// Initialize SQLite database
async function initSQLite() {
  try {
    // Ensure data directory exists
    const dataDir = path.dirname(config.sqlite.filename);
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    console.log('Server attempting to open SQLite DB at:', config.sqlite.filename);
    _dbInstance = await open({ // Assign to _dbInstance
      filename: config.sqlite.filename,
      driver: sqlite3.Database
    });

    // Enable foreign keys
    await _dbInstance.exec('PRAGMA foreign_keys = ON');
    await _dbInstance.exec('PRAGMA journal_mode = WAL');
    await _dbInstance.exec('PRAGMA synchronous = NORMAL');
    await _dbInstance.exec('PRAGMA cache_size = 1000');
    await _dbInstance.exec('PRAGMA temp_store = MEMORY');

    // Create tables (this will create the 'users' table with 'settings' if it doesn't exist)
    await _dbInstance.exec(schema);

    // IMPORTANT: Add 'settings' column if it doesn't exist for SQLite
    // FIX: Removed 'IF NOT EXISTS' from ALTER TABLE ADD COLUMN for SQLite compatibility.
    // The .catch block handles the "duplicate column name" error gracefully.
    await _dbInstance.exec(`ALTER TABLE users ADD COLUMN settings TEXT;`) // <<< THIS LINE IS FIXED
        .then(() => logger.info('Ensured "settings" column exists in "users" table (SQLite).'))
        .catch(err => {
            // This catch block will specifically handle the "duplicate column name" error
            // if the column already exists, which is fine. Other errors should still be logged.
            if (!err.message.includes('duplicate column name: settings')) {
                logger.error('Error adding "settings" column to "users" table (SQLite):', err);
            } else {
                logger.info('"settings" column already exists in "users" table (SQLite), skipping.');
            }
        });


    logger.info(`✅ SQLite database initialized: ${config.sqlite.filename}`);
    return _dbInstance;
  } catch (error) {
    logger.error('❌ SQLite initialization failed:', error);
    throw error;
  }
}

// Initialize PostgreSQL database
async function initPostgreSQL() {
  try {
    const { Pool } = pg;
    const pool = new Pool(config.postgres);

    // Test connection
    const client = await pool.connect();
    await client.query('SELECT NOW()');
    client.release();

    // Create a wrapper to match SQLite interface
    _dbInstance = { // Assign to _dbInstance
      async get(sql, params = []) {
        const client = await pool.connect();
        try {
          const result = await client.query(sql, params);
          return result.rows[0] || null;
        } finally {
          client.release();
        }
      },

      async all(sql, params = []) {
        const client = await pool.connect();
        try {
          const result = await client.query(sql, params);
          return result.rows;
        } finally {
          client.release();
        }
      },

      async run(sql, params = []) {
        const client = await pool.connect();
        try {
          const result = await client.query(sql, params);
          return { changes: result.rowCount };
        } finally {
          client.release();
        }
      },

      async exec(sql) {
        const client = await pool.connect();
        try {
          await client.query(sql);
        } finally {
          client.release();
        }
      }
    };

    // Convert SQLite schema to PostgreSQL
    // Note: PostgreSQL does not support `IF NOT EXISTS` on `ADD COLUMN` within a `CREATE TABLE` statement
    // but it does support it for `ALTER TABLE ADD COLUMN`.
    // The `TEXT PRIMARY KEY` replacement should use `VARCHAR(255)` or `TEXT` with `PRIMARY KEY`
    // and `DEFAULT gen_random_uuid()` for UUIDs.
    // Given the schema is already defined with `TEXT PRIMARY KEY`, for PostgreSQL we'd typically
    // use `UUID PRIMARY KEY DEFAULT gen_random_uuid()`.
    // This conversion is more complex than a simple string replace.
    // For now, let's just ensure the settings column is added.
    const pgSchema = schema
      .replace(/TEXT PRIMARY KEY/g, 'TEXT PRIMARY KEY') // Keep as TEXT PRIMARY KEY for now, UUID handled by alter
      .replace(/DATETIME DEFAULT CURRENT_TIMESTAMP/g, 'TIMESTAMP DEFAULT NOW()')
      .replace(/DATETIME/g, 'TIMESTAMP')
      .replace(/BOOLEAN/g, 'BOOLEAN')
      .replace(/INTEGER/g, 'INTEGER')
      .replace(/CHECK \([^)]+\)/g, ''); // Remove CHECK constraints for simplicity


    await _dbInstance.exec(pgSchema); // Use _dbInstance to create tables

    // IMPORTANT: Add 'settings' column if it doesn't exist for PostgreSQL
    // PostgreSQL supports `ADD COLUMN IF NOT EXISTS`
    await _dbInstance.exec(`ALTER TABLE users ADD COLUMN IF NOT EXISTS settings TEXT;`)
        .then(() => logger.info('Ensured "settings" column exists in "users" table (PostgreSQL).'))
        .catch(err => {
            // PostgreSQL will typically not error if IF NOT EXISTS is used and column exists.
            // But if it does, log it.
            logger.error('Error adding "settings" column to "users" table (PostgreSQL):', err);
        });

    logger.info(`✅ PostgreSQL database initialized: ${config.postgres.host}:${config.postgres.port}/${config.postgres.database}`);
    return _dbInstance;
  } catch (error) {
    logger.error('❌ PostgreSQL initialization failed:', error);
    throw error;
  }
}

// Main initialization function
export async function initializeDatabase() {
  try {
    if (_dbInstance) { // Check if already initialized
      logger.info('Database already initialized.', { service: 'excelflow-ai' });
      return _dbInstance;
    }

    if (config.type === 'postgres') {
      await initPostgreSQL();
    } else {
      await initSQLite();
    }

    // NEW: Create or ensure Demo User exists
    await createDemoUser(); // <--- ADD THIS CALL

    // Create default product owner if not exists
    await createDefaultProductOwner();

    logger.info('🗄️ Database initialization completed successfully');
    return _dbInstance; // Return the initialized instance
  } catch (error) {
    logger.error('❌ Database initialization failed:', error);
    process.exit(1);
  }
}

// NEW: Function to create the demo user
async function createDemoUser() {
  try {
    const demoUserId = 'demo-user-id';
    const demoUserEmail = 'demo@excelflow.ai';
    const demoUserPassword = 'demo';
    const hashedPassword = await bcrypt.hash(demoUserPassword, 10);

    const existingDemoUser = await _dbInstance.get(
      'SELECT id FROM users WHERE id = ?',
      [demoUserId]
    );

    if (!existingDemoUser) {
      await _dbInstance.run(`
        INSERT INTO users (id, email, password_hash, name, role, subscription, email_verified)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `, [
        demoUserId,
        demoUserEmail,
        hashedPassword,
        'Demo User',
        'user',
        'free',
        true
      ]);
      logger.info('✅ Demo user created: demo@excelflow.ai / demo');
    } else {
      logger.info('ℹ️ Demo user already exists.');
    }
  } catch (error) {
    logger.warn('⚠️ Could not create demo user:', error); // Log the full error object
  }
}


// Create default product owner account (existing function, ensure _dbInstance is used)
async function createDefaultProductOwner() {
  try {
    // Use _dbInstance here
    const existingOwner = await _dbInstance.get(
      'SELECT id FROM users WHERE role = ? LIMIT 1',
      ['product_owner']
    );

    if (!existingOwner) {
      // You already have bcrypt and uuidv4 imported at the top now
      const passwordHash = await bcrypt.hash('owner123!', 12);
      const ownerId = uuidv4();

      await _dbInstance.run(`
        INSERT INTO users (id, email, password_hash, name, role, subscription, email_verified)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `, [
        ownerId,
        'owner@excelflow.ai',
        passwordHash,
        'Product Owner',
        'product_owner',
        'enterprise',
        true
      ]);

      logger.info('✅ Default product owner created: owner@excelflow.ai / owner123!');
    } else {
        logger.info('ℹ️ Default product owner already exists.');
    }
  } catch (error) {
    logger.warn('⚠️ Could not create default product owner:', error.message);
  }
}

// Export a function to get the DB instance. This is the correct way.
export function getDb() {
  if (!_dbInstance) {
    // This indicates a critical error: a route handler or service tried to access
    // the database before initializeDatabase() successfully completed.
    logger.error('Attempted to access database before it was initialized.');
    throw new Error('Database connection not established. Server might not be fully ready.');
  }
  return _dbInstance;
}
