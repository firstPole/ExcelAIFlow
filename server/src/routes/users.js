import express from 'express';
import { getDb } from '../database/init.js'; // <--- CHANGE THIS LINE
import { v4 as uuidv4 } from 'uuid'; // Added for analytics event id

const router = express.Router();

// Get user profile
router.get('/profile', async (req, res) => { // <--- Make route handler async
  try {
    const db = getDb(); // <--- ADD THIS LINE
    const user = await db.get(` // <--- ADD await
      SELECT id, email, name, role, subscription, usage_files, usage_workflows, usage_storage, created_at
      FROM users WHERE id = ?
    `, [req.user.userId]);

    if (!user) {
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
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({ message: 'Failed to fetch profile' });
  }
});

// Update user profile
router.put('/profile', async (req, res) => { // <--- Make route handler async
  try {
    const db = getDb(); // <--- ADD THIS LINE
    const { name } = req.body;
    
    await db.run(` // <--- ADD await
      UPDATE users 
      SET name = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [name, req.user.userId]);

    res.json({ message: 'Profile updated successfully' });
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({ message: 'Failed to update profile' });
  }
});

// Upgrade subscription
router.post('/upgrade', async (req, res) => { // <--- Make route handler async
  try {
    const db = getDb(); // <--- ADD THIS LINE
    const { plan } = req.body;
    
    if (!['pro', 'enterprise'].includes(plan)) {
      return res.status(400).json({ message: 'Invalid plan' });
    }

    await db.run(` // <--- ADD await
      UPDATE users 
      SET subscription = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [plan, req.user.userId]);

    // Track upgrade event
    await db.run(` // <--- ADD await
      INSERT INTO analytics (id, user_id, event, properties)
      VALUES (?, ?, 'plan_upgraded', ?)
    `, [
      uuidv4(), // <--- Use imported uuidv4
      req.user.userId,
      JSON.stringify({ newPlan: plan, timestamp: new Date().toISOString() })
    ]);

    res.json({ message: 'Subscription upgraded successfully' });
  } catch (error) {
    console.error('Upgrade subscription error:', error);
    res.status(500).json({ message: 'Failed to upgrade subscription' });
  }
});

export default router;