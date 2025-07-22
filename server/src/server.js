import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import 'express-async-errors';

// --- Imports for File Upload Route (Moved from files.js) ---
import multer from 'multer';
import fs from 'fs'; // For synchronous fs.existsSync and fs.mkdirSync
import fsp from 'fs/promises'; // For async file operations (readFile, unlink, access)
import { v4 as uuidv4 } from 'uuid';
import XLSX from 'xlsx';
import Papa from 'papaparse';
// --- End Imports for File Upload Route ---

// Import routes
import authRoutes from './routes/auth.js';
import fileRoutes from './routes/files.js'; // This will now only contain GET/DELETE routes
import workflowRoutes from './routes/workflows.js';
import analyticsRoutes from './routes/analytics.js';
import userRoutes from './routes/users.js';

// Import middleware
import { errorHandler } from './middleware/errorHandler.js';
import { authenticateToken } from './middleware/auth.js';
import { logger } from './utils/logger.js';

// Import database
import { initializeDatabase, getDb } from './database/init.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

const app = express();
const PORT = process.env.PORT || 8000;
const NODE_ENV = process.env.NODE_ENV || 'development';

// Initialize database
await initializeDatabase();

// Trust proxy for production deployment
app.set('trust proxy', 1);

// Security middleware
app.use(helmet({
  crossOriginEmbedderPolicy: false,
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
    },
  },
}));

app.use(compression());

