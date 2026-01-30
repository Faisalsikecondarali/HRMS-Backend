import { Router, Response } from 'express';
import mongoose from 'mongoose';
import { authenticateToken, requireRole, AuthRequest } from '../middleware/auth';
import { Attendance } from '../models/Attendance';
import { LeaveRequest } from '../models/LeaveRequest';
import { Profile } from '../models/Profile';
import { LiveLocation } from '../models/LiveLocation';
import { User } from '../models/User';
import { AttendanceCorrectionReport } from '../models/AttendanceCorrectionReport';
import { Task } from '../models/Task';
import { Department } from '../models/Department';
import bcrypt from 'bcryptjs';
import { Shift } from '../models/Shift';
import fs from 'fs/promises';
import path from 'path';
import { upload as uploadMiddleware, uploadToCloudinary } from '../utils/upload';

const router = Router();
const uploadsDir = path.resolve(process.env.UPLOADS_DIR || 'uploads');
const upload = uploadMiddleware;

router.post('/reset', authenticateToken, requireRole(['admin']), async (req: AuthRequest, res: Response) => {
  try {
    await Promise.all([
      Attendance.deleteMany({}),
      LeaveRequest.deleteMany({}),
      Profile.deleteMany({})
    ]);

    try {
      const entries = await fs.readdir(uploadsDir);
      await Promise.all(entries.map((file) => fs.unlink(path.join(uploadsDir, file))));
    } catch (err) {
      // ignore if uploads folder missing
      if ((err as any).code !== 'ENOENT') {
        console.error('Error deleting upload files:', err);
      }
    }

    res.json({ message: 'All attendance, leave, and profile data cleared.' });
  } catch (error) {
    console.error('Admin reset error:', error);
    res.status(500).json({ message: 'Server error during reset' });
  }
});

// Live staff snapshot for geo-fence tracking
router.get('/live-staff', authenticateToken, requireRole(['admin']), async (_req: AuthRequest, res: Response) => {
  try {
    const live = await LiveLocation.find({}).sort({ lastPing: -1 }).limit(100);
    const userIds = live.map((l) => l.userId);
    const users = await User.find({ _id: { $in: userIds } });

    const byId = new Map<string, any>();
    users.forEach((u) => byId.set(String(u._id), u));

    const staff = live.map((l) => {
      const u = byId.get(String(l.userId));
      return {
        id: String(l.userId),
        name: u?.name || 'Staff member',
        outside: l.outside,
        lastPing: l.lastPing.toISOString(),
        distanceMeters: l.distanceMeters,
        lat: l.lat,
        lng: l.lng,
      };
    });

    res.json({ staff });
  } catch (err) {
    console.error('Live staff error:', err);
    res.status(500).json({ message: 'Server error fetching live staff' });
  }
});

// Attendance correction reports (admin view)
router.get(
  '/attendance-reports',
  authenticateToken,
  requireRole(['admin']),
  async (req: AuthRequest, res: Response) => {
    try {
      const { status } = req.query as { status?: string };

      const query: any = {};
      if (status && status !== 'all') {
        query.status = status;
      }

      const reports = await AttendanceCorrectionReport.find(query)
        .sort({ createdAt: -1 })
        .limit(200);

      const userIds = reports.map((r) => r.userId);
      const users = await User.find({ _id: { $in: userIds } });
      const profiles = await Profile.find({ user: { $in: userIds } });

      const userMap = new Map<string, any>();
      users.forEach((u) => userMap.set(String(u._id), u));
      const profileMap = new Map<string, any>();
      profiles.forEach((p) => profileMap.set(String(p.user), p));

      const mapped = reports.map((r) => {
        const u = userMap.get(String(r.userId));
        const p = profileMap.get(String(r.userId));
        const staffName = u?.name || 'Staff member';
        const staffCode = `#${String(r.userId).slice(-6).toUpperCase()}`;
        const department = p?.department || (u?.role === 'admin' ? 'Administration' : 'Staff');
        return {
          id: String(r._id),
          staffName,
          staffCode,
          date: r.date,
          subject: r.subject,
          status: r.status,
          department,
          submittedAt: r.createdAt,
          details: r.details,
          originalTime: r.originalTime,
          requestedTime: r.requestedTime,
          correctedTime: r.correctedTime,
        };
      });

      return res.json({ reports: mapped });
    } catch (error) {
      console.error('Admin get attendance reports error:', error);
      return res.status(500).json({ message: 'Server error fetching reports' });
    }
  }
);

router.patch(
  '/attendance-reports/:id',
  authenticateToken,
  requireRole(['admin']),
  async (req: AuthRequest, res: Response) => {
    try {
      const { id } = req.params as { id: string };
      const { status, correctedTime } = req.body as { status?: string; correctedTime?: string };

      const update: any = {};
      if (status) update.status = status;
      if (correctedTime !== undefined) update.correctedTime = correctedTime;

      const report = await AttendanceCorrectionReport.findByIdAndUpdate(id, update, { new: true });
      if (!report) {
        return res.status(404).json({ message: 'Report not found' });
      }

      // If admin resolved the report, try to apply the correction to the Attendance record
      if (report.status === 'resolved') {
        try {
          const userId = report.userId;
          const date = report.date; // YYYY-MM-DD

          // Prefer explicitly provided correctedTime, fall back to requestedTime
          const timeString = report.correctedTime || report.requestedTime;

          if (timeString) {
            const buildDateTime = (d: string, t: string): Date | null => {
              // If t already contains a date portion, let Date parse directly
              if (t.startsWith(d)) {
                const parsed = new Date(t);
                return isNaN(parsed.getTime()) ? null : parsed;
              }

              // Try ISO-like "YYYY-MM-DDTHH:mm" if looks like HH:mm
              if (/^\d{2}:\d{2}/.test(t)) {
                const isoCandidate = `${d}T${t}`;
                const parsed = new Date(isoCandidate);
                if (!isNaN(parsed.getTime())) return parsed;
              }

              // Fallback: let JS Date parse "YYYY-MM-DD <timeString>"
              const fallback = new Date(`${d} ${t}`);
              return isNaN(fallback.getTime()) ? null : fallback;
            };

            const targetDateTime = buildDateTime(date, timeString);

            if (targetDateTime) {
              // Decide whether this is a check-in or check-out type correction based on subject
              const subjectLower = (report.subject || '').toLowerCase();
              const isCheckInIssue = subjectLower.includes('check-in') || subjectLower.includes('check in');
              const isCheckOutIssue = subjectLower.includes('check-out') || subjectLower.includes('check out');

              // Load or create attendance record for that day
              let attendance = await Attendance.findOne({ userId, date });

              if (!attendance) {
                const user = await User.findById(userId);
                const name = user?.name || 'Staff member';
                attendance = new Attendance({
                  userId,
                  name,
                  date,
                  checkIn: targetDateTime,
                  status: isCheckOutIssue ? 'checked-out' : 'checked-in',
                });

                if (isCheckOutIssue) {
                  attendance.checkOut = targetDateTime;
                }
              } else {
                if (isCheckInIssue && targetDateTime) {
                  attendance.checkIn = targetDateTime;
                }
                if (isCheckOutIssue && targetDateTime) {
                  attendance.checkOut = targetDateTime;
                }
              }

              await attendance.save();
            }
          }
        } catch (applyErr) {
          console.error('Failed to apply attendance correction on approval:', applyErr);
        }
      }

      return res.json({ message: 'Report updated', report });
    } catch (error) {
      console.error('Admin update attendance report error:', error);
      return res.status(500).json({ message: 'Server error updating report' });
    }
  }
);

