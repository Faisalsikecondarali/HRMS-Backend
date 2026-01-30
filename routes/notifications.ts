import { Router, Request, Response } from 'express';
import { authenticateToken, AuthRequest, requireRole } from '../middleware/auth';
import { Notification } from '../models/Notification';
import { User } from '../models/User';
import { notifier, NotificationEvent } from '../utils/notifier';
import { verifyToken } from '../utils/jwt';

const router = Router();

// Get ALL notifications for admin (from all users) - MUST COME FIRST
router.get('/admin/all-notifications', authenticateToken, requireRole(['admin']), async (req: AuthRequest, res) => {
  try {
    const notifications = await Notification.find({}).sort({ createdAt: -1 });
    
    // Get user details for each notification
    const notificationsWithUsers = await Promise.all(
      notifications.map(async (notification) => {
        const user = await User.findById(notification.userId).select('name email role');
        return {
          id: String(notification._id),
          message: notification.message,
          type: notification.type,
          createdAt: notification.createdAt.toISOString(),
          read: notification.read,
          userId: String(notification.userId),
          user: {
            name: user?.name || 'Unknown User',
            email: user?.email || '',
            role: user?.role || 'unknown'
          }
        };
      })
    );

    res.json({
      notifications: notificationsWithUsers
    });
  } catch (err) {
    console.error('List all notifications error:', err);
    res.status(500).json({ message: 'Server error listing all notifications' });
  }
});

// Get notifications for a user (self or admin can fetch)
router.get('/:userId', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const { userId } = req.params;
    const isAdmin = req.user!.role === 'admin';
    
    // Users can only see their own notifications, admin can see any user's notifications
    if (!isAdmin && req.user!.userId !== userId) {
      return res.status(403).json({ message: 'Access denied' });
    }

    const notifications = await Notification.find({ userId }).sort({ createdAt: -1 });
    res.json({
      notifications: notifications.map((n) => ({
        id: String(n._id),
        message: n.message,
        type: n.type,
        createdAt: n.createdAt.toISOString(),
        read: n.read,
      })),
    });
  } catch (err) {
    console.error('List notifications error:', err);
    res.status(500).json({ message: 'Server error listing notifications' });
  }
});

// Mark one notification as read
router.patch('/:id/read', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const n = await Notification.findById(id);
    if (!n) return res.status(404).json({ message: 'Not found' });

    const isAdmin = req.user!.role === 'admin';
    if (!isAdmin && String(n.userId) !== req.user!.userId) {
      return res.status(403).json({ message: 'Access denied' });
    }

    n.read = true;
    await n.save();
    res.json({ message: 'Marked as read' });
  } catch (err) {
    console.error('Mark notification read error:', err);
    res.status(500).json({ message: 'Server error updating notification' });
  }
});

// Mark all as read for user
router.patch('/user/:userId/read-all', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const { userId } = req.params;
    const isAdmin = req.user!.role === 'admin';
    if (!isAdmin && req.user!.userId !== userId) {
      return res.status(403).json({ message: 'Access denied' });
    }

    await Notification.updateMany({ userId }, { $set: { read: true } });
    res.json({ message: 'All marked as read' });
  } catch (err) {
    console.error('Mark all notifications read error:', err);
    res.status(500).json({ message: 'Server error updating notifications' });
  }
});

// Clear all notifications for user
router.delete('/user/:userId/clear-all', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const { userId } = req.params;
    const isAdmin = req.user!.role === 'admin';
    if (!isAdmin && req.user!.userId !== userId) {
      return res.status(403).json({ message: 'Access denied' });
    }

    await Notification.deleteMany({ userId });
    res.json({ message: 'All notifications cleared' });
  } catch (err) {
    console.error('Clear all notifications error:', err);
    res.status(500).json({ message: 'Server error clearing notifications' });
  }
});

// Create notification (for testing)
router.post('/create', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const { type, message } = req.body;
    const userId = req.user!.userId;
    
    if (!type || !message) {
      return res.status(400).json({ message: 'Type and message are required' });
    }
    
    const notification = await Notification.create({
      userId,
      type,
      message,
      read: false
    });
    
    res.json({
      success: true,
      notification: {
        id: String(notification._id),
        type: notification.type,
        message: notification.message,
        read: notification.read,
        createdAt: notification.createdAt.toISOString()
      }
    });
  } catch (err) {
    console.error('Create notification error:', err);
    res.status(500).json({ message: 'Server error creating notification' });
  }
});

// Server-Sent Events stream for real-time notifications
router.get('/stream', (req: Request, res: Response) => {
  try {
    const token = (req.query.token as string) || '';
    if (!token) {
      return res.end();
    }
    let userId: string;
    try {
      const payload = verifyToken(token);
      userId = payload.userId;
    } catch {
      // Invalid or expired token: close stream quietly without 401
      return res.end();
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

    const send = (evt: NotificationEvent) => {
      if (evt.userId === userId) {
        res.write(`event: notify\n`);
        res.write(`data: ${JSON.stringify(evt)}\n\n`);
      }
    };

    // Initial ping to establish the stream
    res.write(`event: ping\n`);
    res.write(`data: ${JSON.stringify({ ok: true, ts: Date.now() })}\n\n`);

    notifier.on('notify', send);

    req.on('close', () => {
      notifier.off('notify', send);
      res.end();
    });
  } catch {
    // Any other error: close quietly
    res.end();
  }
});

export default router;
