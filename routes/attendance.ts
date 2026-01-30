import { Router, Response } from 'express';
import PDFDocument from 'pdfkit';
import { Attendance } from '../models/Attendance';
import { User } from '../models/User';
import { OfficeSettings } from '../models/OfficeSettings';
import { Notification } from '../models/Notification';
import { authenticateToken, AuthRequest, requireRole } from '../middleware/auth';
import { getTodayAttendance, setTodayAttendance, findUserById, getAllAttendance, clearAllAttendanceMock } from '../data/mockData';
import mongoose from 'mongoose';
import { ShiftAssignment } from '../models/ShiftAssignment';
import { LiveLocation } from '../models/LiveLocation';
import { createAndNotify } from '../utils/notifier';
import { AttendanceCorrectionReport } from '../models/AttendanceCorrectionReport';

const router = Router();

const isDBConnected = () => mongoose.connection.readyState === 1;

// ---- Office location settings (for live tracking geo-fence) ----
router.get('/office-settings', authenticateToken, requireRole(['admin']), async (req: AuthRequest, res: Response) => {
  try {
    if (!isDBConnected()) {
      return res.json({ settings: null });
    }

    const latest = await OfficeSettings.findOne().sort({ updatedAt: -1 });
    if (!latest) {
      return res.json({ settings: null });
    }

    return res.json({
      settings: {
        officeLat: latest.officeLat,
        officeLng: latest.officeLng,
        radiusMeters: latest.radiusMeters,
      },
    });
  } catch (err) {
    console.error('Get office settings error:', err);
    return res.status(500).json({ message: 'Server error fetching office settings' });
  }
});

// ---- Staff: attendance correction reports ----
router.post('/reports', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    if (!isDBConnected()) {
      return res.status(500).json({ message: 'Database not connected' });
    }

    const userId = req.user!.userId;
    const { date, subject, details, originalTime, requestedTime } = req.body as {
      date?: string;
      subject?: string;
      details?: string;
      originalTime?: string;
      requestedTime?: string;
    };

    if (!date || !subject || !details) {
      return res.status(400).json({ message: 'date, subject and details are required' });
    }

    const report = await AttendanceCorrectionReport.create({
      userId,
      date,
      subject,
      details,
      originalTime,
      requestedTime,
      status: 'new',
    });

    // Create notification for all HR users
    const user = await User.findById(userId);
    const hrUsers = await User.find({ role: 'hr', isActive: true });
    for (const hrUser of hrUsers) {
      await Notification.create({
        userId: hrUser._id,
        type: 'attendance_edit',
        message: `New attendance edit request from ${user?.name || 'Unknown Staff'} for ${date} - ${subject}: ${details}`,
        read: false
      });
    }

    return res.status(201).json({
      message: 'Attendance issue reported successfully',
      report,
    });
  } catch (error) {
    console.error('Create attendance report error:', error);
    return res.status(500).json({ message: 'Server error creating report' });
  }
});

router.get('/reports/mine', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    if (!isDBConnected()) {
      return res.json({ reports: [] });
    }

    const userId = req.user!.userId;
    const reports = await AttendanceCorrectionReport.find({ userId }).sort({ createdAt: -1 });

    return res.json({ reports });
  } catch (error) {
    console.error('Get my attendance reports error:', error);
    return res.status(500).json({ message: 'Server error fetching reports' });
  }
});

// ---- Staff live location pings for geo-fence alerts ----
router.post('/location', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const { lat, lng } = req.body as { lat?: number; lng?: number };

    if (typeof lat !== 'number' || typeof lng !== 'number') {
      return res.status(400).json({ message: 'lat and lng must be numbers' });
    }

    if (!isDBConnected()) {
      return res.status(500).json({ message: 'Database not connected' });
    }

    // User must be checked-in today
    const today = new Date().toISOString().split('T')[0];
    const attendance = await Attendance.findOne({ userId, date: today });
    if (!attendance || attendance.status !== 'checked-in') {
      return res.status(400).json({ message: 'You must be checked-in to send live location.' });
    }

    // Load latest office settings
    const settings = await OfficeSettings.findOne().sort({ updatedAt: -1 });
    if (!settings) {
      return res.status(400).json({ message: 'Office location is not configured by admin yet.' });
    }

    // Haversine distance calculation (meters)
    const toRad = (v: number) => (v * Math.PI) / 180;
    const R = 6371000; // Earth radius in meters
    const dLat = toRad(lat - settings.officeLat);
    const dLng = toRad(lng - settings.officeLng);
    const lat1 = toRad(settings.officeLat);
    const lat2 = toRad(lat);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const distanceMeters = R * c;

    // Add small tolerance so minor GPS drift doesn't mark user as outside
    const toleranceMeters = 20; // you can increase this if office area is larger
    const outside = distanceMeters > settings.radiusMeters + toleranceMeters;

    // upsert live location snapshot
    await LiveLocation.findOneAndUpdate(
      { userId },
      {
        lat,
        lng,
        distanceMeters,
        outside,
        lastPing: new Date(),
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    if (outside) {
      // Notify all admins once per ping (for now); later can be throttled
      const admins = await User.find({ role: 'admin' });
      const me = await User.findById(userId);
      const name = me?.name || 'Staff member';
      const msg = `${name} moved outside the office radius (~${Math.round(distanceMeters)}m away).`;
      await Promise.all(
        admins.map((admin) => createAndNotify(String(admin._id), msg, 'geofence_alert'))
      );
    }

    return res.json({
      message: 'Location updated',
      distanceMeters,
      outside,
      radiusMeters: settings.radiusMeters,
    });
  } catch (err) {
    console.error('Live location error:', err);
    return res.status(500).json({ message: 'Server error saving live location' });
  }
});

