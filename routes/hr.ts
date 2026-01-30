import express, { Router, Response } from 'express';
import mongoose from 'mongoose';
import { authenticateToken, requireRole, AuthRequest } from '../middleware/auth';
import { User } from '../models/User';
import { SalaryPlan } from '../models/SalaryPlan';
import { LeaveRequest } from '../models/LeaveRequest';
import { Attendance } from '../models/Attendance';
import { AttendanceCorrectionReport } from '../models/AttendanceCorrectionReport';
import { Notification } from '../models/Notification';

const router = express.Router();

// HR Dashboard: Get dashboard statistics
router.get('/dashboard', authenticateToken, requireRole(['hr', 'admin', 'owner']), async (req: AuthRequest, res: Response) => {
  try {
    console.log('HR Dashboard accessed by:', req.user?.email, 'Role:', req.user?.role);

    // Debug: Check all users first
    const allUsers = await User.find({});
    console.log('Total users in database:', allUsers.length);
    
    // Debug: Check active users
    const activeUsers = await User.find({ isActive: true });
    console.log('Active users in database:', activeUsers.length);
    
    // Debug: Check HR and staff users
    const hrStaffUsers = await User.find({ role: { $in: ['hr', 'staff'] } });
    console.log('HR and Staff users (including inactive):', hrStaffUsers.length);
    
    // Debug: Show sample users
    if (allUsers.length > 0) {
      console.log('Sample users:');
      allUsers.slice(0, 3).forEach(user => {
        console.log(`- ${user.name} (${user.email}) - Role: ${user.role} - Active: ${user.isActive}`);
      });
    }

    // Get staff statistics
    const totalStaff = await User.countDocuments({ 
      role: { $in: ['hr', 'staff'] }, 
      isActive: true 
    });

    console.log('Total staff found (HR + Staff, Active only):', totalStaff);

    const staffByDepartment = await User.aggregate([
      { $match: { role: { $in: ['hr', 'staff'] }, isActive: true } },
      { $group: { _id: '$department', count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]);

    // Get salary plan statistics
    const activeSalaryPlans = await SalaryPlan.countDocuments({ status: 'active' });
    const totalSalaryPlans = await SalaryPlan.countDocuments();

    // Get pending leave requests count
    const pendingLeaveRequests = await LeaveRequest.countDocuments({ 
      status: 'pending' 
    });

    // Get today's attendance summary for late staff calculation
    const today = new Date().toISOString().split('T')[0];
    const todayAttendance = await Attendance.find({
      date: today,
      checkIn: { $exists: true }
    });

    // Filter for staff who checked in after 9:00 AM (considered late)
    const lateStaffToday = todayAttendance.filter(record => {
      const checkInTime = new Date(record.checkIn);
      const lateThreshold = new Date(record.checkIn);
      lateThreshold.setHours(9, 0, 0, 0); // 9:00 AM
      return checkInTime > lateThreshold;
    }).length;

    console.log('Total attendance today:', todayAttendance.length);
    console.log('Late staff count:', lateStaffToday);

    // Get complete today's attendance summary
    const completeTodayAttendance = await Attendance.find({
      date: today
    })
    .populate('userId', 'name email department role')
    .sort({ checkIn: 1 });

    // Get all staff for percentage calculation
    const allActiveStaff = await User.find({
      role: { $in: ['hr', 'staff'] },
      isActive: true
    });

    const totalActiveStaff = allActiveStaff.length;
    const presentToday = completeTodayAttendance.filter(record => 
      record.checkIn && record.status !== 'on-leave'
    ).length;
    const absentToday = totalActiveStaff - presentToday;
    const attendancePercentage = totalActiveStaff > 0 ? Math.round((presentToday / totalActiveStaff) * 100) : 0;

    console.log('Today attendance summary:', {
      date: today,
      totalStaff: totalActiveStaff,
      present: presentToday,
      absent: absentToday,
      percentage: attendancePercentage
    });

    res.json({
      success: true,
      data: {
        totalStaff: totalStaff,
        staffByDepartment: staffByDepartment,
        activeSalaryPlans: activeSalaryPlans,
        totalSalaryPlans: totalSalaryPlans,
        pendingLeaveRequests: pendingLeaveRequests,
        lateStaffToday: lateStaffToday,
        presentToday: presentToday,
        absentToday: absentToday,
        attendancePercentage: attendancePercentage
      }
    });

  } catch (error) {
    console.error('HR Dashboard error:', error);
    res.status(500).json({ 
      success: false,
      message: 'Server error loading HR dashboard' 
    });
  }
});

// HR: Get all staff with their salary plans
router.get('/staff-list', authenticateToken, requireRole(['hr', 'admin', 'owner']), async (req: AuthRequest, res: Response) => {
  try {
    console.log('=== HR STAFF-LIST API CALLED ===');
    console.log('User accessing staff-list endpoint:', {
      userId: req.user?.userId,
      email: req.user?.email,
      role: req.user?.role
    });
    
    // Get all active HR and staff users
    const users = await User.find({ 
      role: { $in: ['hr', 'staff'] },
      isActive: true 
    }).select('name email role department');

    console.log('Found users:', users.length);

    const staff = [];

    for (const user of users) {
      try {
        // Get salary plan for this user
        const salaryPlan = await SalaryPlan.findOne({ 
          userId: user._id, 
          status: 'active' 
        });

        const staffData = {
          userId: String(user._id),
          name: user.name,
          email: user.email,
          department: user.department || 'Not Assigned',
          role: user.role,
          hourlyRate: salaryPlan?.hourlyRate || 0,
          overtimeRate: salaryPlan?.overtimeRate || 1.5,
          status: salaryPlan?.status || 'inactive'
        };

        console.log('Staff data:', staffData);
        staff.push(staffData);

      } catch (userError) {
        console.error(`Error getting salary plan for user ${user._id}:`, userError);
        staff.push({
          userId: String(user._id),
          name: user.name,
          email: user.email,
          department: user.department || 'Not Assigned',
          role: user.role,
          hourlyRate: 0,
          overtimeRate: 1.5,
          status: 'inactive',
          error: 'Error loading salary plan'
        });
      }
    }

    console.log('Final staff list:', staff);
    console.log('=== HR STAFF-LIST API COMPLETED ===');

    res.json({
      success: true,
      staff: staff
    });

  } catch (err) {
    console.error('HR Get staff-list error:', err);
    res.status(500).json({ 
      success: false,
      message: 'Server error getting staff list' 
    });
  }
});

// HR: Update staff salary rate
router.put('/staff-rate/:userId', authenticateToken, requireRole(['hr', 'admin', 'owner']), async (req: AuthRequest, res: Response) => {
  try {
    const { userId } = req.params;
    const { hourlyRate, overtimeRate, status } = req.body;
    
    console.log('HR Updating staff rate:', {
      requestUserId: req.user?.userId,
      targetUserId: userId,
      hourlyRate: hourlyRate,
      userRole: req.user?.role
    });
    
    if (!mongoose.isValidObjectId(userId)) {
      return res.status(400).json({ 
        success: false,
        message: 'Invalid user ID' 
      });
    }
    
    if (!hourlyRate || hourlyRate < 0) {
      return res.status(400).json({ 
        success: false,
        message: 'Valid hourly rate is required' 
      });
    }
    
    // Check if user exists and is staff/HR
    const user = await User.findOne({ 
      _id: userId, 
      role: { $in: ['hr', 'staff'] },
      isActive: true 
    });
    
    if (!user) {
      return res.status(404).json({ 
        success: false,
        message: 'Staff member not found' 
      });
    }
    
    // Update or create salary plan
    const salaryPlan = await SalaryPlan.findOneAndUpdate(
      { userId: user._id },
      { 
        hourlyRate: hourlyRate,
        overtimeRate: overtimeRate || 1.5,
        status: status || 'active',
        monthlyTargetHours: 160
      },
      { upsert: true, new: true }
    );
    
    res.json({
      success: true,
      message: 'Salary rate updated successfully',
      salaryPlan: {
        userId: String(salaryPlan.userId),
        hourlyRate: salaryPlan.hourlyRate,
        overtimeRate: salaryPlan.overtimeRate,
        status: salaryPlan.status
      }
    });
    
  } catch (err) {
    console.error('HR Update staff salary error:', err);
    res.status(500).json({ 
      success: false,
      message: 'Server error updating salary rate' 
    });
  }
});

// HR: Generate monthly salary for staff based on current rates
router.post('/generate-monthly', authenticateToken, requireRole(['hr', 'admin', 'owner']), async (req: AuthRequest, res: Response) => {
  try {
    const { month, staffIds } = req.body;
    
    const startDate = new Date(month + '-01');
    const endDate = new Date(startDate.getFullYear(), startDate.getMonth() + 1, 0);

    console.log('HR Generating monthly salary:', { month, staffIds });

    const results = [];

    for (const staffId of staffIds) {
      try {
        // Get user information
        const user = await User.findOne({ 
          _id: staffId, 
          role: { $in: ['hr', 'staff'] },
          isActive: true 
        });

        if (!user) {
          results.push({
            staffId: staffId,
            success: false,
            error: 'Staff member not found'
          });
          continue;
        }

        // Get salary plan
        const salaryPlan = await SalaryPlan.findOne({ 
          userId: user._id, 
          status: 'active' 
        });

        if (!salaryPlan) {
          results.push({
            staffId: staffId,
            staffName: user.name,
            success: false,
            error: 'No active salary plan found'
          });
          continue;
        }

        // Calculate monthly salary
        const monthlyTargetHours = salaryPlan.monthlyTargetHours || 160;
        const hourlyRate = salaryPlan.hourlyRate || 0;
        const overtimeRate = salaryPlan.overtimeRate || 1.5;

        // For now, calculate base salary (can be enhanced with actual work logs later)
        const baseSalary = monthlyTargetHours * hourlyRate;
        const overtimeSalary = 0; // Will be calculated from work logs
        const deductions = 0; // Will be calculated from penalties
        const netSalary = baseSalary + overtimeSalary - deductions;

        results.push({
          staffId: staffId,
          staffName: user.name,
          success: true,
          monthlySalary: {
            baseSalary: baseSalary,
            overtimeSalary: overtimeSalary,
            deductions: deductions,
            netSalary: netSalary,
            hourlyRate: hourlyRate,
            overtimeRate: overtimeRate
          }
        });

      } catch (userError) {
        console.error(`HR Error generating salary for staff ${staffId}:`, userError);
        results.push({
          staffId: staffId,
          success: false,
          error: 'Error generating salary'
        });
      }
    }

    res.json({
      success: true,
      month: month,
      results: results,
      message: 'Monthly salary generation completed'
    });

  } catch (err) {
    console.error('HR Generate monthly salary error:', err);
    res.status(500).json({ 
      success: false,
      message: 'Server error generating monthly salary' 
    });
  }
});

// HR: Get all leave requests
router.get('/leave-requests', authenticateToken, requireRole(['hr', 'admin', 'owner']), async (req: AuthRequest, res: Response) => {
  try {
    const requests = await LeaveRequest.find({})
    .populate('userId', 'name email department')
    .sort({ createdAt: -1 });

    res.json({
      success: true,
      requests: requests.map(req => ({
        id: req._id,
        staffId: req.userId,
        staffName: req.userName,
        staffEmail: req.userEmail,
        leaveType: req.leaveType || 'Leave',
        startDate: req.startDate || req.date,
        endDate: req.endDate || req.date,
        reason: req.reason,
        status: req.status,
        hrRemarks: req.hrRemarks,
        createdAt: req.createdAt,
        updatedAt: req.updatedAt,
        daysCount: req.daysCount || 1,
        department: req.department,
        profileImage: req.profileImage
      }))
    });
  } catch (error) {
    console.error('HR All leave requests error:', error);
    res.status(500).json({ 
      success: false,
      message: 'Server error loading all leave requests' 
    });
  }
});

// HR: Get pending leave requests
router.get('/leave-requests/pending', authenticateToken, requireRole(['hr', 'admin', 'owner']), async (req: AuthRequest, res: Response) => {
  try {
    const requests = await LeaveRequest.find({ 
      status: 'pending' 
    })
    .populate('userId', 'name email department')
    .sort({ createdAt: -1 })
    .limit(10); // Limit to recent 10 requests

    res.json({
      success: true,
      requests: requests.map(req => ({
        id: req._id,
        staffId: req.userId,
        staffName: req.userName,
        staffEmail: req.userEmail,
        leaveType: req.leaveType || 'Leave',
        startDate: req.startDate || req.date,
        endDate: req.endDate || req.date,
        reason: req.reason,
        status: req.status,
        hrRemarks: req.hrRemarks,
        createdAt: req.createdAt,
        updatedAt: req.updatedAt,
        daysCount: req.daysCount || 1,
        department: req.department,
        profileImage: req.profileImage
      }))
    });
  } catch (error) {
    console.error('HR Leave requests error:', error);
    res.status(500).json({ 
      success: false,
      message: 'Server error loading leave requests' 
    });
  }
});

// HR: Create leave request notification for HR users
export const createLeaveRequestNotification = async (leaveRequest: any) => {
  try {
    // Get all HR users
    const hrUsers = await User.find({ role: 'hr', isActive: true });
    
    for (const hrUser of hrUsers) {
      await Notification.create({
        userId: hrUser._id,
        type: 'leave_request',
        message: `New leave request from ${leaveRequest.userName} for ${leaveRequest.leaveType || 'Leave'} - ${leaveRequest.reason || 'No reason provided'}`,
        read: false
      });
    }
  } catch (error) {
    console.error('Error creating leave request notification:', error);
  }
};

// HR: Approve leave request
router.post('/leave-requests/:id/approve', authenticateToken, requireRole(['hr', 'admin', 'owner']), async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { hrRemarks } = req.body;
    
    const lr = await LeaveRequest.findById(id);
    if (!lr) return res.status(404).json({ message: 'Leave request not found' });

    lr.status = 'approved';
    lr.hrRemarks = hrRemarks || '';
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
    }

    res.json({ message: 'Leave approved' });
  } catch (err) {
    console.error('Approve leave error:', err);
    res.status(500).json({ message: 'Server error approving leave' });
  }
});