// Get dashboard stats for admin dashboard
router.get('/dashboard/stats', authenticateToken, requireRole(['admin']), async (req: AuthRequest, res: Response) => {
  try {
    console.log('📊 Fetching dashboard stats...');
    
    // Get total staff count
    const totalStaff = await User.countDocuments({ isActive: true });
    
    // Get active staff (logged in today)
    const activeStaff = await User.countDocuments({ 
      isActive: true,
      lastLogin: { 
        $gte: new Date(new Date().setHours(0, 0, 0, 0)) 
      }
    });
    
    // Get total departments count
    const totalDepartments = await Department.countDocuments({ isActive: true });
    
    // Get pending tasks
    const pendingTasks = await Task.countDocuments({ status: 'pending' });
    
    // Get today's attendance
    const today = new Date().toISOString().split('T')[0];
    const todayAttendance = await Attendance.countDocuments({
      date: today,
      status: 'present'
    });
    
    // Get active sessions (users logged in within last 30 minutes)
    const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000);
    const activeSessions = await User.countDocuments({
      isActive: true,
      lastLogin: { $gte: thirtyMinutesAgo }
    });
    
    // Calculate system health based on various factors
    const systemHealth = Math.min(100, Math.round(
      (totalStaff > 0 ? (activeStaff / totalStaff) * 50 : 50) +
      (totalDepartments > 0 ? 25 : 0) +
      (todayAttendance > 0 ? 25 : 0)
    ));
    
    // Get database status
    let databaseStatus = 'Healthy';
    try {
      // Test database connection
      await User.findOne();
      databaseStatus = 'Healthy';
    } catch (error) {
      databaseStatus = 'Disconnected';
    }
    
    // Get API response time (mock for now)
    const apiResponseTime = Math.floor(Math.random() * 50) + 80; // 80-130ms
    const systemUptime = '99.9%';
    
    const stats = {
      totalStaff,
      activeStaff,
      totalDepartments,
      pendingTasks,
      todayAttendance,
      activeSessions,
      systemHealth,
      databaseStatus,
      apiResponseTime,
      systemUptime,
      timestamp: new Date().toISOString()
    };
    
    console.log('✅ Dashboard stats fetched:', stats);
    res.json(stats);
  } catch (error) {
    console.error('❌ Error fetching dashboard stats:', error);
    res.status(500).json({ message: 'Error fetching dashboard stats' });
  }
});