router.put('/office-settings', authenticateToken, requireRole(['admin']), async (req: AuthRequest, res: Response) => {
  try {
    if (!isDBConnected()) {
      return res.status(500).json({ message: 'Database not connected' });
    }

    const { officeLat, officeLng, radiusMeters } = req.body as {
      officeLat: number;
      officeLng: number;
      radiusMeters?: number;
    };

    if (typeof officeLat !== 'number' || typeof officeLng !== 'number') {
      return res.status(400).json({ message: 'officeLat and officeLng must be numbers' });
    }

    const radius = typeof radiusMeters === 'number' && radiusMeters > 0 ? radiusMeters : 60;

    const settings = await OfficeSettings.create({
      officeLat,
      officeLng,
      radiusMeters: radius,
      updatedBy: req.user!.userId,
    });

    return res.json({
      message: 'Office location updated',
      settings: {
        officeLat: settings.officeLat,
        officeLng: settings.officeLng,
        radiusMeters: settings.radiusMeters,
      },
    });
  } catch (err) {
    console.error('Update office settings error:', err);
    return res.status(500).json({ message: 'Server error updating office settings' });
  }
});

// Check in
router.post('/checkin', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

    let existingAttendance;
    let user;

    if (isDBConnected()) {
      // Use database
      existingAttendance = await Attendance.findOne({ userId, date: today });
      user = await User.findById(userId);
    } else {
      // Use mock data
      existingAttendance = getTodayAttendance(userId);
      user = findUserById(userId);
    }

    if (existingAttendance) {
      return res.status(400).json({ message: 'Already checked in today' });
    }

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Determine scheduled start from shift assignment
    let scheduledStart: string | null = null;
    if (isDBConnected()) {
      const assign = await ShiftAssignment.findOne({ userId, date: today });
      scheduledStart = assign?.startTime || null;
    }

    // Create attendance record
    if (isDBConnected()) {
      const attendance = new Attendance({
        userId,
        name: user.name,
        date: today,
        checkIn: new Date(),
        scheduledStart: scheduledStart,
        status: 'checked-in'
      });
      // compute late minutes if scheduledStart is present
      if (scheduledStart) {
        const [hh, mm] = scheduledStart.split(':').map(Number);
        const scheduled = new Date();
        scheduled.setHours(hh, mm, 0, 0);
        const diffMin = Math.max(0, Math.round((attendance.checkIn.getTime() - scheduled.getTime()) / 60000));
        attendance.lateMinutes = diffMin;
      }
      await attendance.save();

      return res.status(201).json({
        message: 'Checked in successfully',
        attendance: {
          id: attendance._id,
          name: attendance.name,
          date: attendance.date,
          checkIn: attendance.checkIn,
          scheduledStart: attendance.scheduledStart,
          lateMinutes: attendance.lateMinutes,
          status: attendance.status
        }
      });
    } else {
      const attendanceData = {
        _id: `attendance_${userId}_${today}`,
        userId,
        name: user.name,
        date: today,
        checkIn: new Date(),
        scheduledStart,
        lateMinutes: 0,
        status: 'checked-in'
      } as any;
      setTodayAttendance(userId, attendanceData);

      return res.status(201).json({
        message: 'Checked in successfully',
        attendance: {
          id: attendanceData._id,
          name: attendanceData.name,
          date: attendanceData.date,
          checkIn: attendanceData.checkIn,
          scheduledStart: attendanceData.scheduledStart,
          lateMinutes: attendanceData.lateMinutes,
          status: attendanceData.status
        }
      });
    }
  } catch (error) {
    console.error('Check-in error:', error);
    res.status(500).json({ message: 'Server error during check-in' });
  }
});