// HR: Reject leave request
router.post('/leave-requests/:id/reject', authenticateToken, requireRole(['hr', 'admin', 'owner']), async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { hrRemarks } = req.body;
    
    const lr = await LeaveRequest.findById(id);
    if (!lr) return res.status(404).json({ message: 'Leave request not found' });

    lr.status = 'rejected';
    lr.hrRemarks = hrRemarks || '';
    lr.reviewedAt = new Date();
    await lr.save();

    res.json({ message: 'Leave rejected' });
  } catch (err) {
    console.error('Reject leave error:', err);
    res.status(500).json({ message: 'Server error rejecting leave' });
  }
});

// HR: Get late staff today
router.get('/late-staff-today', authenticateToken, requireRole(['hr', 'admin', 'owner']), async (req: AuthRequest, res: Response) => {
  try {
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];

    const lateStaff = await Attendance.find({
      date: todayStr,
      checkIn: { $exists: true }
    })
    .populate('userId', 'name email department')
    .sort({ checkIn: 1 });

    // Filter for staff who checked in after 9:00 AM (considered late)
    const lateStaffFiltered = lateStaff.filter(record => {
      const checkInTime = new Date(record.checkIn);
      const lateThreshold = new Date(record.checkIn);
      lateThreshold.setHours(9, 0, 0, 0); // 9:00 AM
      return checkInTime > lateThreshold;
    });

    res.json({
      success: true,
      lateStaff: lateStaffFiltered.map(staff => ({
        id: staff._id,
        userId: staff.userId,
        name: staff.name,
        date: staff.date,
        checkIn: staff.checkIn,
        checkOut: staff.checkOut
      }))
    });
  } catch (error) {
    console.error('HR Late staff error:', error);
    res.status(500).json({ 
      success: false,
      message: 'Server error loading late staff' 
    });
  }
});

