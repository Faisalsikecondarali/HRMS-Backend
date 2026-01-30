import { Router } from 'express';
import { authenticateToken, requireRole, AuthRequest } from '../middleware/auth';
import { LeaveRequest } from '../models/LeaveRequest';
import { Attendance } from '../models/Attendance';
import { User } from '../models/User';
import { Notification } from '../models/Notification';
import { createAndNotify } from '../utils/notifier';

const router = Router();

// Staff submits leave request
router.post('/', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const { date, reason } = req.body as { date: string; reason: string };
    const user = await User.findById(req.user!.userId);
    if (!user) return res.status(404).json({ message: 'User not found' });

    // Prevent duplicate request for same date
    const existing = await LeaveRequest.findOne({ userId: user._id, date });
    if (existing) return res.status(400).json({ message: 'Leave request already exists for this date' });

    // Prevent if attendance already exists for that date
    const existingAttendance = await Attendance.findOne({ userId: user._id, date });
    if (existingAttendance) return res.status(400).json({ message: 'Attendance already exists for this date' });

    const lr = await LeaveRequest.create({
      userId: user._id,
      userName: user.name,
      date,
      reason,
      status: 'pending',
      requestedAt: new Date(),
    });

    // Create notification for all HR users
    const hrUsers = await User.find({ role: 'hr', isActive: true });
    for (const hrUser of hrUsers) {
      await Notification.create({
        userId: hrUser._id,
        type: 'leave_request',
        message: `New leave request from ${user.name} for ${date} - ${reason}`,
        read: false
      });
    }

    res.status(201).json({
      message: 'Leave request submitted',
      request: {
        id: String(lr._id),
        userId: String(lr.userId),
        userName: lr.userName,
        date: lr.date,
        reason: lr.reason,
        status: lr.status,
        requestedAt: lr.requestedAt.toISOString(),
      },
    });
  } catch (err) {
    console.error('Create leave error:', err);
    res.status(500).json({ message: 'Server error creating leave request' });
  }
});

// Staff: list my leave requests
router.get('/mine', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.userId;
    const list = await LeaveRequest.find({ userId }).sort({ requestedAt: -1 });
    res.json({
      requests: list.map((r) => ({
        id: String(r._id),
        userId: String(r.userId),
        userName: r.userName,
        date: r.date,
        reason: r.reason,
        status: r.status,
        requestedAt: r.requestedAt?.toISOString(),
        reviewedAt: r.reviewedAt ? r.reviewedAt.toISOString() : undefined,
      })),
    });
  } catch (err) {
    console.error('List my leave error:', err);
    res.status(500).json({ message: 'Server error listing my leave requests' });
  }
});

// Admin list all leave requests
router.get('/', authenticateToken, requireRole(['admin']), async (_req, res) => {
  try {
    const list = await LeaveRequest.find({}).sort({ requestedAt: -1 });
    res.json({
      requests: list.map((r) => ({
        id: String(r._id),
        userId: String(r.userId),
        userName: r.userName,
        date: r.date,
        reason: r.reason,
        status: r.status,
        requestedAt: r.requestedAt?.toISOString(),
        reviewedAt: r.reviewedAt ? r.reviewedAt.toISOString() : undefined,
      })),
    });
  } catch (err) {
    console.error('List leave error:', err);
    res.status(500).json({ message: 'Server error listing leave requests' });
  }
});

// Admin approve
router.patch('/:id/approve', authenticateToken, requireRole(['admin']), async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const lr = await LeaveRequest.findById(id);
    if (!lr) return res.status(404).json({ message: 'Leave request not found' });

    lr.status = 'approved';
    lr.reviewedAt = new Date();
    await lr.save();

    // Create attendance record as on-leave
    const user = await User.findById(lr.userId);
    if (user) {
      const existingAttendance = await Attendance.findOne({ userId: user._id, date: lr.date });
      if (!existingAttendance) {
        await Attendance.create({
          userId: user._id,
          name: user.name,
          date: lr.date,
          checkIn: new Date(),
          status: 'on-leave',
          leaveReason: lr.reason,
        });
      }

      await createAndNotify(String(user._id), `Your leave request for ${lr.date} has been approved.`, 'leave_approved');
    }

    res.json({ message: 'Leave approved' });
  } catch (err) {
    console.error('Approve leave error:', err);
    res.status(500).json({ message: 'Server error approving leave' });
  }
});

// Admin reject
router.patch('/:id/reject', authenticateToken, requireRole(['admin']), async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const lr = await LeaveRequest.findById(id);
    if (!lr) return res.status(404).json({ message: 'Leave request not found' });

    lr.status = 'rejected';
    lr.reviewedAt = new Date();
    await lr.save();

    await createAndNotify(String(lr.userId), `Your leave request for ${lr.date} has been rejected.`, 'leave_rejected');

    res.json({ message: 'Leave rejected' });
  } catch (err) {
    console.error('Reject leave error:', err);
    res.status(500).json({ message: 'Server error rejecting leave' });
  }
});

// Admin delete one
router.delete('/:id', authenticateToken, requireRole(['admin']), async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const del = await LeaveRequest.findByIdAndDelete(id);
    if (!del) return res.status(404).json({ message: 'Leave request not found' });
    res.json({ message: 'Leave request deleted' });
  } catch (err) {
    console.error('Delete leave error:', err);
    res.status(500).json({ message: 'Server error deleting leave request' });
  }
});

// Admin clear all
router.delete('/', authenticateToken, requireRole(['admin']), async (_req, res) => {
  try {
    await LeaveRequest.deleteMany({});
    res.json({ message: 'All leave requests cleared' });
  } catch (err) {
    console.error('Clear leaves error:', err);
    res.status(500).json({ message: 'Server error clearing leave requests' });
  }
});

export default router;