// Rate limiting - more restrictive in production
const limiter = rateLimit({
  windowMs: NODE_ENV === 'production' ? 15 * 60 * 1000 : 60 * 1000, // 15 min in prod, 1 min in dev
  max: NODE_ENV === 'production' ? 100 : 1000, // 100 requests in prod, 1000 in dev
  message: {
    error: 'Too many requests from this IP, please try again later.',
    retryAfter: NODE_ENV === 'production' ? 15 * 60 : 60
  },
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api/', limiter);

// CORS configuration
const corsOptions = {
  origin: function (origin, callback) {
    const allowedOrigins = NODE_ENV === 'production' 
      ? (process.env.ALLOWED_ORIGINS || '').split(',').filter(Boolean)
      : ['http://localhost:5173', 'http://localhost:3000', 'http://127.0.0.1:5173'];
    
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  optionsSuccessStatus: 200
};

app.use(cors(corsOptions));

// --- Multer Configuration for File Uploads (Moved from files.js) ---
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(process.cwd(), 'uploads');
    if (!fs.existsSync(uploadDir)) {
      try {
        fs.mkdirSync(uploadDir, { recursive: true });
        console.log(`[Backend] Created upload directory: ${uploadDir}`);
      } catch (err) {
        console.error('[Backend] Error creating upload directory synchronously:', err);
        return cb(err);
      }
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueName = `${uuidv4()}-${file.originalname}`;
    cb(null, uniqueName);
  }
});

const upload = multer({
  storage,
  // --- TEMPORARILY COMMENTING OUT fileFilter and limits for debugging ---
  // limits: {
  //   fileSize: parseInt(process.env.MAX_FILE_SIZE || '104857600') // Default to 100MB
  // },
  // fileFilter: (req, file, cb) => {
  //   const allowedTypes = [
  //     'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
  //     'application/vnd.ms-excel', // .xls
  //     'text/csv'
  //   ];
    
  //   if (allowedTypes.includes(file.mimetype)) {
  //     cb(null, true);
  //   } else {
  //     const error = new Error(`Invalid file type: ${file.mimetype}. Only Excel and CSV files are allowed.`);
  //     console.error('[Backend] File filter rejected file:', error.message);
  //     cb(error);
  //   }
  // }
});

// Process file data function (Moved from files.js)
async function processFileData(filePath, mimeType) {
  try {
    const fileExists = await fsp.access(filePath)
      .then(() => true)
      .catch(() => false);

    if (!fileExists) {
      throw new Error(`File not found at path: ${filePath}. Multer might have failed to save it.`);
    }

    if (mimeType.includes('sheet') || mimeType.includes('excel')) {
      const workbook = XLSX.readFile(filePath);
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
      
      const headers = jsonData[0] || [];
      const rows = jsonData.slice(1);
      
      return {
        headers,
        rows,
        metadata: {
          rowCount: rows.length,
          columnCount: headers.length,
          fileType: 'excel',
          hasHeaders: true
        }
      };
    } else if (mimeType.includes('csv')) {
      const csvData = await fsp.readFile(filePath, 'utf8');
      const parsed = Papa.parse(csvData, { header: false, skipEmptyLines: true });
      
      const headers = parsed.data[0] || [];
      const rows = parsed.data.slice(1);
      
      return {
        headers,
        rows,
        metadata: {
          rowCount: rows.length,
          columnCount: headers.length,
          fileType: 'csv',
          hasHeaders: true
        }
      };
    } else {
        throw new Error('Unsupported file type for processing.');
    }
  } catch (error) {
    console.error(`[Backend] Error in processFileData for ${filePath}:`, error);
    throw new Error(`Failed to process file: ${error.message}`);
  }
}

// --- File Upload Endpoint (Moved here, placed BEFORE express.json/urlencoded) ---
app.post('/api/files/upload', authenticateToken, (req, res, next) => {
  // Log request headers BEFORE multer processes the body
  console.log('[Backend] Incoming /api/files/upload request headers:', {
    'content-type': req.headers['content-type'],
    'content-length': req.headers['content-length'],
    'user-agent': req.headers['user-agent'],
    'authorization': req.headers['authorization'] ? 'Bearer ...' : 'None'
  });
  upload.single('file')(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      // A Multer error occurred when uploading.
      console.error('[Backend] MulterError during upload:', err.code, err.message);
      return res.status(400).json({ message: `File upload failed: ${err.message}`, code: err.code });
    } else if (err) {
      // An unknown error occurred when uploading.
      console.error('[Backend] Unknown error during upload:', err);
      return res.status(500).json({ message: `File upload failed: ${err.message}` });
    }
    // If no error, proceed to the next middleware/route handler
    next();
  });
}, async (req, res) => { // This is the actual route handler after multer
  try {
    console.log('[Backend] req.file after multer (in server.js):', req.file);
    console.log('[Backend] req.body after multer (should be empty for multipart):', req.body); // Should be empty

    if (!req.file) {
      console.warn('[Backend] No file received by multer. This might be due to fileFilter, limits, or missing file in request.');
      return res.status(400).json({ message: 'No file uploaded' });
    }

    const db = getDb();
    const fileId = uuidv4();
    
    const processedData = await processFileData(req.file.path, req.file.mimetype);

    const filePathForDb = req.file.path.replace(/\\/g, '/');

    console.log('[Backend] Inserting file into DB:', {
      fileId,
      userId: req.user.userId,
      filename: req.file.filename,
      originalName: req.file.originalname,
      size: req.file.size,
      mimeType: req.file.mimetype,
      filePath: filePathForDb,
      processedDataString: JSON.stringify(processedData)
    });

    await db.run(`
      INSERT INTO files (id, user_id, filename, original_name, size, mime_type, file_path, processed_data, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      fileId,
      req.user.userId,
      req.file.filename,
      req.file.originalname,
      req.file.size,
      req.file.mimetype,
      filePathForDb,
      JSON.stringify(processedData),
      new Date().toISOString()
    ]);

    await db.run(` 
      UPDATE users 
      SET usage_files = usage_files + 1, 
          usage_storage = usage_storage + ?
      WHERE id = ?
    `, [Math.round(req.file.size / 1024 / 1024), req.user.userId]);

    res.json({
      id: fileId,
      filename: req.file.filename,
      originalName: req.file.originalname,
      size: req.file.size,
      mimeType: req.file.mimetype,
      processedData,
      uploadedAt: new Date().toISOString()
    });
  } catch (error) {
    console.error('[Backend] File upload route handler error (in server.js):', error);
    if (req.file && req.file.path) {
      try {
        await fsp.unlink(req.file.path);
        console.log(`[Backend] Cleaned up partially uploaded file: ${req.file.path}`);
      } catch (cleanupError) {
        console.warn(`[Backend] Error cleaning up file ${req.file.path}:`, cleanupError);
      }
    }
    res.status(500).json({ message: error.message || 'File upload failed unexpectedly' });
  }
});
// --- End File Upload Endpoint ---


// Body parsing middleware (these should now come AFTER the multer upload route)
app.use(express.json({ 
  limit: process.env.JSON_LIMIT || '10mb',
  verify: (req, res, buf) => {
    req.rawBody = buf;
  }
}));
app.use(express.urlencoded({ 
  extended: true, 
  limit: process.env.URL_ENCODED_LIMIT || '10mb' 
}));

// Logging
if (NODE_ENV === 'production') {
  app.use(morgan('combined', { stream: { write: message => logger.info(message.trim()) } }));
} else {
  app.use(morgan('dev'));
}

// Static files for uploads
const uploadsDir = path.join(__dirname, '../uploads');
app.use('/uploads', express.static(uploadsDir));

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version || '1.0.0',
    environment: NODE_ENV,
    uptime: process.uptime()
  });
});

// API Routes (other routes, files.js will now only contain GET/DELETE)
app.use('/api/auth', authRoutes);
app.use('/api/files', authenticateToken, fileRoutes); // files.js will now only handle GET/DELETE
app.use('/api/workflows', authenticateToken, workflowRoutes);
app.use('/api/analytics', authenticateToken, analyticsRoutes);
app.use('/api/users', authenticateToken, userRoutes);

// TEMPORARY DEBUG ROUTE
app.get('/debug/workflow-results/:id', async (req, res) => {
  try {
    const db = getDb();
    const workflowId = req.params.id;

    console.log(`DEBUG: Attempting to fetch results for workflow ID: ${workflowId}`);

    const allResultsTest = await db.all(`SELECT * FROM workflow_results`);
    console.log('DEBUG: All workflow_results (count):', allResultsTest.length);
    console.log('DEBUG: First 5 allResultsTest entries (if any):', allResultsTest.slice(0, 5));

    const filteredResults = await db.all(`
      SELECT * FROM workflow_results
      WHERE workflow_id = ?
      ORDER BY created_at ASC
    `, [workflowId]);

    console.log(`DEBUG: Filtered results for ID ${workflowId}:`, filteredResults);
    console.log(`DEBUG: Filtered results count for ID ${workflowId}:`, filteredResults.length);

    res.json({
      workflowId: workflowId,
      allResultsCount: allResultsTest.length,
      filteredResultsCount: filteredResults.length,
      filteredResults: filteredResults
    });

  } catch (error) {
    console.error('DEBUG: Error fetching workflow results:', error);
    res.status(500).json({ message: 'DEBUG: Failed to fetch workflow results', error: error.message });
  }
});


// Serve frontend in production
if (NODE_ENV === 'production') {
  const frontendPath = path.join(__dirname, '../../dist');
  app.use(express.static(frontendPath));
  
  app.get('*', (req, res) => {
    res.sendFile(path.join(frontendPath, 'index.html'));
  });
}

// Error handling middleware
app.use(errorHandler);

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({ 
    error: 'Route not found',
    path: req.originalUrl,
    method: req.method
  });
});

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully');
  process.exit(0);
});

process.on('SIGINT', () => {
  logger.info('SIGINT received, shutting down gracefully');
  process.exit(0);
});

app.listen(PORT, '0.0.0.0', () => {
  logger.info(`🚀 ExcelFlow AI Backend running on port ${PORT}`);
  logger.info(`📊 Environment: ${NODE_ENV}`);
  logger.info(`🗄️  Database: ${process.env.DB_TYPE || 'SQLite'}`);
  logger.info(`🔒 Security: Enhanced with Helmet, CORS, Rate Limiting`);
});

export default app;