// HR: Get attendance edit requests
router.get('/attendance-edit-requests', authenticateToken, requireRole(['hr', 'admin', 'owner']), async (req: AuthRequest, res: Response) => {
  try {
    const reports = await AttendanceCorrectionReport.find()
      .populate('userId', 'name email department profileImage')
      .sort({ createdAt: -1 });

    const mapStatus = (status: string) => {
      if (status === 'resolved') return 'approved';
      if (status === 'rejected') return 'rejected';
      return 'pending'; // 'new' | 'in-progress'
    };

    const toTimeIso = (dateStr: string, timeStr?: string | null) => {
      if (!timeStr) return undefined;
      // Expecting HH:mm, fallback to current time parsing
      const [hh, mm] = timeStr.split(':').map((v) => parseInt(v, 10));
      const d = new Date(dateStr);
      if (!isNaN(hh)) d.setHours(hh, isNaN(mm) ? 0 : mm, 0, 0);
      return d.toISOString();
    };

    const inferType = (subject?: string, details?: string, originalTime?: string | null) => {
      const s = `${subject || ''} ${details || ''}`.toLowerCase();
      const isCheckout = s.includes('check-out') || s.includes('checkout') || s.includes('check out');
      if (isCheckout) return originalTime ? 'wrong_checkout' : 'missing_checkout';
      return originalTime ? 'wrong_checkin' : 'missing_checkin';
    };

    const requests = reports.map((r: any) => {
      const user: any = r.userId;
      const requestType = inferType(r.subject, r.details, r.originalTime);
      const originalCheckIn = requestType.includes('checkin') ? toTimeIso(r.date, r.originalTime) : undefined;
      const originalCheckOut = requestType.includes('checkout') ? toTimeIso(r.date, r.originalTime) : undefined;
      const requestedCheckIn = requestType.includes('checkin') ? toTimeIso(r.date, r.requestedTime) : undefined;
      const requestedCheckOut = requestType.includes('checkout') ? toTimeIso(r.date, r.requestedTime) : undefined;

      return {
        id: r._id,
        staffId: String(user?._id || r.userId),
        staffName: user?.name || '',
        staffEmail: user?.email || '',
        date: r.date,
        requestType,
        reason: r.details || r.subject || '',
        status: mapStatus(r.status),
        originalCheckIn,
        originalCheckOut,
        requestedCheckIn,
        requestedCheckOut,
        hrRemarks: undefined,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
        department: user?.department,
        profileImage: user?.profileImage,
      };
    });

    res.json({ success: true, requests });
  } catch (error) {
    console.error('HR Attendance edit requests error:', error);
    res.status(500).json({ 
      success: false,
      message: 'Server error loading attendance edit requests' 
    });
  }
});

