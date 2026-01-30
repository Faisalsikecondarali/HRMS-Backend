import { Router } from 'express';
import mongoose from 'mongoose';
import { authenticateToken, requireRole, AuthRequest } from '../middleware/auth';
import { ShiftAssignment } from '../models/ShiftAssignment';
import { createAndNotify } from '../utils/notifier';

const router = Router();

// Admin: list assignments with filters
router.get('/', authenticateToken, requireRole(['admin']), async (req: AuthRequest, res) => {
  try {
    const { from, to, userId } = req.query as { from?: string; to?: string; userId?: string };
    const filter: any = {};
    if (from) filter.date = { ...(filter.date || {}), $gte: from };
    if (to) filter.date = { ...(filter.date || {}), $lte: to };
    if (userId && mongoose.isValidObjectId(userId)) filter.userId = userId;
    const list = await ShiftAssignment.find(filter).sort({ date: 1 }).lean();
    res.json({ assignments: list.map(a => ({ id: String(a._id), userId: String(a.userId), date: a.date, startTime: a.startTime, endTime: a.endTime })) });
  } catch (err) {
    console.error('List shifts error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// Admin: assign a shift to a user for a date
router.post('/assign', authenticateToken, requireRole(['admin']), async (req: AuthRequest, res) => {
  try {
    const { userId, date, startTime, endTime } = req.body as { userId: string; date: string; startTime: string; endTime: string };
    if (!mongoose.isValidObjectId(userId)) return res.status(400).json({ message: 'Invalid userId' });
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return res.status(400).json({ message: 'Invalid date (YYYY-MM-DD)' });
    if (!/^\d{2}:\d{2}$/.test(startTime) || !/^\d{2}:\d{2}$/.test(endTime)) return res.status(400).json({ message: 'Invalid time (HH:mm)' });

    const assignment = await ShiftAssignment.findOneAndUpdate(
      { userId, date },
      { startTime, endTime, createdBy: req.user!.userId },
      { upsert: true, new: true }
    );

    // Notify the user about assignment
    await createAndNotify(userId, `Shift assigned on ${date} from ${startTime} to ${endTime}`, 'info');

    res.status(201).json({ message: 'Shift assigned', assignment: { id: String(assignment._id), userId, date, startTime, endTime } });
  } catch (err) {
    console.error('Assign shift error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// Staff: get my today's shift
router.get('/mine/today', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.userId;
    const today = new Date().toISOString().split('T')[0];
    const assignment = await ShiftAssignment.findOne({ userId, date: today });
    res.json({ assignment: assignment ? { date: assignment.date, startTime: assignment.startTime, endTime: assignment.endTime } : null });
  } catch (err) {
    console.error('Get today shift error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// Staff: get my shifts in a range
router.get('/mine', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.userId;
    const { from, to } = req.query as { from?: string; to?: string };
    const filter: any = { userId };
    if (from) filter.date = { ...(filter.date || {}), $gte: from };
    if (to) filter.date = { ...(filter.date || {}), $lte: to };
    const list = await ShiftAssignment.find(filter).sort({ date: 1 }).lean();
    res.json({ assignments: list.map(a => ({ date: a.date, startTime: a.startTime, endTime: a.endTime })) });
  } catch (err) {
    console.error('Get shifts error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

export default router;