// Clear all attendance records (admin only)
router.delete('/all', authenticateToken, requireRole(['admin']), async (_req: AuthRequest, res: Response) => {
  try {
    if (isDBConnected()) {
      await Attendance.deleteMany({});
    } else {
      clearAllAttendanceMock();
    }
    res.json({ message: 'All attendance records cleared' });
  } catch (error) {
    console.error('Clear all attendance error:', error);
    res.status(500).json({ message: 'Server error clearing attendance' });
  }
});

// Check out
router.put('/checkout', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

    let attendance;

    if (isDBConnected()) {
      attendance = await Attendance.findOne({ userId, date: today });
    } else {
      attendance = getTodayAttendance(userId);
    }

    if (!attendance) {
      return res.status(404).json({ message: 'No check-in record found for today' });
    }

    if (attendance.checkOut) {
      return res.status(400).json({ message: 'Already checked out today' });
    }

    // Update with check-out time
    const checkOutTime = new Date();
    const diff = checkOutTime.getTime() - new Date(attendance.checkIn).getTime();
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    const totalHours = `${hours}h ${minutes}m`;

    if (isDBConnected()) {
      attendance.checkOut = checkOutTime;
      await attendance.save();
    } else {
      attendance.checkOut = checkOutTime;
      attendance.totalHours = totalHours;
      attendance.status = 'checked-out';
      setTodayAttendance(userId, attendance);
    }

    res.json({
      message: 'Checked out successfully',
      attendance: {
        id: attendance._id,
        name: attendance.name,
        date: attendance.date,
        checkIn: attendance.checkIn,
        checkOut: attendance.checkOut,
        totalHours: attendance.totalHours,
        status: attendance.status
      }
    });
  } catch (error) {
    console.error('Check-out error:', error);
    res.status(500).json({ message: 'Server error during check-out' });
  }
});