// HR: Create attendance edit request notification for HR users
export const createAttendanceEditNotification = async (editRequest: any) => {
  try {
    // Get all HR users
    const hrUsers = await User.find({ role: 'hr', isActive: true });
    
    for (const hrUser of hrUsers) {
      await Notification.create({
        userId: hrUser._id,
        type: 'attendance_edit',
        message: `New attendance edit request from ${editRequest.staffName} - ${editRequest.reason || 'No reason provided'}`,
        read: false
      });
    }
  } catch (error) {
    console.error('Error creating attendance edit notification:', error);
  }
};

// HR: Approve attendance edit request
router.post('/attendance-edit-requests/:id/approve', authenticateToken, requireRole(['hr', 'admin', 'owner']), async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { hrRemarks } = req.body as { hrRemarks?: string };

    const report: any = await AttendanceCorrectionReport.findById(id).populate('userId', 'name email');
    if (!report) return res.status(404).json({ message: 'Edit request not found' });

    const dateStr = report.date; // YYYY-MM-DD
    const userId = report.userId?._id || report.userId;
    const requestedTime: string | undefined = report.requestedTime || undefined;
    const subject: string | undefined = report.subject;
    const details: string | undefined = report.details;

    // Decide whether this is check-in or check-out correction
    const lower = `${subject || ''} ${details || ''}`.toLowerCase();
    const isCheckout = lower.includes('check-out') || lower.includes('checkout') || lower.includes('check out');

    const makeDateTime = (date: string, time?: string) => {
      if (!time) return undefined;
      const [hh, mm] = time.split(':').map((v) => parseInt(v, 10));
      const d = new Date(date);
      if (!isNaN(hh)) d.setHours(hh, isNaN(mm) ? 0 : mm, 0, 0);
      return d;
    };

    let attendance = await Attendance.findOne({ userId, date: dateStr });
    if (!attendance) {
      attendance = new Attendance({ userId, name: report.userId?.name, date: dateStr });
    }

    const corrected = makeDateTime(dateStr, requestedTime);
    if (corrected) {
      if (isCheckout) {
        attendance.checkOut = corrected;
        attendance.status = 'checked-out';
      } else {
        attendance.checkIn = corrected;
        if (!attendance.status || attendance.status === 'Absent' || attendance.status === 'on-leave') {
          attendance.status = 'checked-in';
        }
      }
    }

    await attendance.save();

    // Update report
    report.status = 'resolved';
    report.correctedTime = requestedTime;
    // hrRemarks is not stored in schema; ignore for now or extend schema in future
    await report.save();

    return res.json({ message: 'Edit request approved' });
  } catch (error) {
    console.error('Approve attendance edit error:', error);
    return res.status(500).json({ message: 'Server error approving edit request' });
  }
});

// HR: Reject attendance edit request
router.post('/attendance-edit-requests/:id/reject', authenticateToken, requireRole(['hr', 'admin', 'owner']), async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { hrRemarks } = req.body as { hrRemarks?: string };

    const report = await AttendanceCorrectionReport.findById(id);
    if (!report) return res.status(404).json({ message: 'Edit request not found' });

    report.status = 'rejected';
    await report.save();

    return res.json({ message: 'Edit request rejected' });
  } catch (error) {
    console.error('Reject attendance edit error:', error);
    return res.status(500).json({ message: 'Server error rejecting edit request' });
  }
});

// HR: Get assigned tasks
router.get('/tasks/assigned', authenticateToken, requireRole(['hr', 'admin', 'owner']), async (req: AuthRequest, res: Response) => {
  try {
    // This would need a task model
    // For now, return empty array
    res.json({
      success: true,
      tasks: []
    });
  } catch (error) {
    console.error('HR Tasks error:', error);
    res.status(500).json({ 
      success: false,
      message: 'Server error loading tasks' 
    });
  }
});

