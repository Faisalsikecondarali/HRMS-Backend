import { Router, Response } from 'express';
import { authenticateToken, requireRole, AuthRequest } from '../middleware/auth';
import { User } from '../models/User';
import { Department } from '../models/Department';
import { Attendance } from '../models/Attendance';
import { MonthlySalary } from '../models/MonthlySalary';

const router = Router();

router.get('/dashboard-stats', authenticateToken, requireRole(['admin', 'owner']), async (req: AuthRequest, res: Response) => {
  try {
    // Staff counts (exclude admins from staff numbers)
    const [totalStaff, activeStaffDocs, inactiveStaff] = await Promise.all([
      User.countDocuments({ role: { $ne: 'admin' } }),
      User.find({ role: { $ne: 'admin' }, isActive: true }).select('_id'),
      User.countDocuments({ role: { $ne: 'admin' }, isActive: false })
    ]);

    const activeStaff = activeStaffDocs.length;

    // Department counts and top department by active staff
    const departmentsWithCount = await Department.getDepartmentsWithStaffCount();
    const totalDepartments = departmentsWithCount.length;
    const sortedByStaff = [...departmentsWithCount].sort((a: any, b: any) => (b.staffCount || 0) - (a.staffCount || 0));
    const topDepartment = sortedByStaff[0]?.name || '';

    // Monthly range (YYYY-MM)
    const now = new Date();
    const currentMonthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`; // e.g. 2025-11

    // Attendance for current month
    const attendanceRecords = await Attendance.find({
      date: { $regex: `^${currentMonthStr}` }
    }).lean();

    const totalAttendanceRecords = attendanceRecords.length;

    const presentRecords = attendanceRecords.filter((r) => r.status === 'checked-out' || r.status === 'checked-in');
    const leaveRecords = attendanceRecords.filter((r) => r.status === 'on-leave');
    const lateRecords = attendanceRecords.filter((r) => (r as any).lateMinutes && (r as any).lateMinutes > 0);

    // Derive overtime from totalHours string > 8h
    const overtimeRecords = attendanceRecords.filter((r) => {
      const totalHoursStr = (r as any).totalHours as string | null;
      if (!totalHoursStr) return false;
      const match = totalHoursStr.match(/(\d+)h\s*(\d+)m?/);
      if (!match) return false;
      const hours = parseInt(match[1], 10) || 0;
      const minutes = parseInt(match[2], 10) || 0;
      const totalMinutes = hours * 60 + minutes;
      return totalMinutes > 8 * 60; // > 8 hours considered overtime
    });

    const monthlyAttendance = presentRecords.length;
    const attendanceRate = totalAttendanceRecords > 0 ? (monthlyAttendance / totalAttendanceRecords) * 100 : 0;

    const baseForPercent = totalAttendanceRecords || 1; // avoid divide by zero
    const latePercentage = (lateRecords.length / baseForPercent) * 100;
    const leavePercentage = (leaveRecords.length / baseForPercent) * 100;
    const overtimePercentage = (overtimeRecords.length / baseForPercent) * 100;

    // We don't have explicit "early arrival" flag; treat as 0 for now
    const earlyPercentage = 0;

    // Monthly salary (sum of calculatedSalary for this month)
    const salariesAgg = await MonthlySalary.aggregate([
      { $match: { month: currentMonthStr } },
      { $group: { _id: null, total: { $sum: '$calculatedSalary' } } }
    ]);
    const monthlySalary = salariesAgg[0]?.total || 0;

    // Derive simple performance scores based on attendance & discipline
    const normalizedAttendance = Math.min(100, Math.max(0, attendanceRate));
    const normalizedLate = Math.min(100, Math.max(0, latePercentage));
    const normalizedLeave = Math.min(100, Math.max(0, leavePercentage));

    const hrPerformance = Math.round(
      normalizedAttendance * 0.6 +
      (100 - normalizedLate) * 0.25 +
      (100 - normalizedLeave) * 0.15
    );

    // Admin performance: focus on overall staff coverage & department structure
    const deptFactor = totalDepartments > 0 ? 100 : 60;
    const staffCoverage = totalStaff > 0 ? (activeStaff / totalStaff) * 100 : 70;
    const adminPerformance = Math.round(staffCoverage * 0.7 + deptFactor * 0.3);

    return res.json({
      totalStaff,
      activeStaff,
      inactiveStaff,
      totalDepartments,
      monthlyAttendance,
      attendanceRate,
      monthlySalary,
      latePercentage,
      earlyPercentage,
      overtimePercentage,
      leavePercentage,
      hrPerformance,
      adminPerformance,
      topDepartment,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Owner dashboard stats error:', error);
    return res.status(500).json({ message: 'Failed to load owner dashboard stats' });
  }
});

export default router;