// Get today's attendance status for current user
router.get('/today', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const today = new Date().toISOString().split('T')[0];

    let attendance;

    if (isDBConnected()) {
      attendance = await Attendance.findOne({ userId, date: today });
    } else {
      attendance = getTodayAttendance(userId);
    }

    res.json({
      attendance: attendance ? {
        id: attendance._id,
        name: attendance.name,
        date: attendance.date,
        checkIn: attendance.checkIn,
        checkOut: attendance.checkOut,
        totalHours: attendance.totalHours,
        status: attendance.status
      } : null
    });
  } catch (error) {
    console.error('Get today attendance error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get attendance history for current user
router.get('/history', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const { page = 1, limit = 10, startDate, endDate } = req.query;

    const query: any = { userId };
    
    if (startDate && endDate) {
      query.date = { $gte: startDate, $lte: endDate };
    }

    const attendance = await Attendance.find(query)
      .sort({ date: -1 })
      .limit(Number(limit))
      .skip((Number(page) - 1) * Number(limit));

    const total = await Attendance.countDocuments(query);

    res.json({
      attendance,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        pages: Math.ceil(total / Number(limit))
      }
    });
  } catch (error) {
    console.error('Get attendance history error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get all attendance records (admin only)
router.get('/all', authenticateToken, requireRole(['admin']), async (req: AuthRequest, res: Response) => {
  try {
    const { page = 1, limit = 20, startDate, endDate, userId: filterUserId } = req.query;

    let attendance;
    let total;

    if (isDBConnected()) {
      const query: any = {};

      if (startDate && endDate) {
        query.date = { $gte: startDate, $lte: endDate };
      }

      if (filterUserId) {
        query.userId = filterUserId;
      }

      attendance = await Attendance.find(query)
        .populate('userId', 'name email department profileImage')
        .sort({ date: -1, checkIn: -1 })
        .limit(Number(limit))
        .skip((Number(page) - 1) * Number(limit));

      total = await Attendance.countDocuments(query);
    } else {
      // Use mock data
      let allAttendance = getAllAttendance();

      // Apply filters
      if (startDate && endDate) {
        allAttendance = allAttendance.filter(record =>
          record.date >= startDate && record.date <= endDate
        );
      }

      if (filterUserId) {
        allAttendance = allAttendance.filter(record =>
          record.userId === filterUserId
        );
      }

      // Sort and paginate
      allAttendance.sort((a, b) => {
        const dateCompare = b.date.localeCompare(a.date);
        if (dateCompare !== 0) return dateCompare;
        return new Date(b.checkIn).getTime() - new Date(a.checkIn).getTime();
      });

      total = allAttendance.length;
      const skip = (Number(page) - 1) * Number(limit);
      attendance = allAttendance.slice(skip, skip + Number(limit));
    }

    res.json({
      attendance,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        pages: Math.ceil(total / Number(limit))
      }
    });
  } catch (error) {
    console.error('Get all attendance error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Request leave
router.post('/leave', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const { date, reason } = req.body;
    const userId = req.user!.userId;

    // Check if attendance record already exists for this date
    const existingAttendance = await Attendance.findOne({ userId, date });
    if (existingAttendance) {
      return res.status(400).json({ message: 'Attendance record already exists for this date' });
    }

    // Get user details
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Create leave record
    const attendance = new Attendance({
      userId,
      name: user.name,
      date,
      checkIn: new Date(), // Set to current time for record keeping
      status: 'on-leave',
      leaveReason: reason
    });

    await attendance.save();

    res.status(201).json({
      message: 'Leave request submitted successfully',
      attendance: {
        id: attendance._id,
        name: attendance.name,
        date: attendance.date,
        status: attendance.status,
        leaveReason: attendance.leaveReason
      }
    });
  } catch (error) {
    console.error('Leave request error:', error);
    res.status(500).json({ message: 'Server error during leave request' });
  }
});

export default router;

// Export attendance as PDF for current user (admin can pass userId)
router.get('/export/pdf', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const requester = req.user!;
    const { startDate, endDate, userId: qUserId } = req.query as any;
    const targetUserId = requester.role === 'admin' && qUserId ? qUserId : requester.userId;

    const query: any = { userId: targetUserId };
    if (startDate && endDate) {
      query.date = { $gte: startDate, $lte: endDate };
    }

    const records = await Attendance.find(query).sort({ date: 1 });
    const user = await User.findById(targetUserId);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="attendance-${new Date().toISOString().slice(0,10)}.pdf"`);

    const doc = new PDFDocument({ margin: 40, size: 'A4' });
    doc.pipe(res);

    // Header
    doc
      .fillColor('#111827')
      .fontSize(20)
      .text('Staff Attendance Report', { align: 'center' })
      .moveDown(0.5);

    doc
      .fontSize(12)
      .fillColor('#374151')
      .text(`Name: ${user?.name || ''}`, { align: 'center' })
      .text(`Employee ID: ${(user as any)?.employeeId || ''}`, { align: 'center' })
      .text(`Range: ${startDate || 'All'} to ${endDate || 'All'}`, { align: 'center' })
      .moveDown(1);

    // Table headers
    const startX = 40;
    let y = doc.y;
    const cols = [
      { title: 'Date', width: 120 },
      { title: 'Check In', width: 100 },
      { title: 'Check Out', width: 100 },
      { title: 'Total', width: 80 },
      { title: 'Status', width: 100 },
    ];

    doc.rect(40, y - 6, 515, 24).fill('#F3F4F6').stroke('#E5E7EB');
    doc.fillColor('#111827').fontSize(11);
    let x = startX + 8;
    cols.forEach((c) => { doc.text(c.title, x, y, { width: c.width }); x += c.width; });
    doc.moveDown(1.2);
    y = doc.y;

    // Rows
    doc.fontSize(10).fillColor('#374151');
    records.forEach((r, i) => {
      const rowY = y + i * 22;
      if (rowY > doc.page.height - 80) {
        doc.addPage();
        y = 60; // reset
      }
      let rx = startX + 8;
      const toTime = (d?: any) => (d ? new Date(d).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '-');
      doc.text(new Date(r.date).toLocaleDateString(), rx, rowY, { width: cols[0].width }); rx += cols[0].width;
      doc.text(toTime(r.checkIn), rx, rowY, { width: cols[1].width }); rx += cols[1].width;
      doc.text(toTime(r.checkOut), rx, rowY, { width: cols[2].width }); rx += cols[2].width;
      doc.text(r.totalHours || '-', rx, rowY, { width: cols[3].width }); rx += cols[3].width;
      doc.text(r.status.replace('-', ' '), rx, rowY, { width: cols[4].width });
    });

    // Footer with summary
    const totalMinutes = records.reduce((sum, r) => {
      if (!r.totalHours) return sum;
      const m = (r.totalHours.match(/(\d+)h\s*(\d+)?m?/) || []);
      const h = m[1] ? parseInt(m[1], 10) : 0;
      const min = m[2] ? parseInt(m[2], 10) : 0;
      return sum + h * 60 + min;
    }, 0);
    const totalHours = (totalMinutes / 60).toFixed(1);
    doc.moveDown(2);
    doc.fontSize(11).fillColor('#111827').text(`Total Records: ${records.length}`);
    doc.text(`Total Hours: ${totalHours}h`);

    doc.end();
  } catch (err) {
    console.error('Export PDF error:', err);
    res.status(500).json({ message: 'Server error generating PDF' });
  }
});