// HR: Get daily attendance records
router.get('/attendance/daily', authenticateToken, requireRole(['hr', 'admin', 'owner']), async (req: AuthRequest, res: Response) => {
  try {
    const { date } = req.query;
    const targetDate = date as string || new Date().toISOString().split('T')[0];

    console.log('HR Getting daily attendance for date:', targetDate);

    // First, let's check all attendance records in the database
    const allAttendance = await Attendance.find({});
    console.log('Total attendance records in database:', allAttendance.length);
    if (allAttendance.length > 0) {
      console.log('Sample attendance records:');
      allAttendance.slice(0, 3).forEach(record => {
        console.log(`- User: ${record.userId}, Date: ${record.date}, CheckIn: ${record.checkIn}`);
      });
    }

    // Try multiple date formats to find attendance records
    const attendanceRecords = await Attendance.find({
      $or: [
        { date: targetDate },
        { date: new Date(targetDate).toISOString().split('T')[0] },
        { date: new Date(targetDate).toLocaleDateString('en-CA') } // YYYY-MM-DD format
      ]
    })
    .populate('userId', 'name email department role')
    .sort({ checkIn: 1 });

    console.log('Found attendance records for date (flexible search):', attendanceRecords.length);
    if (attendanceRecords.length > 0) {
      console.log('Sample attendance record for date:', attendanceRecords[0]);
    }

    // Get all staff to show those without attendance
    const allStaff = await User.find({
      role: { $in: ['hr', 'staff'] },
      isActive: true
    }).select('name email department role');

    console.log('Found staff members:', allStaff.length);

    // Combine attendance records with staff who haven't checked in
    const staffAttendance = allStaff.map(staff => {
      // Try multiple ways to match attendance records
      const attendance = attendanceRecords.find(record => {
        // Method 1: Direct ObjectId match
        if (record.userId && record.userId.toString() === staff._id.toString()) {
          return true;
        }
        // Method 2: String match if userId is stored as string
        if (record.userId && record.userId.toString() === staff._id.toString()) {
          return true;
        }
        // Method 3: Check if the attendance record name matches staff name (fallback)
        if (record.name && record.name === staff.name) {
          return true;
        }
        return false;
      });

      console.log(`Matching staff ${staff.name} (${staff._id}) with attendance records...`);
      console.log(`Found attendance: ${attendance ? 'YES' : 'NO'}`);

      if (attendance) {
        // Determine real-time status based on check-in/check-out
        let realTimeStatus = 'Absent';
        if (attendance.checkIn && !attendance.checkOut) {
          realTimeStatus = 'Checked In';
        } else if (attendance.checkIn && attendance.checkOut) {
          realTimeStatus = 'Checked Out';
        } else if (attendance.status === 'on-leave') {
          realTimeStatus = 'On Leave';
        }

        console.log(`Staff ${staff.name} is ${realTimeStatus} with check-in: ${attendance.checkIn}`);
        return {
          id: attendance._id,
          userId: staff._id,
          name: staff.name,
          email: staff.email,
          department: staff.department,
          role: staff.role,
          date: attendance.date,
          checkIn: attendance.checkIn,
          checkOut: attendance.checkOut,
          status: realTimeStatus,
          totalHours: attendance.totalHours,
          lateMinutes: attendance.lateMinutes
        };
      } else {
        console.log(`Staff ${staff.name} is ABSENT (no attendance record found)`);
        return {
          id: null,
          userId: staff._id,
          name: staff.name,
          email: staff.email,
          department: staff.department,
          role: staff.role,
          date: targetDate,
          checkIn: null,
          checkOut: null,
          status: 'Absent',
          totalHours: null,
          lateMinutes: 0
        };
      }
    });

    res.json({
      success: true,
      attendanceRecords: staffAttendance,
      date: targetDate,
      totalStaff: allStaff.length,
      presentCount: staffAttendance.filter(s => s.checkIn).length,
      absentCount: staffAttendance.filter(s => !s.checkIn).length
    });

  } catch (error) {
    console.error('HR Daily attendance error:', error);
    res.status(500).json({ 
      success: false,
      message: 'Server error loading daily attendance' 
    });
  }
});

// HR: Get filter options for attendance
router.get('/attendance/filters', authenticateToken, requireRole(['hr', 'admin', 'owner']), async (req: AuthRequest, res: Response) => {
  try {
    console.log('HR Getting attendance filter options');

    // Get real departments from staff
    const departments = await User.aggregate([
      { $match: { role: { $in: ['hr', 'staff'] }, isActive: true } },
      { $group: { _id: '$department' } },
      { $sort: { _id: 1 } },
      { $project: { _id: 0, department: '$_id' } }
    ]);

    // Get real shifts (for now, return standard shifts - can be enhanced with shift model)
    const shifts = [
      { name: 'Morning', startTime: '09:00', endTime: '17:00' },
      { name: 'Evening', startTime: '14:00', endTime: '22:00' },
      { name: 'Night', startTime: '22:00', endTime: '06:00' }
    ];

    // Get real statuses based on attendance records
    const today = new Date().toISOString().split('T')[0];
    const uniqueStatuses = await Attendance.aggregate([
      { $match: { date: today } },
      { $group: { _id: '$status' } },
      { $sort: { _id: 1 } },
      { $project: { _id: 0, status: '$_id' } }
    ]);

    // Real-time statuses based on actual attendance states
    const statuses = ['All', 'Checked In', 'Checked Out', 'Absent', 'On Leave'];

    res.json({
      success: true,
      departments: ['All', ...departments.map(d => d.department || 'Unassigned')],
      shifts: ['All', ...shifts.map(s => s.name)],
      statuses: ['All', 'Checked In', 'Checked Out', 'Absent', 'On Leave']
    });

  } catch (error) {
    console.error('HR Attendance filters error:', error);
    res.status(500).json({ 
      success: false,
      message: 'Server error loading attendance filters' 
    });
  }
});

// HR: Get notifications for HR users
router.get('/notifications', authenticateToken, requireRole(['hr', 'admin', 'owner']), async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    
    const notifications = await Notification.find({ userId })
      .sort({ createdAt: -1 })
      .limit(50); // Limit to latest 50 notifications

    const unreadCount = await Notification.countDocuments({ 
      userId, 
      read: false 
    });

    res.json({
      success: true,
      notifications: notifications.map(n => ({
        id: String(n._id),
        type: n.type,
        message: n.message,
        read: n.read,
        createdAt: n.createdAt.toISOString(),
        updatedAt: n.updatedAt.toISOString()
      })),
      unreadCount,
      totalCount: notifications.length
    });
  } catch (error) {
    console.error('HR Notifications error:', error);
    res.status(500).json({ 
      success: false,
      message: 'Server error loading notifications' 
    });
  }
});

// HR: Mark notification as read
router.patch('/notifications/:id/read', authenticateToken, requireRole(['hr', 'admin', 'owner']), async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user!.userId;
    
    const notification = await Notification.findOne({ _id: id, userId });
    if (!notification) {
      return res.status(404).json({ 
        success: false,
        message: 'Notification not found' 
      });
    }

    notification.read = true;
    await notification.save();

    res.json({
      success: true,
      message: 'Notification marked as read'
    });
  } catch (error) {
    console.error('HR Mark notification read error:', error);
    res.status(500).json({ 
      success: false,
      message: 'Server error marking notification as read' 
    });
  }
});

// HR: Mark all notifications as read
router.patch('/notifications/read-all', authenticateToken, requireRole(['hr', 'admin', 'owner']), async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    
    await Notification.updateMany(
      { userId, read: false },
      { $set: { read: true } }
    );

    res.json({
      success: true,
      message: 'All notifications marked as read'
    });
  } catch (error) {
    console.error('HR Mark all notifications read error:', error);
    res.status(500).json({ 
      success: false,
      message: 'Server error marking all notifications as read' 
    });
  }
});