// Get system stats for admin dashboard (legacy endpoint)
router.get('/system-stats', authenticateToken, requireRole(['admin']), async (req: AuthRequest, res: Response) => {
  try {
    // Get total staff count
    const totalStaff = await User.countDocuments({ isActive: true });
    
    // Get active staff (logged in today)
    const activeStaff = await User.countDocuments({ 
      isActive: true,
      lastLogin: { 
        $gte: new Date(new Date().setHours(0, 0, 0, 0)) 
      }
    });
    
    // Get total departments count
    const totalDepartments = await Department.countDocuments({ isActive: true });
    
    // Get pending tasks
    const pendingTasks = await Task.countDocuments({ status: 'pending' });
    
    // Get today's attendance
    const todayAttendance = await Attendance.countDocuments({
      date: new Date().toISOString().split('T')[0],
      status: 'present'
    });
    
    // Get active sessions (users logged in within last 30 minutes)
    const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000);
    const activeSessions = await User.countDocuments({
      isActive: true,
      lastLogin: { $gte: thirtyMinutesAgo }
    });
    
    // Calculate system health based on various factors
    const systemHealth = Math.min(100, Math.round(
      (totalStaff > 0 ? (activeStaff / totalStaff) * 50 : 50) +
      (totalDepartments > 0 ? 25 : 0) +
      (todayAttendance > 0 ? 25 : 0)
    ));
    
    // Mock system performance metrics
    const databaseStatus = 'Healthy';
    const apiResponseTime = Math.floor(Math.random() * 50) + 80; // 80-130ms
    const systemUptime = '99.9%';
    
    res.json({
      totalStaff,
      activeStaff,
      totalDepartments,
      pendingTasks,
      todayAttendance,
      activeSessions,
      systemHealth,
      databaseStatus,
      apiResponseTime,
      systemUptime,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Get system stats failed:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// ==================== STAFF MANAGEMENT ====================

// Get today's check-ins count
router.get('/stats/today-checkins', authenticateToken, requireRole(['admin']), async (req: AuthRequest, res: Response) => {
  try {
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

    // Count all attendance records with check-in for today
    const todayCheckIns = await Attendance.countDocuments({
      date: today,
      checkIn: { $exists: true }
    });

    res.json({ 
      todayCheckIns,
      date: today
    });
  } catch (error) {
    console.error('Get today check-ins error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get user's last check-in
router.get('/staff/:userId/last-checkin', authenticateToken, requireRole(['admin']), async (req: AuthRequest, res: Response) => {
  try {
    const { userId } = req.params;
    console.log('Fetching last check-in for userId:', userId);

    // Find the most recent attendance record for this user
    const lastAttendance = await Attendance.findOne({ 
      $or: [
        { userId: userId },
        { userId: new mongoose.Types.ObjectId(userId) }
      ],
      checkIn: { $exists: true }
    }).sort({ date: -1 });

    console.log('Found attendance:', lastAttendance);

    if (!lastAttendance) {
      console.log('No attendance found for user:', userId);
      return res.json({ lastCheckIn: null });
    }

    res.json({ 
      lastCheckIn: {
        date: lastAttendance.date,
        checkIn: lastAttendance.checkIn,
        status: lastAttendance.status
      }
    });
  } catch (error) {
    console.error('Get last check-in error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get all staff members
router.get('/staff', authenticateToken, requireRole(['admin']), async (req: AuthRequest, res: Response) => {
  try {
    const staff = await User.find({ isActive: true })
      .select('-password')
      .lean() // Convert to plain objects for better performance
      .sort({ createdAt: -1 });
    
    // Ensure profilePicture is included and properly formatted with full URLs
    const staffWithAvatars = staff.map((user: any) => {
      const profilePicture = (user as any).profilePicture;
      const fullAvatarUrl = profilePicture
        ? (String(profilePicture).startsWith('http')
          ? profilePicture
          : `${req.protocol}://${req.get('host')}/uploads/${String(profilePicture).split('/').pop()}`)
        : null;
      
      return {
        ...user,
        id: user._id,
        avatarUrl: fullAvatarUrl, // Add avatarUrl for frontend compatibility
        profilePicture: fullAvatarUrl // Use full URL
      };
    });
    
    res.json({ staff: staffWithAvatars });
  } catch (error) {
    console.error('Get staff failed:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Create new staff member
router.post('/staff', authenticateToken, requireRole(['admin']), upload.fields([
  { name: 'profilePicture', maxCount: 1 },
  { name: 'cv', maxCount: 1 }
]), async (req: AuthRequest, res: Response) => {
  try {
    const { name, email, password, role, department, shift, phone, address, cnic } = req.body;
    const files = req.files as { [fieldname: string]: Express.Multer.File[] };

    // Validate required fields (only name, email, password are required)
    if (!name || !email || !password) {
      return res.status(400).json({ message: 'Name, email, and password are required' });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ message: 'Please enter a valid email address' });
    }

    // Validate password length
    if (password.length < 6) {
      return res.status(400).json({ message: 'Password must be at least 6 characters long' });
    }

    // Set default values for optional fields
    const defaultDepartment = department || 'General';
    const defaultRole = role || 'staff';
    const defaultPhone = phone || '';
    const defaultAddress = address || '';
    const defaultCnic = cnic || '';
    const defaultShift = shift || '';

    // Handle file uploads (optional)
    let profilePicturePath = null;
    let cvPath = null;
    
    if (files?.profilePicture && files.profilePicture.length > 0) {
      const uploaded = await uploadToCloudinary(files.profilePicture[0], {
        folder: "attendance-system/avatars",
        resource_type: "image",
      });
      profilePicturePath = uploaded.secureUrl;
    }
    
    if (files?.cv && files.cv.length > 0) {
      const uploaded = await uploadToCloudinary(files.cv[0], {
        folder: "attendance-system/documents",
        resource_type: "auto",
      });
      cvPath = uploaded.secureUrl;
    }

    // Create staff member with optional fields
    const staffMember = new User({
      name: name.trim(),
      email: email.toLowerCase().trim(),
      password,
      role: defaultRole,
      department: defaultDepartment,
      shift: defaultShift || null,
      phone: defaultPhone,
      address: defaultAddress,
      cnic: defaultCnic,
      profilePicture: profilePicturePath,
      cv: cvPath,
    });

    await staffMember.save();
    
    // Remove password from response
    const staffResponse = staffMember.toObject();
    delete staffResponse.password;
    
    res.status(201).json({
      message: 'Staff member created successfully',
      staff: staffResponse
    });
  } catch (error: any) {
    console.error('Create staff failed:', error);
    if (error.code === 11000) {
      return res.status(400).json({ message: 'User with this email already exists' });
    }
    if (error.message.includes('Invalid file type')) {
      return res.status(400).json({ message: 'Invalid file type. Please check your files.' });
    }
    if (error.message.includes('required')) {
      return res.status(400).json({ message: 'Please provide all required fields' });
    }
    res.status(500).json({ message: 'Server error' });
  }
});

// Update staff status
router.put('/staff/:id/status', authenticateToken, requireRole(['admin']), async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    
    if (!['active', 'inactive'].includes(status)) {
      return res.status(400).json({ message: 'Invalid status value' });
    }

    const staff = await User.findByIdAndUpdate(
      id,
      { isActive: status === 'active' },
      { new: true }
    ).select('-password');

    if (!staff) {
      return res.status(404).json({ message: 'Staff member not found' });
    }

    res.json(staff);
  } catch (error) {
    console.error('Update staff status failed:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Delete staff member
router.delete('/staff/:id', authenticateToken, requireRole(['admin']), async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    const staff = await User.findById(id);
    if (!staff) {
      return res.status(404).json({ message: 'Staff member not found' });
    }

    // Soft delete by setting isActive to false
    await User.findByIdAndUpdate(id, { isActive: false });
    
    res.json({ message: 'Staff member deleted successfully' });
  } catch (error) {
    console.error('Delete staff failed:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Update staff member
router.put('/staff/:id', authenticateToken, requireRole(['admin']), async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { name, email, phone, address, cnic, department, role, isActive, password } = req.body;
    
    // Find staff member
    const staff = await User.findById(id);
    if (!staff) {
      return res.status(404).json({ message: 'Staff member not found' });
    }

    // Check if email is being changed and if it's already taken
    if (email && email !== staff.email) {
      const existingUser = await User.findOne({ email, _id: { $ne: id } });
      if (existingUser) {
        return res.status(400).json({ message: 'Email already exists' });
      }
    }

    // Update staff member
    const updateData: any = {};
    if (name !== undefined) updateData.name = name;
    if (email !== undefined) updateData.email = email;
    if (phone !== undefined) updateData.phone = phone;
    if (address !== undefined) updateData.address = address;
    if (cnic !== undefined) updateData.cnic = cnic;
    if (department !== undefined) updateData.department = department;
    if (role !== undefined) updateData.role = role;
    if (isActive !== undefined) updateData.isActive = isActive;
    
    // Handle password update if provided
    if (password && password.trim()) {
      const saltRounds = 10;
      updateData.password = await bcrypt.hash(password, saltRounds);
    }

    const updatedStaff = await User.findByIdAndUpdate(
      id,
      updateData,
      { new: true, runValidators: true }
    ).select('-password');

    res.json({
      message: 'Staff member updated successfully',
      staff: updatedStaff
    });
  } catch (error: any) {
    console.error('Update staff failed:', error);
    if (error.code === 11000) {
      return res.status(400).json({ message: 'User with this email already exists' });
    }
    if (error.message.includes('required')) {
      return res.status(400).json({ message: 'Please provide all required fields' });
    }
    res.status(500).json({ message: 'Server error' });
  }
});

// Seed all data (for development)
router.post('/seed-all-data', authenticateToken, requireRole(['admin']), async (req: AuthRequest, res: Response) => {
  try {
    // Seed departments
    const departments = [
      {
        name: 'Development',
        description: 'Software development and engineering team responsible for product development',
        head: 'Ahmed Khan',
        location: 'Karachi, Pakistan',
        phone: '+92 300 1234567',
        email: 'dev@company.com'
      },
      {
        name: 'Human Resources',
        description: 'HR operations and staff management team',
        head: 'Sara Ali',
        location: 'Lahore, Pakistan',
        phone: '+92 321 9876543',
        email: 'hr@company.com'
      },
      {
        name: 'Sales',
        description: 'Sales and business development team',
        head: 'Mohammed Raza',
        location: 'Islamabad, Pakistan',
        phone: '+92 333 4567890',
        email: 'sales@company.com'
      },
      {
        name: 'Marketing',
        description: 'Marketing and communications team',
        head: 'Fatima Sheikh',
        location: 'Karachi, Pakistan',
        phone: '+92 311 2345678',
        email: 'marketing@company.com'
      },
      {
        name: 'Operations',
        description: 'Operations and logistics management team',
        head: 'Ali Hassan',
        location: 'Karachi, Pakistan',
        phone: '+92 344 8765432',
        email: 'operations@company.com'
      }
    ];

    await Department.deleteMany({});
    await Department.insertMany(departments);

    // Seed some sample staff
    const sampleStaff = [
      {
        name: 'Ahmed Khan',
        email: 'ahmed@company.com',
        password: 'password123',
        role: 'staff',
        department: 'Development',
        phone: '+92 300 1234567',
        address: 'Karachi, Pakistan',
        cnic: '12345-1234567-1',
        isActive: true,
        lastLogin: new Date()
      },
      {
        name: 'Sara Ali',
        email: 'sara@company.com',
        password: 'password123',
        role: 'hr',
        department: 'Human Resources',
        phone: '+92 321 9876543',
        address: 'Lahore, Pakistan',
        cnic: '23456-2345678-2',
        isActive: true,
        lastLogin: new Date()
      },
      {
        name: 'Mohammed Raza',
        email: 'raza@company.com',
        password: 'password123',
        role: 'staff',
        department: 'Sales',
        phone: '+92 333 4567890',
        address: 'Islamabad, Pakistan',
        cnic: '34567-3456789-3',
        isActive: true,
        lastLogin: new Date(Date.now() - 2 * 60 * 60 * 1000) // 2 hours ago
      }
    ];

    await User.deleteMany({ role: { $ne: 'admin' } }); // Don't delete admin users
    await User.insertMany(sampleStaff);

    // Seed some attendance records
    const today = new Date().toISOString().split('T')[0];
    const attendanceRecords = sampleStaff.map(staff => ({
      userId: staff._id,
      name: staff.name,
      date: today,
      checkIn: new Date(),
      status: 'present'
    }));

    await Attendance.deleteMany({ date: today });
    await Attendance.insertMany(attendanceRecords);

    res.json({
      message: 'All data seeded successfully',
      departments: departments.length,
      staff: sampleStaff.length,
      attendance: attendanceRecords.length
    });
  } catch (error: any) {
    console.error('Seed all data error:', error);
    res.status(500).json({ message: 'Server error seeding data' });
  }
});

// Seed departments (for development)
router.post('/seed-departments', authenticateToken, requireRole(['admin']), async (req: AuthRequest, res: Response) => {
  try {
    const departments = [
      {
        name: 'Development',
        description: 'Software development and engineering team responsible for product development',
        head: 'Ahmed Khan',
        location: 'Karachi, Pakistan',
        phone: '+92 300 1234567',
        email: 'dev@company.com'
      },
      {
        name: 'Human Resources',
        description: 'HR operations and staff management team',
        head: 'Sara Ali',
        location: 'Lahore, Pakistan',
        phone: '+92 321 9876543',
        email: 'hr@company.com'
      },
      {
        name: 'Sales',
        description: 'Sales and business development team',
        head: 'Mohammed Raza',
        location: 'Islamabad, Pakistan',
        phone: '+92 333 4567890',
        email: 'sales@company.com'
      },
      {
        name: 'Marketing',
        description: 'Marketing and communications team',
        head: 'Fatima Sheikh',
        location: 'Karachi, Pakistan',
        phone: '+92 311 2345678',
        email: 'marketing@company.com'
      },
      {
        name: 'Operations',
        description: 'Operations and logistics management team',
        head: 'Ali Hassan',
        location: 'Karachi, Pakistan',
        phone: '+92 344 8765432',
        email: 'operations@company.com'
      }
    ];

    // Clear existing departments
    await Department.deleteMany({});
    
    // Insert new departments
    const insertedDepartments = await Department.insertMany(departments);
    
    res.json({
      message: 'Departments seeded successfully',
      departments: insertedDepartments.map(dept => ({
        name: dept.name,
        head: dept.head,
        email: dept.email
      }))
    });
  } catch (error: any) {
    console.error('Seed departments error:', error);
    res.status(500).json({ message: 'Server error seeding departments' });
  }
});

// ==================== DEPARTMENT MANAGEMENT ====================

// Get all departments
router.get('/departments', authenticateToken, requireRole(['admin']), async (req: AuthRequest, res: Response) => {
  try {
    const departments = await Department.getDepartmentsWithStaffCount();
    res.json({ departments });
  } catch (error) {
    console.error('Get departments failed:', error);
    // If department query fails, return a server error instead of mock data
    res.status(500).json({ message: 'Server error fetching departments' });
  }
});

// Create new department
router.post('/departments', authenticateToken, requireRole(['admin']), async (req: AuthRequest, res: Response) => {
  try {
    const { name, description, head, location, phone, email } = req.body;

    // Validate required fields
    if (!name || !description || !head || !location || !phone || !email) {
      return res.status(400).json({ message: 'All fields are required' });
    }

    // Check if department already exists
    const existingDept = await Department.findOne({ name });
    if (existingDept) {
      return res.status(400).json({ message: 'Department with this name already exists' });
    }

    // Create department
    const department = new Department({
      name,
      description,
      head,
      location,
      phone,
      email
    });

    await department.save();
    res.status(201).json(department);
  } catch (error: any) {
    console.error('Create department failed:', error);
    if (error.code === 11000) {
      return res.status(400).json({ message: 'Department name already exists' });
    }
    res.status(500).json({ message: 'Server error' });
  }
});

// Update department
router.put('/departments/:id', authenticateToken, requireRole(['admin']), async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { name, description, head, location, phone, email, isActive } = req.body;

    const department = await Department.findById(id);
    if (!department) {
      return res.status(404).json({ message: 'Department not found' });
    }

    // If name is being changed, check if new name already exists
    if (name && name !== department.name) {
      const existingDept = await Department.findOne({ name });
      if (existingDept) {
        return res.status(400).json({ message: 'Department with this name already exists' });
      }
    }

    // Update department
    const updatedDepartment = await Department.findByIdAndUpdate(
      id,
      { name, description, head, location, phone, email, isActive },
      { new: true, runValidators: true }
    );

    res.json(updatedDepartment);
  } catch (error: any) {
    console.error('Update department failed:', error);
    if (error.code === 11000) {
      return res.status(400).json({ message: 'Department name already exists' });
    }
    res.status(500).json({ message: 'Server error' });
  }
});

// Delete department
router.delete('/departments/:id', authenticateToken, requireRole(['admin']), async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    const department = await Department.findById(id);
    if (!department) {
      return res.status(404).json({ message: 'Department not found' });
    }

    // Check if there are staff members in this department
    const staffCount = await User.countDocuments({ 
      department: department.name,
      isActive: true 
    });

    if (staffCount > 0) {
      return res.status(400).json({ 
        message: 'Cannot delete department with active staff members. Please reassign staff first.' 
      });
    }

    await Department.findByIdAndDelete(id);
    res.json({ message: 'Department deleted successfully' });
  } catch (error) {
    console.error('Delete department failed:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get department staff
router.get('/departments/:id/staff', authenticateToken, requireRole(['admin']), async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    
    // Find department
    const department = await Department.findById(id);
    if (!department) {
      return res.status(404).json({ message: 'Department not found' });
    }

    // Find staff in this department
    const staff = await User.find({ 
      department: department.name,
      isActive: true 
    }).select('-password').sort({ createdAt: -1 });

    res.json({ staff });
  } catch (error) {
    console.error('Get department staff failed:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Update staff department
router.put('/staff/:id/department', authenticateToken, requireRole(['admin']), async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { department } = req.body;

    const staff = await User.findByIdAndUpdate(
      id,
      { department: department || '' },
      { new: true }
    ).select('-password');

    if (!staff) {
      return res.status(404).json({ message: 'Staff member not found' });
    }

    res.json({ staff });
  } catch (error) {
    console.error('Update staff department failed:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Update department
router.put('/departments/:id', authenticateToken, requireRole(['admin']), async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { name, description, head, location, phone, email } = req.body;

    const department = await Department.findByIdAndUpdate(
      id,
      { name, description, head, location, phone, email },
      { new: true }
    );

    if (!department) {
      return res.status(404).json({ message: 'Department not found' });
    }

    res.json({ department });
  } catch (error) {
    console.error('Update department failed:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get department by ID
router.get('/departments/:id', authenticateToken, requireRole(['admin']), async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const department = await Department.findById(id);
    
    if (!department) {
      return res.status(404).json({ message: 'Department not found' });
    }

    // Get staff count for this department
    const staffCount = await User.countDocuments({ 
      department: department.name,
      isActive: true 
    });

    res.json({ ...department.toObject(), staffCount });
  } catch (error) {
    console.error('Get department failed:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// ==================== TASK MANAGEMENT ====================

// Get all tasks for admin overview
router.get('/tasks', authenticateToken, requireRole(['admin']), async (_req: AuthRequest, res: Response) => {
  try {
    const tasks = await Task.find({}).sort({ createdAt: -1 });

    const mapped = tasks.map((t) => ({
      id: String(t._id),
      title: t.title,
      description: t.description,
      assignedTo: t.assignedToName,
      department: 'General',
      priority: (t.priority as any) || 'medium',
      status: (t.status as any) || 'pending',
      dueDate: t.dueDate.toISOString(),
      createdAt: t.createdAt.toISOString(),
      completedAt: t.completedAt ? t.completedAt.toISOString() : undefined,
    }));

    return res.json({ tasks: mapped });
  } catch (error) {
    console.error('Get tasks failed:', error);
    return res.status(500).json({ message: 'Server error fetching tasks' });
  }
});

// Create new task
router.post('/tasks', authenticateToken, requireRole(['admin']), async (req: AuthRequest, res: Response) => {
  try {
    const { title, description, assignedTo, department, priority, dueDate } = req.body as {
      title: string;
      description: string;
      assignedTo: string;
      department?: string;
      priority?: string;
      dueDate: string;
    };

    if (!title || !description || !assignedTo || !dueDate) {
      return res.status(400).json({ message: 'Title, description, assignee and due date are required' });
    }

    // Validate priority
    const validPriorities = ['low', 'medium', 'high', 'urgent'];
    if (priority && !validPriorities.includes(priority)) {
      return res.status(400).json({ message: 'Invalid priority. Must be: low, medium, high, or urgent' });
    }

    // Validate due date
    const dueDateObj = new Date(dueDate);
    if (isNaN(dueDateObj.getTime())) {
      return res.status(400).json({ message: 'Invalid due date format' });
    }

    // Find staff member by ID (frontend now sends ID instead of name)
    let staffUser;
    try {
      // If assignedTo looks like a MongoDB ObjectId, find by ID
      if (assignedTo.match(/^[0-9a-fA-F]{24}$/)) {
        staffUser = await User.findById(assignedTo);
      } else {
        // Fallback to finding by name (for backward compatibility)
        staffUser = await User.findOne({ name: assignedTo });
      }
    } catch (error) {
      console.error('Error finding staff member:', error);
      return res.status(400).json({ message: 'Invalid staff member ID' });
    }

    if (!staffUser) {
      return res.status(404).json({ message: 'Staff member not found' });
    }

    // Verify admin user exists
    if (!req.user?._id) {
      return res.status(401).json({ message: 'Admin authentication required' });
    }

    const task = new Task({
      title,
      description,
      assignedTo: staffUser._id,
      assignedToName: staffUser.name,
      assignedBy: req.user?._id,
      assignedByName: req.user?.name || 'Admin',
      dueDate: new Date(dueDate),
      status: 'pending',
      priority: (priority as any) || 'medium',
      submissionNote: null,
    });

    await task.save();

    return res.status(201).json({
      id: String(task._id),
      title: task.title,
      description: task.description,
      assignedTo: task.assignedToName,
      department: department || 'General',
      priority: task.priority,
      status: task.status,
      dueDate: task.dueDate.toISOString(),
      createdAt: task.createdAt.toISOString(),
      completedAt: task.completedAt ? task.completedAt.toISOString() : undefined,
    });
  } catch (error: any) {
    console.error('Create task failed:', error);
    
    // Handle specific error types
    if (error.name === 'ValidationError') {
      const validationErrors = Object.values(error.errors).map((err: any) => err.message);
      return res.status(400).json({ 
        message: 'Validation error', 
        errors: validationErrors 
      });
    }
    
    if (error.code === 11000) {
      return res.status(400).json({ message: 'Duplicate task entry' });
    }
    
    if (error.message.includes('Cast to ObjectId failed')) {
      return res.status(400).json({ message: 'Invalid user ID format' });
    }
    
    return res.status(500).json({ 
      message: 'Server error creating task',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Update task status
router.put('/tasks/:id/status', authenticateToken, requireRole(['admin']), async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { status } = req.body as { status: string };

    const validStatuses = ['pending', 'in-progress', 'completed', 'cancelled'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ message: 'Invalid status value' });
    }

    const update: any = { status };
    if (status === 'completed') {
      update.completedAt = new Date();
    }

    const task = await Task.findByIdAndUpdate(id, update, { new: true });
    if (!task) {
      return res.status(404).json({ message: 'Task not found' });
    }

    return res.json({
      id: String(task._id),
      title: task.title,
      description: task.description,
      assignedTo: task.assignedToName,
      department: 'General',
      priority: task.priority,
      status: task.status,
      dueDate: task.dueDate.toISOString(),
      createdAt: task.createdAt.toISOString(),
      completedAt: task.completedAt ? task.completedAt.toISOString() : undefined,
    });
  } catch (error) {
    console.error('Update task status failed:', error);
    return res.status(500).json({ message: 'Server error updating task' });
  }
});

// Delete task
router.delete('/tasks/:id', authenticateToken, requireRole(['admin']), async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    const deleted = await Task.findByIdAndDelete(id);
    if (!deleted) {
      return res.status(404).json({ message: 'Task not found' });
    }

    return res.json({ message: 'Task deleted successfully' });
  } catch (error) {
    console.error('Delete task failed:', error);
    return res.status(500).json({ message: 'Server error deleting task' });
  }
});

// ==================== ATTENDANCE OVERVIEW (ADMIN) ====================

router.get('/attendance', authenticateToken, requireRole(['admin']), async (req: AuthRequest, res: Response) => {
  try {
    const { startDate, endDate, department = 'all' } = req.query as {
      startDate?: string;
      endDate?: string;
      department?: string;
    };

    const today = new Date();
    const defaultStart = new Date(today.getFullYear(), today.getMonth(), 1);
    const defaultEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0);

    const start = startDate ? new Date(startDate) : defaultStart;
    const end = endDate ? new Date(endDate) : defaultEnd;

    const dateFilter = {
      date: {
        $gte: start.toISOString().split('T')[0],
        $lte: end.toISOString().split('T')[0],
      },
    } as any;

    const records = await Attendance.find(dateFilter).limit(500);
    const userIds = records.map((r) => r.userId);
    const users = await User.find({ _id: { $in: userIds } });
    const profiles = await Profile.find({ user: { $in: userIds } });

    const userMap = new Map<string, any>();
    users.forEach((u) => userMap.set(String(u._id), u));
    const profileMap = new Map<string, any>();
    profiles.forEach((p) => profileMap.set(String(p.user), p));

    const attendance = records
      .map((r) => {
        const u = userMap.get(String(r.userId));
        const p = profileMap.get(String(r.userId));
        const deptName = p?.department || 'General';

        return {
          id: String(r._id),
          staffName: u?.name || r.name || 'Staff member',
          staffCode: `STF${String(r.userId).slice(-4).toUpperCase()}`,
          date: r.date,
          checkIn: r.checkIn ? new Date(r.checkIn).toISOString().substring(11, 16) : '-',
          checkOut: r.checkOut ? new Date(r.checkOut).toISOString().substring(11, 16) : '-',
          status: (r.status as any) || 'present',
          department: deptName,
          overtime: r.totalHours && r.totalHours > 8 ? Number((r.totalHours - 8).toFixed(1)) : 0,
        };
      })
      .filter((rec) => department === 'all' || rec.department === department);

    return res.json({ attendance });
  } catch (error) {
    console.error('Admin attendance overview error:', error);
    return res.status(500).json({ message: 'Server error fetching attendance' });
  }
});

// ==================== SHIFT MANAGEMENT ====================

// Get all shifts
router.get('/shifts', authenticateToken, requireRole(['admin']), async (_req: AuthRequest, res: Response) => {
  try {
    const shifts = await Shift.find({}).sort({ createdAt: -1 });
    const mapped = shifts.map((s) => ({
      id: String(s._id),
      name: s.name,
      startTime: s.startTime,
      endTime: s.endTime,
      days: s.days,
      location: s.location,
      staffCount: s.staffCount,
      isActive: s.isActive,
      createdAt: s.createdAt,
    }));

    res.json({ shifts: mapped });
  } catch (error) {
    console.error('Get shifts failed:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Create new shift
router.post('/shifts', authenticateToken, requireRole(['admin']), async (req: AuthRequest, res: Response) => {
  try {
    const { name, startTime, endTime, days, location } = req.body;

    if (!name || !startTime || !endTime) {
      return res.status(400).json({ message: 'Name, start time and end time are required' });
    }

    const shift = new Shift({
      name,
      startTime,
      endTime,
      days: Array.isArray(days) ? days : [],
      location: location || 'Main Office',
    });

    await shift.save();

    return res.status(201).json({
      id: String(shift._id),
      name: shift.name,
      startTime: shift.startTime,
      endTime: shift.endTime,
      days: shift.days,
      location: shift.location,
      staffCount: shift.staffCount,
      isActive: shift.isActive,
      createdAt: shift.createdAt,
    });
  } catch (error) {
    console.error('Create shift failed:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Toggle shift active status
router.put('/shifts/:id/status', authenticateToken, requireRole(['admin']), async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { isActive } = req.body as { isActive: boolean };

    const shift = await Shift.findByIdAndUpdate(
      id,
      { isActive },
      { new: true }
    );

    if (!shift) {
      return res.status(404).json({ message: 'Shift not found' });
    }

    return res.json({
      id: String(shift._id),
      name: shift.name,
      startTime: shift.startTime,
      endTime: shift.endTime,
      days: shift.days,
      location: shift.location,
      staffCount: shift.staffCount,
      isActive: shift.isActive,
      createdAt: shift.createdAt,
    });
  } catch (error) {
    console.error('Update shift status failed:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Delete shift
router.delete('/shifts/:id', authenticateToken, requireRole(['admin']), async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    const deleted = await Shift.findByIdAndDelete(id);
    if (!deleted) {
      return res.status(404).json({ message: 'Shift not found' });
    }

    return res.json({ message: 'Shift deleted successfully' });
  } catch (error) {
    console.error('Delete shift failed:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Seed default shifts (Morning, Evening, Night, Flexible)
router.post('/seed-shifts', authenticateToken, requireRole(['admin']), async (_req: AuthRequest, res: Response) => {
  try {
    const defaultShifts = [
      {
        name: 'Morning Shift',
        startTime: '09:00',
        endTime: '17:00',
        days: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],
        location: 'Main Office',
        staffCount: 0,
        isActive: true,
      },
      {
        name: 'Evening Shift',
        startTime: '14:00',
        endTime: '22:00',
        days: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],
        location: 'Main Office',
        staffCount: 0,
        isActive: true,
      },
      {
        name: 'Night Shift',
        startTime: '22:00',
        endTime: '06:00',
        days: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],
        location: 'Main Office',
        staffCount: 0,
        isActive: false,
      },
      {
        name: 'Flexible Shift',
        startTime: '00:00',
        endTime: '23:59',
        days: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
        location: 'Remote',
        staffCount: 0,
        isActive: true,
      },
    ];

    // Optional: clear existing shifts before seeding
    await Shift.deleteMany({});
    const inserted = await Shift.insertMany(defaultShifts);

    return res.json({
      message: 'Default shifts seeded successfully',
      count: inserted.length,
      shifts: inserted.map((s) => ({
        id: String(s._id),
        name: s.name,
        startTime: s.startTime,
        endTime: s.endTime,
        days: s.days,
        location: s.location,
        staffCount: s.staffCount,
        isActive: s.isActive,
      })),
    });
  } catch (error) {
    console.error('Seed shifts failed:', error);
    res.status(500).json({ message: 'Server error seeding shifts' });
  }
});

// ==================== SYSTEM ANALYTICS ====================

// Get performance analytics data (DB-driven, no mock randomness)
router.get('/analytics', authenticateToken, requireRole(['admin']), async (req: AuthRequest, res: Response) => {
  try {
    const { period = 'monthly', department = 'all' } = req.query as {
      period?: string;
      department?: string;
    };

    // Determine date window (approximate) for analytics
    const now = new Date();
    let start: Date;
    if (period === 'yearly') {
      start = new Date(now.getFullYear(), 0, 1);
    } else if (period === 'quarterly') {
      const qStartMonth = Math.floor(now.getMonth() / 3) * 3;
      start = new Date(now.getFullYear(), qStartMonth, 1);
    } else {
      // monthly default
      start = new Date(now.getFullYear(), now.getMonth(), 1);
    }
    const startDateStr = start.toISOString().split('T')[0];
    const endDateStr = now.toISOString().split('T')[0];

    // Staff filter
    const staffQuery: any = { isActive: true };
    if (department && department !== 'all') {
      staffQuery.department = department;
    }

    const staffMembers = await User.find(staffQuery).select('name department lastLogin');
    if (!staffMembers.length) {
      return res.json({ performance: [] });
    }

    const staffIds = staffMembers.map((s) => s._id);

    // Attendance in period
    const attendance = await Attendance.find({
      userId: { $in: staffIds },
      date: { $gte: startDateStr, $lte: endDateStr },
    }).select('userId status');

    // Tasks in period
    const tasks = await Task.find({
      assignedTo: { $in: staffIds },
      createdAt: { $gte: start, $lte: now },
    }).select('assignedTo status');

    const attByUser = new Map<string, { total: number; present: number }>();
    attendance.forEach((a) => {
      const key = String(a.userId);
      const entry = attByUser.get(key) || { total: 0, present: 0 };
      entry.total += 1;
      if (a.status === 'present') entry.present += 1;
      attByUser.set(key, entry);
    });

    const tasksByUser = new Map<string, { total: number; completed: number }>();
    tasks.forEach((t) => {
      const key = String(t.assignedTo);
      const entry = tasksByUser.get(key) || { total: 0, completed: 0 };
      entry.total += 1;
      if (t.status === 'completed') entry.completed += 1;
      tasksByUser.set(key, entry);
    });

    const performanceData = staffMembers.map((staff) => {
      const key = String(staff._id);
      const att = attByUser.get(key) || { total: 0, present: 0 };
      const taskStats = tasksByUser.get(key) || { total: 0, completed: 0 };

      const attendancePct = att.total > 0 ? Math.round((att.present / att.total) * 100) : 0;
      const productivityPct = taskStats.total > 0 ? Math.round((taskStats.completed / taskStats.total) * 100) : 0;

      // Simple scoring model
      const qualityScore = Math.min(100, Math.round((attendancePct + productivityPct) / 2) + 5);
      const teamworkScore = Math.min(100, Math.round(qualityScore * 0.9));
      const overallScore = Math.round(
        attendancePct * 0.35 +
        productivityPct * 0.35 +
        qualityScore * 0.15 +
        teamworkScore * 0.15
      );

      let trend: 'up' | 'down' | 'stable' = 'stable';
      if (overallScore >= 85) trend = 'up';
      else if (overallScore <= 70) trend = 'down';

      const goalsCompleted = taskStats.completed;
      const totalGoals = Math.max(taskStats.total, goalsCompleted || 1);

      return {
        staffName: staff.name,
        department: (staff as any).department || 'Unassigned',
        overallScore,
        attendanceScore: attendancePct,
        productivityScore: productivityPct,
        qualityScore,
        teamworkScore,
        trend,
        goalsCompleted,
        totalGoals,
      };
    });

    return res.json({ performance: performanceData });
  } catch (error) {
    console.error('Get analytics failed:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Dashboard stats endpoint
router.get('/dashboard-stats', authenticateToken, requireRole(['admin']), async (req: AuthRequest, res: Response) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const [
      totalStaff,
      totalDepartments,
      allTasks,
      allAttendance,
      todayAttendanceRecords,
      thirtyDayAttendanceRecords,
      allLeaveRequests,
      recentTasks
    ] = await Promise.all([
      User.countDocuments({ role: { $ne: 'admin' } }),
      Department.countDocuments(),
      Task.find(),
      Attendance.find(),
      Attendance.find({ date: { $gte: today } }),
      Attendance.find({ date: { $gte: thirtyDaysAgo } }),
      LeaveRequest.find(),
      Task.find().sort({ createdAt: -1 }).limit(5).select('title status assignedTo createdAt')
    ]);

    // Real task calculations
    const completedTasks = allTasks.filter(task => task.status === 'completed').length;
    const pendingTasks = allTasks.filter(task => task.status === 'pending').length;
    const lastWeekPending = allTasks.filter(task => 
      task.status === 'pending' && 
      new Date(task.createdAt) > new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
    ).length;
    const pendingChange = lastWeekPending - pendingTasks;

    // Real attendance calculations
    const todayPresent = todayAttendanceRecords.filter(record => record.checkIn).length;
    const thirtyDayPresent = thirtyDayAttendanceRecords.filter(record => record.checkIn).length;
    const averageAttendance = thirtyDayAttendanceRecords.length > 0 
      ? (thirtyDayPresent / thirtyDayAttendanceRecords.length) * 100 
      : 0;
    
    // Calculate attendance change from last month
    const lastMonthStart = new Date();
    lastMonthStart.setDate(lastMonthStart.getDate() - 60);
    const lastMonthEnd = new Date();
    lastMonthEnd.setDate(lastMonthEnd.getDate() - 30);
    
    const lastMonthAttendance = await Attendance.find({
      date: { $gte: lastMonthStart, $lte: lastMonthEnd }
    });
    const lastMonthPresent = lastMonthAttendance.filter(record => record.checkIn).length;
    const lastMonthAverage = lastMonthAttendance.length > 0 
      ? (lastMonthPresent / lastMonthAttendance.length) * 100 
      : 0;
    
    const attendanceChange = averageAttendance - lastMonthAverage;

    res.json({
      averageAttendance: Math.round(averageAttendance * 10) / 10,
      totalPresent: todayPresent,
      attendanceChange: Math.round(attendanceChange * 10) / 10,
      completedTasks,
      pendingTasks,
      pendingChange,
      totalStaff,
      totalDepartments,
      totalAttendance: allAttendance.length,
      recentActivities: recentTasks
    });
  } catch (error) {
    console.error('Dashboard stats error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Recent activity endpoint
router.get('/recent-activity', authenticateToken, requireRole(['admin']), async (req: AuthRequest, res: Response) => {
  try {
    const recentTasks = await Task.find()
      .sort({ createdAt: -1 })
      .limit(10)
      .select('title status assignedTo createdAt completedAt')
      .populate('assignedTo', 'name email');

    const recentAttendance = await Attendance.find()
      .sort({ date: -1 })
      .limit(5)
      .populate('userId', 'name email');

    const activities = [
      ...recentTasks.map(task => ({
        type: 'task',
        title: `Task "${task.title}" ${task.status}`,
        user: task.assignedTo?.name || 'Unknown',
        timestamp: task.completedAt || task.createdAt,
        status: task.status
      })),
      ...recentAttendance.map(attendance => ({
        type: 'attendance',
        title: `Attendance ${attendance.checkIn ? 'checked in' : 'checked out'}`,
        user: attendance.userId?.name || 'Unknown',
        timestamp: attendance.date,
        status: attendance.checkIn ? 'present' : 'absent'
      }))
    ].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()).slice(0, 10);

    res.json({ activities });
  } catch (error) {
    console.error('Recent activity error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Attendance overview endpoint
router.get('/attendance-overview', authenticateToken, requireRole(['admin']), async (req: AuthRequest, res: Response) => {
  try {
    const { startDate, endDate } = req.query;
    
    let dateFilter = {};
    if (startDate && endDate) {
      dateFilter = {
        date: { $gte: new Date(startDate as string), $lte: new Date(endDate as string) }
      };
    } else {
      // Default to last 7 days for daily chart
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      dateFilter = { date: { $gte: sevenDaysAgo } };
    }

    const attendanceRecords = await Attendance.find(dateFilter)
      .populate('userId', 'name email department')
      .sort({ date: 1 });

    // Get all unique dates and create daily data
    const dailyMap = new Map();
    
    // Initialize last 7 days
    for (let i = 6; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      date.setHours(0, 0, 0, 0);
      const dateStr = date.toISOString().split('T')[0];
      const dayName = date.toLocaleDateString('en-US', { weekday: 'short' });
      
      dailyMap.set(dateStr, {
        day: dayName,
        attendanceRate: 0,
        presentCount: 0,
        totalCount: 0
      });
    }

    // Populate with real attendance data
    attendanceRecords.forEach(record => {
      const dateStr = record.date.toISOString().split('T')[0];
      const dayData = dailyMap.get(dateStr);
      
      if (dayData) {
        dayData.totalCount++;
        if (record.checkIn) {
          dayData.presentCount++;
        }
      }
    });

    // Calculate attendance rates
    dailyMap.forEach((dayData) => {
      dayData.attendanceRate = dayData.totalCount > 0 
        ? Math.round((dayData.presentCount / dayData.totalCount) * 1000) / 10 
        : 0;
    });

    // Calculate overall stats
    const totalRecords = attendanceRecords.length;
    const presentRecords = attendanceRecords.filter(record => record.checkIn).length;
    const averageAttendance = totalRecords > 0 ? (presentRecords / totalRecords) * 100 : 0;

    const dailyData = Array.from(dailyMap.values());

    res.json({
      averageAttendance: Math.round(averageAttendance * 10) / 10,
      totalPresent: presentRecords,
      totalRecords,
      dailyData
    });
  } catch (error) {
    console.error('Attendance overview error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// HR performance endpoint
router.get('/hr-performance', authenticateToken, requireRole(['admin']), async (req: AuthRequest, res: Response) => {
  try {
    const { period = 'monthly' } = req.query;
    
    let dateFilter = {};
    if (period === 'monthly') {
      const startOfMonth = new Date();
      startOfMonth.setDate(1);
      startOfMonth.setHours(0, 0, 0, 0);
      dateFilter = { createdAt: { $gte: startOfMonth } };
    } else if (period === 'weekly') {
      const weekAgo = new Date();
      weekAgo.setDate(weekAgo.getDate() - 7);
      dateFilter = { createdAt: { $gte: weekAgo } };
    } else if (period === 'yearly') {
      const startOfYear = new Date();
      startOfYear.setMonth(0, 1);
      startOfYear.setHours(0, 0, 0, 0);
      dateFilter = { createdAt: { $gte: startOfYear } };
    }

    const [
      leaveRequests,
      totalStaff,
      attendanceRecords,
      tasks,
      departments
    ] = await Promise.all([
      LeaveRequest.find(dateFilter),
      User.countDocuments({ role: { $ne: 'admin' } }),
      Attendance.find(dateFilter),
      Task.find(dateFilter),
      Department.find()
    ]);

    // Real leave statistics
    const leaveStats = {
      sick: 0,
      vacation: 0,
      personal: 0,
      maternity: 0,
      emergency: 0,
      other: 0
    };

    leaveRequests.forEach(leave => {
      const type = (leave.type || 'other').toLowerCase();
      if (leaveStats.hasOwnProperty(type)) {
        leaveStats[type]++;
      } else {
        leaveStats.other++;
      }
    });

    const totalLeaves = leaveRequests.length;

    // Real attendance performance
    const totalAttendanceRecords = attendanceRecords.length;
    const presentRecords = attendanceRecords.filter(record => record.checkIn).length;
    const attendanceRate = totalAttendanceRecords > 0 ? (presentRecords / totalAttendanceRecords) * 100 : 0;

    // Real task performance
    const completedTasks = tasks.filter(task => task.status === 'completed').length;
    const pendingTasks = tasks.filter(task => task.status === 'pending').length;
    const inProgressTasks = tasks.filter(task => task.status === 'in-progress').length;
    const taskCompletionRate = tasks.length > 0 ? (completedTasks / tasks.length) * 100 : 0;

    // Department-wise performance
    const departmentPerformance = await Promise.all(
      departments.map(async (dept) => {
        const deptUsers = await User.find({ department: dept.name });
        const deptUserIds = deptUsers.map(user => user._id);
        
        const deptAttendance = await Attendance.find({
          userId: { $in: deptUserIds },
          ...dateFilter
        });
        
        const deptPresent = deptAttendance.filter(record => record.checkIn).length;
        const deptAttendanceRate = deptAttendance.length > 0 ? (deptPresent / deptAttendance.length) * 100 : 0;
        
        const deptTasks = await Task.find({
          assignedTo: { $in: deptUserIds },
          ...dateFilter
        });
        
        const deptCompleted = deptTasks.filter(task => task.status === 'completed').length;
        const deptTaskRate = deptTasks.length > 0 ? (deptCompleted / deptTasks.length) * 100 : 0;

        return {
          department: dept.name,
          staffCount: deptUsers.length,
          attendanceRate: Math.round(deptAttendanceRate * 10) / 10,
          taskCompletionRate: Math.round(deptTaskRate * 10) / 10
        };
      })
    );

    res.json({
      totalLeaves,
      sickLeaves: leaveStats.sick,
      vacationLeaves: leaveStats.vacation,
      personalLeaves: leaveStats.personal,
      maternityLeaves: leaveStats.maternity,
      emergencyLeaves: leaveStats.emergency,
      otherLeaves: leaveStats.other,
      attendanceRate: Math.round(attendanceRate * 10) / 10,
      taskCompletionRate: Math.round(taskCompletionRate * 10) / 10,
      totalStaff,
      completedTasks,
      pendingTasks,
      inProgressTasks,
      totalTasks: tasks.length,
      departmentPerformance,
      period
    });
  } catch (error) {
    console.error('HR performance error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// ==================== ADMIN PROFILE MANAGEMENT ====================

// Get current admin's profile
router.get('/profile', authenticateToken, requireRole(['admin']), async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    
    // Get user data
    const user = await User.findById(userId).select('-password');
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Get profile data
    const profile = await Profile.findOne({ user: userId });
    
    // Combine user and profile data
    const profileData = {
      id: user._id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      role: user.role,
      department: user.department,
      profileImage: user.profilePicture,
      address: user.address,
      cnic: user.cnic,
      createdAt: user.createdAt,
      lastLogin: user.lastLogin,
      // Add profile-specific fields if they exist
      avatarUrl: profile?.avatarUrl,
      bio: profile?.bio,
      skills: profile?.skills,
      experience: profile?.experience,
      education: profile?.education,
      isComplete: profile?.isComplete || false
    };

    res.json(profileData);
  } catch (error) {
    console.error('Get admin profile error:', error);
    res.status(500).json({ message: 'Server error fetching profile' });
  }
});

// Update current admin's profile
router.put('/profile', authenticateToken, requireRole(['admin']), async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const { name, phone, department, role, address, cnic, bio, skills, experience, education } = req.body;
    
    // Update user data
    const userUpdateData: any = {};
    if (name !== undefined) userUpdateData.name = name;
    if (phone !== undefined) userUpdateData.phone = phone;
    if (department !== undefined) userUpdateData.department = department;
    if (role !== undefined) userUpdateData.role = role;
    if (address !== undefined) userUpdateData.address = address;
    if (cnic !== undefined) userUpdateData.cnic = cnic;

    const updatedUser = await User.findByIdAndUpdate(
      userId,
      userUpdateData,
      { new: true, runValidators: true }
    ).select('-password');

    // Update or create profile data
    const profileUpdateData: any = {};
    if (bio !== undefined) profileUpdateData.bio = bio;
    if (skills !== undefined) profileUpdateData.skills = skills;
    if (experience !== undefined) profileUpdateData.experience = experience;
    if (education !== undefined) profileUpdateData.education = education;
    profileUpdateData.isComplete = true;

    const updatedProfile = await Profile.findOneAndUpdate(
      { user: userId },
      profileUpdateData,
      { new: true, upsert: true }
    );

    // Combine updated data
    const profileData = {
      id: updatedUser!._id,
      name: updatedUser.name,
      email: updatedUser.email,
      phone: updatedUser.phone,
      role: updatedUser.role,
      department: updatedUser.department,
      profileImage: updatedUser.profilePicture,
      address: updatedUser.address,
      cnic: updatedUser.cnic,
      createdAt: updatedUser.createdAt,
      lastLogin: updatedUser.lastLogin,
      avatarUrl: updatedProfile?.avatarUrl,
      bio: updatedProfile?.bio,
      skills: updatedProfile?.skills,
      experience: updatedProfile?.experience,
      education: updatedProfile?.education,
      isComplete: updatedProfile?.isComplete || false
    };

    res.json({
      message: 'Profile updated successfully',
      profile: profileData
    });
  } catch (error) {
    console.error('Update admin profile error:', error);
    res.status(500).json({ message: 'Server error updating profile' });
  }
});

// Upload profile image for admin
router.post('/profile/upload-image', authenticateToken, requireRole(['admin']), upload.single('profilePicture'), async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    
    if (!req.file) {
      return res.status(400).json({ message: 'No image file provided' });
    }

    const uploaded = await uploadToCloudinary(req.file, {
      folder: "attendance-system/avatars",
      resource_type: "image",
    });
    const imagePath = uploaded.secureUrl;

    // Update user's profile picture
    const updatedUser = await User.findByIdAndUpdate(
      userId,
      { profilePicture: imagePath },
      { new: true }
    ).select('-password');

    // Also update profile if it exists
    await Profile.findOneAndUpdate(
      { user: userId },
      { avatarUrl: imagePath, isComplete: true },
      { new: true, upsert: true }
    );

    res.json({
      message: 'Profile image uploaded successfully',
      profileImage: imagePath,
      user: updatedUser
    });
  } catch (error) {
    console.error('Upload profile image error:', error);
    res.status(500).json({ message: 'Server error uploading image' });
  }
});

// Get profile stats for admin
router.get('/profile/stats', authenticateToken, requireRole(['admin']), async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    
    // Get user's task stats
    const totalTasks = await Task.countDocuments({ assignedTo: userId });
    const completedTasks = await Task.countDocuments({ 
      assignedTo: userId, 
      status: 'completed' 
    });
    const pendingTasks = await Task.countDocuments({ 
      assignedTo: userId, 
      status: 'pending' 
    });
    const inProgressTasks = await Task.countDocuments({ 
      assignedTo: userId, 
      status: 'in-progress' 
    });

    // Get attendance stats for this user
    const attendanceRecords = await Attendance.find({ userId });
    const totalAttendanceDays = attendanceRecords.length;
    const presentDays = attendanceRecords.filter(record => 
      record.status === 'present' || record.status === 'checked-in'
    ).length;
    const lateDays = attendanceRecords.filter(record => 
      record.status === 'late'
    ).length;

    // Get team members count (if admin)
    const user = await User.findById(userId);
    const teamMembersCount = user?.role === 'admin' 
      ? await User.countDocuments({ isActive: true, role: { $ne: 'admin' } })
      : 0;

    const stats = {
      tasks: {
        total: totalTasks,
        completed: completedTasks,
        pending: pendingTasks,
        inProgress: inProgressTasks,
        completionRate: totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0
      },
      attendance: {
        totalDays: totalAttendanceDays,
        presentDays,
        lateDays,
        attendanceRate: totalAttendanceDays > 0 ? Math.round((presentDays / totalAttendanceDays) * 100) : 0
      },
      team: {
        membersCount: teamMembersCount
      }
    };

    res.json(stats);
  } catch (error) {
    console.error('Get profile stats error:', error);
    res.status(500).json({ message: 'Server error fetching profile stats' });
  }
});

// Get available roles
router.get('/roles', authenticateToken, requireRole(['admin']), async (req: AuthRequest, res: Response) => {
  try {
    const roles = [
      { name: 'admin', displayName: 'Administrator', description: 'Full system access' },
      { name: 'hr', displayName: 'HR Manager', description: 'HR and staff management' },
      { name: 'owner', displayName: 'Owner', description: 'Business owner' },
      { name: 'staff', displayName: 'Staff Member', description: 'Regular staff' }
    ];

    res.json({ roles });
  } catch (error) {
    console.error('Get roles error:', error);
    res.status(500).json({ message: 'Server error fetching roles' });
  }
});

export default router;
