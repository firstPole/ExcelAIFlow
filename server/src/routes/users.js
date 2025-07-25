// server/src/routes/user.js
import express from 'express';
import { getDb } from '../database/init.js'; // Ensure this path is correct
import { v4 as uuidv4 } from 'uuid';
import { authenticateToken } from '../middleware/auth.js'; // Add this import for authentication
import { logger } from '../utils/logger.js'; // Add this import for logging

const router = express.Router();

// Middleware for all user routes (assuming you want all user routes to be authenticated)
// If you only want /settings to be authenticated, you can apply authenticateToken directly to those routes.
// router.use(authenticateToken);

// Get user profile
router.get('/profile', authenticateToken, async (req, res) => { // Added authenticateToken
  try {
    const db = getDb();
    const user = await db.get(`
      SELECT id, email, name, role, subscription, usage_files, usage_workflows, usage_storage, created_at
      FROM users WHERE id = ?
    `, [req.user.userId]); // Access userId from req.user after authentication

    if (!user) {
      logger.warn(`[Backend] User ${req.user.userId} not found when fetching profile.`);
      return res.status(404).json({ message: 'User not found' });
    }

    res.json({
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
      createdAt: user.created_at
    });
    logger.info(`[Backend] Fetched profile for user ${req.user.userId}.`);
  } catch (error) {
    logger.error('[Backend] Get profile error:', error);
    res.status(500).json({ message: 'Failed to fetch profile' });
  }
});

// Update user profile
router.put('/profile', authenticateToken, async (req, res) => { // Added authenticateToken
  try {
    const db = getDb();
    const { name } = req.body;

    await db.run(`
      UPDATE users
      SET name = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [name, req.user.userId]); // Access userId from req.user after authentication

    res.json({ message: 'Profile updated successfully' });
    logger.info(`[Backend] Updated profile for user ${req.user.userId}.`);
  } catch (error) {
    logger.error('[Backend] Update profile error:', error);
    res.status(500).json({ message: 'Failed to update profile' });
  }
});

// Upgrade subscription
router.post('/upgrade', authenticateToken, async (req, res) => { // Added authenticateToken
  try {
    const db = getDb();
    const { plan } = req.body;

    if (!['pro', 'enterprise'].includes(plan)) {
      return res.status(400).json({ message: 'Invalid plan' });
    }

    await db.run(`
      UPDATE users
      SET subscription = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [plan, req.user.userId]); // Access userId from req.user after authentication

    // Track upgrade event
    await db.run(`
      INSERT INTO analytics (id, user_id, event, properties)
      VALUES (?, ?, 'plan_upgraded', ?)
    `, [
      uuidv4(),
      req.user.userId,
      JSON.stringify({ newPlan: plan, timestamp: new Date().toISOString() })
    ]);

    res.json({ message: 'Subscription upgraded successfully' });
    logger.info(`[Backend] Upgraded subscription for user ${req.user.userId} to ${plan}.`);
  } catch (error) {
    logger.error('[Backend] Upgrade subscription error:', error);
    res.status(500).json({ message: 'Failed to upgrade subscription' });
  }
});

// GET user settings (new endpoint)
router.get('/settings', authenticateToken, async (req, res) => {
  try {
    const db = getDb();
    const userId = req.user.userId;

    const user = await db.get('SELECT settings, profile, notification_settings FROM users WHERE id = ?', [userId]);

    if (!user) {
      logger.warn(`[Backend] User ${userId} not found when fetching settings.`);
      return res.status(404).json({ message: 'User not found.' });
    }

    let settings = {};
    if (user.settings) {
      try {
        settings = JSON.parse(user.settings);
      } catch (e) {
        logger.error(`[Backend] Failed to parse settings for user ${userId}:`, e);
        settings = {}; // Fallback to empty object if parsing fails
      }
    }

    let profile = {};
    if (user.profile) {
      try {
        profile = JSON.parse(user.profile);
      } catch (e) {
        logger.error(`[Backend] Failed to parse profile for user ${userId}:`, e);
        profile = {};
      }
    }

    let notificationSettings = {};
    if (user.notification_settings) {
      try {
        notificationSettings = JSON.parse(user.notification_settings);
      } catch (e) {
        logger.error(`[Backend] Failed to parse notification settings for user ${userId}:`, e);
        notificationSettings = {};
      }
    }

    const fullUserSettings = {
      profile: profile,
      settings: settings,
      notificationSettings: notificationSettings,
    };

    logger.info(`[Backend] Fetched settings for user ${userId}.`);
    res.json(fullUserSettings);

  } catch (error) {
    logger.error('[Backend] Error fetching user settings:', error);
    res.status(500).json({ message: 'Failed to fetch user settings', error: error.message });
  }
});

// PUT (update) user settings (new endpoint)
router.put('/settings', authenticateToken, async (req, res) => {
  try {
    const db = getDb();
    const userId = req.user.userId;
    const { profile, settings, notificationSettings } = req.body;

    const existingUser = await db.get('SELECT settings, profile, notification_settings FROM users WHERE id = ?', [userId]);

    let currentSettings = existingUser?.settings ? JSON.parse(existingUser.settings) : {};
    let currentProfile = existingUser?.profile ? JSON.parse(existingUser.profile) : {};
    let currentNotificationSettings = existingUser?.notification_settings ? JSON.parse(existingUser.notification_settings) : {};

    const updatedSettings = JSON.stringify({ ...currentSettings, ...settings });
    const updatedProfile = JSON.stringify({ ...currentProfile, ...profile });
    const updatedNotificationSettings = JSON.stringify({ ...currentNotificationSettings, ...notificationSettings });

    await db.run(
      `UPDATE users SET settings = ?, profile = ?, notification_settings = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [updatedSettings, updatedProfile, updatedNotificationSettings, userId]
    );

    logger.info(`[Backend] Updated settings for user ${userId}.`);
    res.json({ message: 'User settings updated successfully' });

  } catch (error) {
    logger.error('[Backend] Error updating user settings:', error);
    res.status(500).json({ message: 'Failed to update user settings', error: error.message });
  }
});

export default router;