// HR: Get attendance report
router.get('/attendance-report', authenticateToken, requireRole(['hr', 'admin', 'owner']), async (req: AuthRequest, res: Response) => {
  try {
    const { startDate, endDate } = req.query;
    
    if (!startDate || !endDate) {
      return res.status(400).json({ 
        success: false,
        message: 'Start date and end date are required' 
      });
    }

    console.log(`HR Attendance Report requested: ${startDate} to ${endDate}`);

    // Get attendance records for the date range
    const attendanceRecords = await Attendance.find({
      date: {
        $gte: startDate,
        $lte: endDate
      }
    }).sort({ date: -1, name: 1 });

    console.log(`Found ${attendanceRecords.length} attendance records`);

    // Format the records for the frontend
    const formattedRecords = attendanceRecords.map(record => ({
      id: String(record._id),
      name: record.name || 'Unknown Staff',
      date: record.date,
      checkIn: record.checkIn,
      checkOut: record.checkOut,
      status: record.status || 'unknown',
      department: record.department || 'Unknown',
      shift: record.shift || 'Unknown',
      workHours: record.workHours || 0,
      overtime: record.overtime || 0,
      lateMinutes: record.lateMinutes || 0,
      leaveReason: record.leaveReason || ''
    }));

    res.json({
      success: true,
      records: formattedRecords,
      totalCount: formattedRecords.length,
      dateRange: {
        startDate,
        endDate
      }
    });

  } catch (error) {
    console.error('HR Attendance Report error:', error);
    res.status(500).json({ 
      success: false,
      message: 'Server error fetching attendance report' 
    });
  }
});

// HR: Get leave report
router.get('/leave-report', authenticateToken, requireRole(['hr', 'admin', 'owner']), async (req: AuthRequest, res: Response) => {
  try {
    const { startDate, endDate } = req.query;
    
    console.log(`HR Leave Report requested: ${startDate} to ${endDate}`);

    // Build date filter
    let dateFilter = {};
    if (startDate || endDate) {
      dateFilter = {};
      if (startDate) dateFilter.$gte = startDate;
      if (endDate) dateFilter.$lte = endDate;
    }

    // Get leave requests for the date range
    const leaveRequests = await LeaveRequest.find(
      dateFilter ? { date: dateFilter } : {}
    ).sort({ date: -1, requestedAt: -1 });

    console.log(`Found ${leaveRequests.length} leave requests`);

    // Format the records for the frontend
    const formattedRecords = leaveRequests.map(record => ({
      id: String(record._id),
      userId: String(record.userId),
      userName: record.userName || 'Unknown Staff',
      date: record.date,
      reason: record.reason || '',
      status: record.status || 'pending',
      requestedAt: record.requestedAt,
      reviewedAt: record.reviewedAt,
      reviewedBy: record.reviewedBy || ''
    }));

    // Calculate statistics
    const stats = {
      total: formattedRecords.length,
      pending: formattedRecords.filter(r => r.status === 'pending').length,
      approved: formattedRecords.filter(r => r.status === 'approved').length,
      rejected: formattedRecords.filter(r => r.status === 'rejected').length
    };

    res.json({
      success: true,
      records: formattedRecords,
      stats,
      totalCount: formattedRecords.length,
      dateRange: {
        startDate: startDate || null,
        endDate: endDate || null
      }
    });

  } catch (error) {
    console.error('HR Leave Report error:', error);
    res.status(500).json({ 
      success: false,
      message: 'Server error fetching leave report' 
    });
  }
});

// HR: Get performance report
router.get('/performance-report', authenticateToken, requireRole(['hr', 'admin', 'owner']), async (req: AuthRequest, res: Response) => {
  try {
    const { startDate, endDate } = req.query;
    
    console.log(`HR Performance Report requested: ${startDate} to ${endDate}`);

    // Get all staff users
    const staffUsers = await User.find({ 
      role: 'staff', 
      isActive: true 
    }).select('_id name email department');

    console.log(`Found ${staffUsers.length} staff users`);

    // Get attendance data for performance metrics
    let attendanceFilter = {};
    if (startDate || endDate) {
      attendanceFilter = {};
      if (startDate) attendanceFilter.$gte = startDate;
      if (endDate) attendanceFilter.$lte = endDate;
    }

    const attendanceRecords = await Attendance.find(
      attendanceFilter ? { date: attendanceFilter } : {}
    );

    // Get leave requests
    const leaveRequests = await LeaveRequest.find(
      attendanceFilter ? { date: attendanceFilter } : {}
    );

    // Calculate performance metrics for each staff
    const performanceData = staffUsers.map(user => {
      const userId = String(user._id);
      
      // Attendance metrics
      const userAttendance = attendanceRecords.filter(record => 
        String(record.userId) === userId
      );
      
      const totalDays = userAttendance.length;
      const presentDays = userAttendance.filter(r => r.status === 'present').length;
      const lateDays = userAttendance.filter(r => r.status === 'late').length;
      const absentDays = userAttendance.filter(r => r.status === 'absent').length;
      const leaveDays = userAttendance.filter(r => r.status === 'on-leave').length;
      
      // Leave metrics
      const userLeaves = leaveRequests.filter(leave => 
        String(leave.userId) === userId
      );
      
      const approvedLeaves = userLeaves.filter(l => l.status === 'approved').length;
      const rejectedLeaves = userLeaves.filter(l => l.status === 'rejected').length;
      const pendingLeaves = userLeaves.filter(l => l.status === 'pending').length;
      
      // Calculate performance score (0-100)
      let performanceScore = 0;
      if (totalDays > 0) {
        const attendanceRate = (presentDays / totalDays) * 100;
        const punctualityRate = totalDays > 0 ? ((presentDays + lateDays) / totalDays) * 100 : 0;
        performanceScore = (attendanceRate * 0.7) + (punctualityRate * 0.3);
      }
      
      return {
        userId: userId,
        name: user.name || 'Unknown Staff',
        email: user.email || '',
        department: user.department || 'Unknown',
        metrics: {
          totalDays,
          presentDays,
          lateDays,
          absentDays,
          leaveDays,
          approvedLeaves,
          rejectedLeaves,
          pendingLeaves,
          attendanceRate: totalDays > 0 ? ((presentDays / totalDays) * 100).toFixed(1) : '0',
          performanceScore: performanceScore.toFixed(1)
        }
      };
    });

    // Calculate overall statistics
    const overallStats = {
      totalStaff: staffUsers.length,
      averageAttendance: performanceData.reduce((sum, staff) => 
        sum + parseFloat(staff.metrics.attendanceRate), 0) / staffUsers.length,
      averagePerformance: performanceData.reduce((sum, staff) => 
        sum + parseFloat(staff.metrics.performanceScore), 0) / staffUsers.length,
      topPerformers: performanceData
        .sort((a, b) => parseFloat(b.metrics.performanceScore) - parseFloat(a.metrics.performanceScore))
        .slice(0, 5),
      departmentStats: calculateDepartmentStats(performanceData)
    };

    res.json({
      success: true,
      records: performanceData,
      stats: overallStats,
      dateRange: {
        startDate: startDate || null,
        endDate: endDate || null
      }
    });

  } catch (error) {
    console.error('HR Performance Report error:', error);
    res.status(500).json({ 
      success: false,
      message: 'Server error fetching performance report' 
    });
  }
});

