// server/src/routes/files.js
import express from 'express';
import fsp from 'fs/promises'; // Use fs.promises for async file operations
import { getDb } from '../database/init.js';
import { authenticateToken } from '../middleware/auth.js'; // Import authentication middleware

const router = express.Router();

// Note: The /upload route has been moved to server.js to ensure Multer runs before body parsers.

// Get user files
router.get('/', authenticateToken, async (req, res) => {
  try {
    const db = getDb();
    const files = await db.all(` 
      SELECT id, filename, original_name, size, mime_type, created_at, processed_data
      FROM files 
      WHERE user_id = ?
      ORDER BY created_at DESC
    `, [req.user.userId]);

    res.json(files.map(file => ({
      id: file.id,
      filename: file.filename,
      originalName: file.original_name,
      size: file.size,
      mimeType: file.mime_type,
      uploadedAt: file.created_at,
      processedData: JSON.parse(file.processed_data || '{}')
    })));
  } catch (error) {
    console.error('[Backend] Get files error:', error);
    res.status(500).json({ message: 'Failed to fetch files' });
  }
});

// Get file data
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const db = getDb();
    const file = await db.get(` 
      SELECT * FROM files 
      WHERE id = ? AND user_id = ?
    `, [req.params.id, req.user.userId]);

    if (!file) {
      return res.status(404).json({ message: 'File not found' });
    }

    res.json({
      id: file.id,
      filename: file.filename,
      originalName: file.original_name,
      size: file.size,
      mimeType: file.mime_type,
      processedData: JSON.parse(file.processed_data || '{}'),
      uploadedAt: file.created_at
    });
  } catch (error) {
    console.error('[Backend] Get file error:', error);
    res.status(500).json({ message: 'Failed to fetch file' });
  }
});

// Delete file
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const db = getDb();
    const file = await db.get(` 
      SELECT * FROM files 
      WHERE id = ? AND user_id = ?
    `, [req.params.id, req.user.userId]);

    if (!file) {
      return res.status(404).json({ message: 'File not found' });
    }

    if (file.file_path) {
      try {
        await fsp.unlink(file.file_path);
        console.log(`[Backend] Deleted file from filesystem: ${file.file_path}`);
      } catch (unlinkError) {
        console.warn(`[Backend] Could not delete file from filesystem (may not exist): ${file.file_path}, Error: ${unlinkError.message}`);
      }
    }

    await db.run('DELETE FROM files WHERE id = ?', [req.params.id]);

    await db.run(` 
      UPDATE users 
      SET usage_files = usage_files - 1,
          usage_storage = usage_storage - ?
      WHERE id = ?
    `, [Math.round(file.size / 1024 / 1024), req.user.userId]);

    res.json({ message: 'File deleted successfully' });
  } catch (error) {
    console.error('Delete file error:', error);
    res.status(500).json({ message: 'Failed to delete file' });
  }
});

export default router;