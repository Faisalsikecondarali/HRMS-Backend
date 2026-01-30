import { Router } from 'express';
import mongoose from 'mongoose';
import { authenticateToken, requireRole, AuthRequest } from '../middleware/auth';
import { Task } from '../models/Task';
import { User } from '../models/User';
import { Notification } from '../models/Notification';
import { createAndNotify } from '../utils/notifier';

const router = Router();

// List task assignees (admin and HR)
router.get('/assignees', authenticateToken, requireRole(['admin', 'hr']), async (req: AuthRequest, res) => {
  try {
    const users = await User.find({ role: { $in: ['hr', 'staff'] }, isActive: true })
      .select('name email role department profileImage')
      .sort({ name: 1 });

    const mapped = users.map((u) => ({
      id: String(u._id),
      name: u.name,
      email: u.email,
      role: u.role,
      department: u.department ?? '',
      profileImage: (u as any).profileImage ?? '',
    }));

    return res.json({ assignees: mapped, total: mapped.length });
  } catch (err) {
    console.error('List assignees error:', err);
    res.status(500).json({ message: 'Server error listing assignees' });
  }
});

// Create task (admin and HR)
router.post('/', authenticateToken, requireRole(['admin', 'hr']), async (req: AuthRequest, res) => {
  try {
    const { title, description, assignedTo, dueDate, priority = 'medium' } = req.body as {
      title: string; description: string; assignedTo: string; dueDate: string; priority?: 'low'|'medium'|'high'
    };

    const assignedUser = await User.findById(assignedTo);
    if (!assignedUser) return res.status(404).json({ message: 'Assigned user not found' });

    const creatorUser = await User.findById(req.user!.userId);
    if (!creatorUser) return res.status(401).json({ message: 'Creator not found' });

    const task = await Task.create({
      title,
      description,
      assignedTo: assignedUser._id,
      assignedToName: assignedUser.name,
      assignedBy: creatorUser._id,
      assignedByName: creatorUser.name,
      dueDate: new Date(dueDate),
      priority,
      status: 'pending',
    });

    // Notification for assigned staff
    await createAndNotify(String(assignedUser._id), `New task assigned: "${title}" - Due ${new Date(dueDate).toLocaleString()}`, 'task_assigned');

    return res.status(201).json({
      message: 'Task created',
      task: {
        id: task._id,
        title: task.title,
        description: task.description,
        assignedTo: String(task.assignedTo),
        assignedToName: task.assignedToName,
        assignedBy: String(task.assignedBy),
        assignedByName: task.assignedByName,
        dueDate: task.dueDate.toISOString(),
        status: task.status,
        priority: task.priority,
        submissionNote: task.submissionNote ?? undefined,
        completedAt: task.completedAt ? task.completedAt.toISOString() : undefined,
        createdAt: task.createdAt.toISOString(),
      }
    });
  } catch (err) {
    console.error('Create task error:', err);
    res.status(500).json({ message: 'Server error creating task' });
  }
});

// Get tasks (admin: optional user filter; hr: all tasks; staff: own tasks)
router.get('/', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const isAdmin = req.user!.role === 'admin';
    const isHR = req.user!.role === 'hr';
    const filterUserId = (req.query.userId as string) || undefined;

    let query: any = {};
    if (isAdmin || isHR) {
      if (filterUserId && mongoose.isValidObjectId(filterUserId)) {
        query.assignedTo = filterUserId;
      }
      // Admin and HR can see all tasks (or filtered by userId)
    } else {
      // Staff can only see their own tasks
      query.assignedTo = req.user!.userId;
    }

    const tasks = await Task.find(query).sort({ createdAt: -1 });

    const mapped = tasks.map((t) => ({
      id: String(t._id),
      title: t.title,
      description: t.description,
      assignedTo: String(t.assignedTo),
      assignedToName: t.assignedToName,
      assignedBy: String(t.assignedBy),
      assignedByName: t.assignedByName,
      dueDate: t.dueDate.toISOString(),
      status: t.status,
      priority: t.priority,
      submissionNote: t.submissionNote ?? undefined,
      completedAt: t.completedAt ? t.completedAt.toISOString() : undefined,
      createdAt: t.createdAt.toISOString(),
    }));

    res.json({ tasks: mapped });
  } catch (err) {
    console.error('List tasks error:', err);
    res.status(500).json({ message: 'Server error listing tasks' });
  }
});

// Update task status (staff can update own; admin and HR can update any)
router.patch('/:id/status', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const { status, submissionNote } = req.body as { status: 'pending'|'in_progress'|'completed'|'overdue'; submissionNote?: string };

    const task = await Task.findById(id);
    if (!task) return res.status(404).json({ message: 'Task not found' });

    const isAdmin = req.user!.role === 'admin';
    const isHR = req.user!.role === 'hr';
    const isOwner = String(task.assignedTo) === req.user!.userId;
    if (!isAdmin && !isHR && !isOwner) return res.status(403).json({ message: 'Access denied' });

    task.status = status;
    if (submissionNote !== undefined) task.submissionNote = submissionNote || null;
    if (status === 'completed') task.completedAt = new Date();
    await task.save();

    // Notify admin when staff completes
    if (!isAdmin && status === 'completed') {
      const admin = await User.findOne({ role: 'admin', isActive: true });
      if (admin) {
        await createAndNotify(String(admin._id), `Task completed by ${task.assignedToName}: "${task.title}"`, 'task_completed');
      }
    }

    return res.json({
      message: 'Task updated',
      task: {
        id: String(task._id),
        title: task.title,
        description: task.description,
        assignedTo: String(task.assignedTo),
        assignedToName: task.assignedToName,
        assignedBy: String(task.assignedBy),
        assignedByName: task.assignedByName,
        dueDate: task.dueDate.toISOString(),
        status: task.status,
        priority: task.priority,
        submissionNote: task.submissionNote ?? undefined,
        completedAt: task.completedAt ? task.completedAt.toISOString() : undefined,
        createdAt: task.createdAt.toISOString(),
      }
    });
  } catch (err) {
    console.error('Update task status error:', err);
    res.status(500).json({ message: 'Server error updating task' });
  }
});

// Delete task (admin and HR)
router.delete('/:id', authenticateToken, requireRole(['admin', 'hr']), async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ message: 'Invalid task ID' });
    }

    const task = await Task.findByIdAndDelete(id);
    if (!task) {
      return res.status(404).json({ message: 'Task not found' });
    }

    // Optionally, you could also delete related notifications here
    // await Notification.deleteMany({ relatedId: id, type: 'task_assigned' });

    res.json({ message: 'Task deleted successfully' });
  } catch (err) {
    console.error('Delete task error:', err);
    res.status(500).json({ message: 'Server error deleting task' });
  }
});

export default router;