// Helper function to calculate department statistics
function calculateDepartmentStats(performanceData: any[]) {
  const departments: { [key: string]: any[] } = {};
  
  performanceData.forEach(staff => {
    const dept = staff.department;
    if (!departments[dept]) {
      departments[dept] = [];
    }
    departments[dept].push(staff);
  });
  
  const deptStats: { [key: string]: any } = {};
  Object.keys(departments).forEach(dept => {
    const staffInDept = departments[dept];
    deptStats[dept] = {
      staffCount: staffInDept.length,
      avgPerformance: staffInDept.reduce((sum, staff) => 
        sum + parseFloat(staff.metrics.performanceScore), 0) / staffInDept.length,
      avgAttendance: staffInDept.reduce((sum, staff) => 
        sum + parseFloat(staff.metrics.attendanceRate), 0) / staffInDept.length
    };
  });
  
  return deptStats;
}

// HR: Get salary report
router.get('/salary-report', authenticateToken, requireRole(['hr', 'admin', 'owner']), async (req: AuthRequest, res: Response) => {
  try {
    const { startDate, endDate } = req.query;
    
    console.log(`HR Salary Report requested: ${startDate} to ${endDate}`);

    // Get all staff users
    const staffUsers = await User.find({ 
      role: 'staff', 
      isActive: true 
    }).select('_id name email department salaryPlan');

    console.log(`Found ${staffUsers.length} staff users`);

    // Build date filter for salary records
    let dateFilter = {};
    if (startDate || endDate) {
      dateFilter = {};
      if (startDate) dateFilter.$gte = startDate;
      if (endDate) dateFilter.$lte = endDate;
    }

    // Get salary records (we'll simulate this since we don't have a SalaryRecord model)
    // In a real app, you would have a SalaryRecord model with actual salary disbursement data
    const salaryRecords = await generateMockSalaryRecords(staffUsers, dateFilter);

    // Calculate salary statistics
    const totalSalaryPaid = salaryRecords.reduce((sum, record) => sum + record.amount, 0);
    const averageSalary = staffUsers.length > 0 ? totalSalaryPaid / staffUsers.length : 0;
    
    // Department-wise salary breakdown
    const departmentStats = calculateDepartmentSalaryStats(staffUsers, salaryRecords);
    
    // Monthly salary trends
    const monthlyTrends = calculateMonthlyTrends(salaryRecords);

    res.json({
      success: true,
      records: salaryRecords,
      stats: {
        totalStaff: staffUsers.length,
        totalSalaryPaid,
        averageSalary,
        departmentStats,
        monthlyTrends,
        topEarners: salaryRecords
          .sort((a, b) => b.amount - a.amount)
          .slice(0, 5)
      },
      dateRange: {
        startDate: startDate || null,
        endDate: endDate || null
      }
    });

  } catch (error) {
    console.error('HR Salary Report error:', error);
    res.status(500).json({ 
      success: false,
      message: 'Server error fetching salary report' 
    });
  }
});

// Helper function to generate mock salary records
async function generateMockSalaryRecords(staffUsers: any[], dateFilter: any) {
  const records = [];
  const currentMonth = new Date().getMonth();
  const currentYear = new Date().getFullYear();
  
  // Generate salary records for the last 6 months
  for (let i = 0; i < 6; i++) {
    const month = (currentMonth - i + 12) % 12;
    const year = month > currentMonth ? currentYear - 1 : currentYear;
    
    staffUsers.forEach(user => {
      // Simulate salary based on department and role
      let baseSalary = 30000; // Base salary
      
      // Adjust salary based on department
      switch (user.department) {
        case 'Engineering':
          baseSalary = 50000;
          break;
        case 'Sales':
          baseSalary = 35000;
          break;
        case 'HR':
          baseSalary = 32000;
          break;
        case 'Marketing':
          baseSalary = 33000;
          break;
        case 'Finance':
          baseSalary = 45000;
          break;
        default:
          baseSalary = 30000;
      }
      
      // Add some variation
      const variation = 0.9 + Math.random() * 0.2; // 90% to 110%
      const finalSalary = Math.round(baseSalary * variation);
      
      records.push({
        userId: String(user._id),
        userName: user.name || 'Unknown Staff',
        department: user.department || 'Unknown',
        month: month + 1,
        year: year,
        amount: finalSalary,
        status: 'paid', // In real app, this would be actual status
        paymentDate: new Date(year, month + 1, 5).toISOString(),
        deductions: Math.round(finalSalary * 0.1), // 10% deductions
        netSalary: Math.round(finalSalary * 0.9),
        paymentMethod: 'Bank Transfer'
      });
    });
  }
  
  // Filter by date range if provided
  if (dateFilter.$gte || dateFilter.$lte) {
    return records.filter(record => {
      const recordDate = new Date(record.year, record.month - 1, 1);
      if (dateFilter.$gte && recordDate < new Date(dateFilter.$gte)) return false;
      if (dateFilter.$lte && recordDate > new Date(dateFilter.$lte)) return false;
      return true;
    });
  }
  
  return records;
}

// Helper function to calculate department salary statistics
function calculateDepartmentSalaryStats(staffUsers: any[], salaryRecords: any[]) {
  const departments: { [key: string]: any[] } = {};
  
  // Group staff by department
  staffUsers.forEach(staff => {
    const dept = staff.department || 'Unknown';
    if (!departments[dept]) {
      departments[dept] = [];
    }
    departments[dept].push(staff);
  });
  
  const deptStats: { [key: string]: any } = {};
  Object.keys(departments).forEach(dept => {
    const staffInDept = departments[dept];
    const deptRecords = salaryRecords.filter(record => record.department === dept);
    
    deptStats[dept] = {
      staffCount: staffInDept.length,
      totalSalary: deptRecords.reduce((sum, record) => sum + record.amount, 0),
      averageSalary: deptRecords.length > 0 
        ? deptRecords.reduce((sum, record) => sum + record.amount, 0) / deptRecords.length 
        : 0,
      totalNetSalary: deptRecords.reduce((sum, record) => sum + record.netSalary, 0)
    };
  });
  
  return deptStats;
}

// Helper function to calculate monthly trends
function calculateMonthlyTrends(salaryRecords: any[]) {
  const monthlyData: { [key: string]: number } = {};
  
  salaryRecords.forEach(record => {
    const monthKey = `${record.year}-${record.month.toString().padStart(2, '0')}`;
    if (!monthlyData[monthKey]) {
      monthlyData[monthKey] = 0;
    }
    monthlyData[monthKey] += record.amount;
  });
  
  // Convert to array and sort by date
  return Object.keys(monthlyData)
    .sort()
    .map(monthKey => ({
      month: monthKey,
      totalSalary: monthlyData[monthKey]
    }));
}

// HR: Get HR profile
router.get('/profile', authenticateToken, requireRole(['hr', 'admin', 'owner']), async (req: AuthRequest, res: Response) => {
  try {
    console.log('HR Profile requested by:', req.user?.email, 'Role:', req.user?.role);

    // Get HR user data
    const hrUser = await User.findById(req.user?.id).select('-password');
    
    if (!hrUser) {
      console.log('User not found with ID:', req.user?.id);
      return res.status(404).json({ 
        success: false,
        message: 'User not found' 
      });
    }

    // Check if user has HR role
    if (!['hr', 'admin', 'owner'].includes(hrUser.role)) {
      console.log('User role not authorized:', hrUser.role);
      return res.status(403).json({ 
        success: false,
        message: 'Access denied. HR role required.' 
      });
    }

    // Get HR statistics
    const totalStaff = await User.countDocuments({ role: 'staff', isActive: true });
    const pendingLeaves = await LeaveRequest.countDocuments({ status: 'pending' });
    const attendanceRecords = await Attendance.find({}).limit(1000); // Last 1000 records
    const attendanceRate = attendanceRecords.length > 0 
      ? (attendanceRecords.filter(r => r.status === 'present').length / attendanceRecords.length) * 100 
      : 0;

    // Get reports count (using available models)
    const reportsCount = await LeaveRequest.countDocuments() + await Attendance.countDocuments();

    res.json({
      success: true,
      user: {
        ...hrUser.toObject(),
        staffCount: totalStaff,
        pendingLeaves,
        attendanceRate: attendanceRate.toFixed(1),
        reportsCount,
        position: 'HR Manager',
        experience: '5+ years',
        location: 'Main Office',
        joiningDate: hrUser.createdAt ? hrUser.createdAt.toISOString().split('T')[0] : '2023-01-01'
      }
    });

  } catch (error) {
    console.error('HR Profile error:', error);
    res.status(500).json({ 
      success: false,
      message: 'Server error fetching HR profile' 
    });
  }
});

// HR: Update HR profile
router.put('/profile', authenticateToken, requireRole(['hr', 'admin', 'owner']), async (req: AuthRequest, res: Response) => {
  try {
    console.log('HR Profile Update requested by:', req.user?.email);

    const { name, email, phone, location, position, experience, currentPassword, newPassword } = req.body;
    
    // Get HR user
    const hrUser = await User.findById(req.user?.id);
    
    if (!hrUser) {
      return res.status(404).json({ 
        success: false,
        message: 'User not found' 
      });
    }

    // Check if email is being changed and if it's already taken
    if (email && email !== hrUser.email) {
      const existingUser = await User.findOne({ email, _id: { $ne: hrUser._id } });
      if (existingUser) {
        return res.status(400).json({ 
          success: false,
          message: 'Email already exists' 
        });
      }
    }

    // Update basic profile fields
    if (name) hrUser.name = name;
    if (email) hrUser.email = email;
    if (phone) hrUser.phone = phone;
    if (location) hrUser.location = location;
    if (position) hrUser.position = position;
    if (experience) hrUser.experience = experience;

    // Handle password change if requested
    if (currentPassword && newPassword) {
      // Verify current password
      const isMatch = await hrUser.comparePassword(currentPassword);
      if (!isMatch) {
        return res.status(400).json({ 
          success: false,
          message: 'Current password is incorrect' 
        });
      }
      
      // Update password
      hrUser.password = newPassword;
    }

    // Save updated user
    await hrUser.save();

    // Return updated user data (without password)
    const updatedUser = hrUser.toObject();
    delete updatedUser.password;

    res.json({
      success: true,
      message: 'Profile updated successfully',
      user: updatedUser
    });

  } catch (error) {
    console.error('HR Profile Update error:', error);
    res.status(500).json({ 
      success: false,
      message: 'Server error updating profile' 
    });
  }
});

// HR: Create notification for HR users (internal function)
export const createHRNotification = async (
  userId: string,
  type: string,
  message: string
) => {
  try {
    await Notification.create({
      userId,
      type,
      message,
      read: false
    });
  } catch (error) {
    console.error('Error creating HR notification:', error);
  }
};

export default router;
