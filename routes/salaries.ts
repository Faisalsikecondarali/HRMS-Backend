import { Router } from 'express';
import mongoose from 'mongoose';
import { authenticateToken, requireRole, AuthRequest } from '../middleware/auth';
import { Salary } from '../models/Salary';
import { User } from '../models/User';
import { createAndNotify } from '../utils/notifier';
import { SalaryPlan } from '../models/SalaryPlan';
import { SalaryIssue } from '../models/SalaryIssue';
import { Attendance } from '../models/Attendance';
import { WorkLog } from '../models/WorkLog';
import { MonthlySalary } from '../models/MonthlySalary';

const router = Router();

// Helper: month range
function getMonthRange(month?: string) {
  const now = new Date();
  const m = month && /^\d{4}-\d{2}$/.test(month)
    ? month
    : `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const startDate = `${m}-01`;
  const endDate = `${m}-31`;
  return { month: m, startDate, endDate };
}

// HR: Get salary generation data for a specific month
router.get('/generation-data', authenticateToken, requireRole(['hr', 'admin']), async (req: AuthRequest, res) => {
  try {
    const { month } = req.query as { month?: string };
    const { startDate, endDate } = getMonthRange(month);

    // Get all active HR and staff users
    const users = await User.find({ 
      role: { $in: ['hr', 'staff'] },
      isActive: true 
    }).select('name email role department');

    // Get unique departments from users
    const allDepartments = await User.distinct('department', {
      role: { $in: ['hr', 'staff'] },
      isActive: true,
      department: { $exists: true, $ne: null, $ne: '' }
    });
    
    console.log('Found departments:', allDepartments);
    
    // If no departments found, provide default ones
    const departments = allDepartments.length > 0 ? allDepartments : ['IT', 'HR', 'Finance', 'Marketing', 'Operations', 'Sales'];

    const data = [];

    for (const user of users) {
      try {
        // Get salary plan
        const salaryPlan = await SalaryPlan.findOne({ 
          userId: user._id, 
          status: 'active' 
        });

        // Get work logs for the month
        const workLogs = await WorkLog.find({
          userId: user._id,
          date: { $gte: startDate, $lte: endDate },
          status: 'approved'
        });

        let totalHours = 0;
        let overtimeHours = 0;
        let totalLatePenalty = 0;
        const targetHours = salaryPlan?.monthlyTargetHours || 160;

        for (const log of workLogs) {
          totalHours += log.totalHours || 0;
          
          // Calculate late penalty if check-in was late
          if (log.checkIn && log.lateMinutes && log.lateMinutes > 0) {
            totalLatePenalty += log.lateMinutes * (salaryPlan?.latePenaltyPerMinute || 5);
          }
        }

        if (totalHours > targetHours) {
          overtimeHours = totalHours - targetHours;
        }

        // Calculate salary
        let calculatedSalary = 0;
        if (salaryPlan) {
          const regularPay = Math.min(totalHours, targetHours) * salaryPlan.hourlyRate;
          const overtimePay = overtimeHours * salaryPlan.hourlyRate * (salaryPlan.overtimeRate || 1.5);
          const extraHoursPay = overtimeHours * (salaryPlan.extraHourRate || 0);
          calculatedSalary = Math.max(0, regularPay + overtimePay + extraHoursPay - totalLatePenalty);
        }

        // Check if salary is already generated
        const existingSalary = await MonthlySalary.findOne({
          userId: user._id,
          month: month
        });

        data.push({
          staffId: String(user._id),
          staffName: user.name,
          department: user.department || 'Not Assigned',
          salaryType: 'Hourly',
          hourlyRate: salaryPlan?.hourlyRate || 0,
          totalHours: totalHours,
          overtimeHours: overtimeHours,
          calculatedSalary: calculatedSalary,
          isGenerated: !!existingSalary,
          status: existingSalary?.status || 'pending'
        });

      } catch (userError) {
        console.error(`Error getting data for user ${user._id}:`, userError);
        data.push({
          staffId: String(user._id),
          staffName: user.name,
          department: user.department || 'Not Assigned',
          salaryType: 'Hourly',
          hourlyRate: 0,
          totalHours: 0,
          overtimeHours: 0,
          calculatedSalary: 0,
          isGenerated: false,
          status: 'pending',
          error: 'Error calculating data'
        });
      }
    }

    res.json({
      month: month,
      data: data,
      departments: departments
    });

  } catch (err) {
    console.error('Get generation data error:', err);
    res.status(500).json({ message: 'Server error getting generation data' });
  }
});

// HR: Generate salary for staff based on work hours
router.post('/generate', authenticateToken, requireRole(['hr', 'admin']), async (req: AuthRequest, res) => {
  try {
    const { month, staffIds } = req.body as { month: string; staffIds?: string[] };
    
    if (!month || !/^\d{4}-\d{2}$/.test(month)) {
      return res.status(400).json({ message: 'Valid month (YYYY-MM) is required' });
    }

    const { startDate, endDate } = getMonthRange(month);

    // Get all active HR and staff users if no specific staffIds provided
    let users;
    if (staffIds && staffIds.length > 0) {
      users = await User.find({ 
        _id: { $in: staffIds },
        role: { $in: ['hr', 'staff'] },
        isActive: true 
      });
    } else {
      users = await User.find({ 
        role: { $in: ['hr', 'staff'] },
        isActive: true 
      });
    }

    const results = [];

    for (const user of users) {
      try {
        // Get salary plan for this user
        const salaryPlan = await SalaryPlan.findOne({ 
          userId: user._id, 
          status: 'active' 
        });

        if (!salaryPlan) {
          results.push({
            userId: String(user._id),
            name: user.name,
            email: user.email,
            error: 'No active salary plan found'
          });
          continue;
        }

        // Calculate total work hours and late penalties for the month
        const workLogs = await WorkLog.find({
          userId: user._id,
          date: { $gte: startDate, $lte: endDate },
          status: 'approved'
        });

        let totalHours = 0;
        let overtimeHours = 0;
        let totalLatePenalty = 0;
        const targetHours = salaryPlan.monthlyTargetHours || 160; // Fixed 160 hours/month

        for (const log of workLogs) {
          totalHours += log.totalHours || 0;
          
          // Calculate late penalty if check-in was late
          if (log.checkIn && log.lateMinutes && log.lateMinutes > 0) {
            totalLatePenalty += log.lateMinutes * (salaryPlan.latePenaltyPerMinute || 5);
          }
        }

        // Calculate overtime (hours beyond target)
        if (totalHours > targetHours) {
          overtimeHours = totalHours - targetHours;
        }

        // Calculate salary based on hourly rate
        const regularPay = Math.min(totalHours, targetHours) * salaryPlan.hourlyRate;
        const overtimePay = overtimeHours * salaryPlan.hourlyRate * (salaryPlan.overtimeRate || 1.5);
        const extraHoursPay = overtimeHours * (salaryPlan.extraHourRate || 0);
        const calculatedSalary = Math.max(0, regularPay + overtimePay + extraHoursPay - totalLatePenalty);

        // Check if salary already exists for this month
        let monthlySalary = await MonthlySalary.findOne({
          userId: user._id,
          month: month
        });

        if (monthlySalary) {
          // Update existing salary
          monthlySalary.totalHours = totalHours;
          monthlySalary.overtimeHours = overtimeHours;
          monthlySalary.calculatedSalary = calculatedSalary;
          monthlySalary.status = 'pending';
          monthlySalary.paidDate = null;
          await monthlySalary.save();
        } else {
          // Create new salary record
          monthlySalary = new MonthlySalary({
            userId: user._id,
            month: month,
            totalHours: totalHours,
            overtimeHours: overtimeHours,
            calculatedSalary: calculatedSalary,
            status: 'pending'
          });
          await monthlySalary.save();
        }

        results.push({
          userId: String(user._id),
          name: user.name,
          email: user.email,
          hourlyRate: salaryPlan.hourlyRate,
          totalHours: totalHours,
          overtimeHours: overtimeHours,
          calculatedSalary: calculatedSalary,
          status: 'generated'
        });

      } catch (userError) {
        console.error(`Error generating salary for user ${user._id}:`, userError);
        results.push({
          userId: String(user._id),
          name: user.name,
          email: user.email,
          error: 'Failed to generate salary'
        });
      }
    }

    res.json({
      message: 'Salary generation completed',
      month: month,
      results: results
    });

  } catch (err) {
    console.error('Generate salary error:', err);
    res.status(500).json({ message: 'Server error generating salary' });
  }
});

// HR: Apply extra hours rate to staff
router.post('/apply-extra-hours', authenticateToken, requireRole(['hr', 'admin']), async (req: AuthRequest, res) => {
  try {
    const { extraHourRate, applyToAll, staffIds } = req.body as { 
      extraHourRate: number; 
      applyToAll?: boolean; 
      staffIds?: string[] 
    };
    
    if (!extraHourRate || extraHourRate < 0) {
      return res.status(400).json({ message: 'Valid extraHourRate is required' });
    }

    let users;
    if (applyToAll) {
      users = await User.find({ 
        role: { $in: ['hr', 'staff'] },
        isActive: true 
      });
    } else if (staffIds && staffIds.length > 0) {
      users = await User.find({ 
        _id: { $in: staffIds },
        role: { $in: ['hr', 'staff'] },
        isActive: true 
      });
    } else {
      return res.status(400).json({ message: 'Either applyToAll must be true or staffIds must be provided' });
    }

    const results = [];

    for (const user of users) {
      try {
        // Update or create salary plan with extra hour rate
        const salaryPlan = await SalaryPlan.findOneAndUpdate(
          { userId: user._id },
          { 
            extraHourRate: extraHourRate,
            status: 'active'
          },
          { upsert: true, new: true }
        );

        results.push({
          userId: String(user._id),
          name: user.name,
          email: user.email,
          extraHourRate: extraHourRate,
          success: true
        });

      } catch (userError) {
        console.error(`Error applying extra hours for user ${user._id}:`, userError);
        results.push({
          userId: String(user._id),
          name: user.name,
          email: user.email,
          success: false,
          error: 'Failed to apply extra hours rate'
        });
      }
    }

    res.json({
      message: 'Extra hours rate applied successfully',
      extraHourRate: extraHourRate,
      appliedTo: applyToAll ? 'all staff' : 'selected staff',
      results: results
    });

  } catch (err) {
    console.error('Apply extra hours error:', err);
    res.status(500).json({ message: 'Server error applying extra hours rate' });
  }
});

// HR: Download salary slip
router.get('/slip/:staffId', authenticateToken, requireRole(['hr', 'admin']), async (req: AuthRequest, res) => {
  try {
    const { staffId } = req.params;
    const { month } = req.query as { month?: string };
    
    if (!mongoose.isValidObjectId(staffId)) {
      return res.status(400).json({ message: 'Invalid staffId' });
    }

    const monthlySalary = await MonthlySalary.findOne({
      userId: staffId,
      month: month
    }).populate('userId', 'name email department');

    if (!monthlySalary) {
      return res.status(404).json({ message: 'Salary record not found' });
    }

    // In a real implementation, you would generate a PDF here
    res.json({
      message: 'Salary slip generated',
      slip: {
        staffName: (monthlySalary.userId as any).name,
        email: (monthlySalary.userId as any).email,
        department: (monthlySalary.userId as any).department,
        month: monthlySalary.month,
        totalHours: monthlySalary.totalHours,
        overtimeHours: monthlySalary.overtimeHours,
        calculatedSalary: monthlySalary.calculatedSalary,
        status: monthlySalary.status,
        paidDate: monthlySalary.paidDate
      }
    });

  } catch (err) {
    console.error('Download salary slip error:', err);
    res.status(500).json({ message: 'Server error downloading salary slip' });
  }
});

// Admin: list all salaries with optional filters
router.get('/', authenticateToken, requireRole(['admin']), async (req: AuthRequest, res) => {
  try {
    const { status, month, employeeId, source } = req.query as { status?: string; month?: string; employeeId?: string; source?: 'admin' | 'staff' };
    const filter: any = {};
    if (status) filter.status = status;
    if (month) filter.month = month;
    if (employeeId && mongoose.isValidObjectId(employeeId)) filter.employeeId = employeeId;
    if (source) filter.source = source;

    const salaries = await Salary.find(filter).sort({ createdAt: -1 }).lean();
    res.json({
      salaries: salaries.map((s) => ({
        id: String(s._id),
        employeeId: String(s.employeeId),
        month: s.month,
        amount: s.amount,
        status: s.status,
        sentToAccounts: !!s.sentToAccounts,
        createdAt: s.createdAt,
      })),
    });

// --- Admin: send to accounts ---
router.patch('/send-to-accounts', authenticateToken, requireRole(['admin']), async (req: AuthRequest, res) => {
  try {
    const { salaryId } = req.body as { salaryId: string };
    if (!mongoose.isValidObjectId(salaryId)) return res.status(400).json({ message: 'Invalid salaryId' });
    const salary = await Salary.findById(salaryId);
    if (!salary) return res.status(404).json({ message: 'Salary not found' });
    if (salary.status !== 'received') return res.status(400).json({ message: 'Only received salaries can be sent to accounts' });
    if (salary.sentToAccounts) return res.status(400).json({ message: 'Already sent to accounts' });
    salary.sentToAccounts = true;
    await salary.save();
    res.json({ message: 'Marked as sent to accounts', salary: {
      id: String(salary._id), employeeId: String(salary.employeeId), month: salary.month, amount: salary.amount, status: salary.status, sentToAccounts: !!salary.sentToAccounts, createdAt: salary.createdAt
    }});
  } catch (err) {
    console.error('Send to accounts error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// Admin: list all salary plans
router.get('/plans', authenticateToken, requireRole(['admin']), async (_req: AuthRequest, res) => {
  try {
    const plans = await SalaryPlan.find({}).lean();
    if (plans.length === 0) return res.json({ plans: [] });

    const userIds = plans.map((p) => p.userId);
    const users = await User.find({ _id: { $in: userIds } }).select('_id name email');
    const userMap = new Map<string, { name: string; email: string | undefined }>();
    users.forEach((u) => userMap.set(String(u._id), { name: u.name, email: u.email }));

    res.json({
      plans: plans.map((p) => {
        const info = userMap.get(String(p.userId));
        return {
          userId: String(p.userId),
          name: info?.name || '',
          email: info?.email || '',
          baseAmount: p.hourlyRate,
          active: p.status === 'active',
        };
      }),
    });
  } catch (err) {
    console.error('List salary plans error:', err);
    res.status(500).json({ message: 'Server error listing salary plans' });
  }
});

// Admin get a user's plan
router.get('/plan/:userId', authenticateToken, requireRole(['admin']), async (req: AuthRequest, res) => {
  try {
    const { userId } = req.params;
    if (!mongoose.isValidObjectId(userId)) return res.status(400).json({ message: 'Invalid userId' });
    const plan = await SalaryPlan.findOne({ userId });
    if (!plan) return res.json({ plan: null });
    res.json({ plan: { userId: String(plan.userId), baseAmount: plan.baseAmount, active: plan.active } });
  } catch (err) {
    console.error('Get user plan error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});
  } catch (err) {
    console.error('List salaries error:', err);
    res.status(500).json({ message: 'Server error listing salaries' });
  }
});

// Staff: list my salaries
router.get('/mine', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.userId;
    const salaries = await Salary.find({ employeeId: userId }).sort({ createdAt: -1 }).lean();
    res.json({
      salaries: salaries.map((s) => ({
        id: String(s._id),
        employeeId: String(s.employeeId),
        month: s.month,
        amount: s.amount,
        status: s.status,
        sentToAccounts: !!s.sentToAccounts,
        createdAt: s.createdAt,
      })),
    });
  } catch (err) {
    console.error('List my salaries error:', err);
    res.status(500).json({ message: 'Server error listing salaries' });
  }
});

// Staff: get my monthly salary summary based on attendance hours and hourly rate
router.get('/summary/me', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.userId;
    const now = new Date();
    const { month } = req.query as { month?: string };
    const targetMonth = month && /^\d{4}-\d{2}$/.test(month) ? month : `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    const startDate = `${targetMonth}-01`;
    const endDate = `${targetMonth}-31`;

    const records = await Attendance.find({ userId, date: { $gte: startDate, $lte: endDate } });
    const totalMinutes = records.reduce((sum, r) => {
      if (!r.totalHours) return sum;
      const m = (r.totalHours.match(/(\d+)h\s*(\d+)?m?/) || []);
      const h = m[1] ? parseInt(m[1], 10) : 0;
      const min = m[2] ? parseInt(m[2], 10) : 0;
      return sum + h * 60 + min;
    }, 0);
    const totalHoursDecimal = totalMinutes / 60;

    const plan = await SalaryPlan.findOne({ userId, active: true });
    const hourlyRate = plan?.baseAmount ?? 0;
    const amount = Number((totalHoursDecimal * hourlyRate).toFixed(2));

    res.json({
      month: targetMonth,
      totalMinutes,
      totalHours: Number(totalHoursDecimal.toFixed(2)),
      hourlyRate,
      amount,
    });
  } catch (err) {
    console.error('My salary summary error:', err);
    res.status(500).json({ message: 'Server error computing salary summary' });
  }
});

// Admin: monthly salary summary for all employees with active plans
router.get('/summary', authenticateToken, requireRole(['admin']), async (req: AuthRequest, res) => {
  try {
    const now = new Date();
    const { month } = req.query as { month?: string };
    const targetMonth = month && /^\d{4}-\d{2}$/.test(month) ? month : `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    const startDate = `${targetMonth}-01`;
    const endDate = `${targetMonth}-31`;

    const plans = await SalaryPlan.find({ active: true });
    if (plans.length === 0) {
      return res.json({ month: targetMonth, totalAmount: 0, items: [] });
    }

    const userIds = plans.map((p) => p.userId);
    const users = await User.find({ _id: { $in: userIds } }).select('_id name');
    const userMap = new Map<string, string>();
    users.forEach((u) => userMap.set(String(u._id), u.name));

    const items: Array<{ userId: string; name: string; totalMinutes: number; totalHours: number; hourlyRate: number; amount: number }> = [];

    for (const plan of plans) {
      const uid = String(plan.userId);
      const records = await Attendance.find({ userId: plan.userId, date: { $gte: startDate, $lte: endDate } });
      const totalMinutes = records.reduce((sum, r) => {
        if (!r.totalHours) return sum;
        const m = (r.totalHours.match(/(\d+)h\s*(\d+)?m?/) || []);
        const h = m[1] ? parseInt(m[1], 10) : 0;
        const min = m[2] ? parseInt(m[2], 10) : 0;
        return sum + h * 60 + min;
      }, 0);
      const totalHoursDecimal = totalMinutes / 60;
      const hourlyRate = plan.baseAmount;
      const amount = Number((totalHoursDecimal * hourlyRate).toFixed(2));
      items.push({
        userId: uid,
        name: userMap.get(uid) || uid,
        totalMinutes,
        totalHours: Number(totalHoursDecimal.toFixed(2)),
        hourlyRate,
        amount,
      });
    }

    const totalAmount = items.reduce((sum, i) => sum + i.amount, 0);

    res.json({
      month: targetMonth,
      totalAmount: Number(totalAmount.toFixed(2)),
      items,
    });
  } catch (err) {
    console.error('Admin salary summary error:', err);
    res.status(500).json({ message: 'Server error computing salary summary' });
  }
});

// Admin: create salary (generate)
router.post('/create', authenticateToken, requireRole(['admin']), async (req: AuthRequest, res) => {
  try {
    const { employeeId, month, amount } = req.body as { employeeId: string; month: string; amount: number };
    if (!employeeId || !month || amount == null) {
      return res.status(400).json({ message: 'employeeId, month, amount are required' });
    }
    if (!mongoose.isValidObjectId(employeeId)) {
      return res.status(400).json({ message: 'Invalid employeeId' });
    }
    const employee = await User.findById(employeeId);
    if (!employee) return res.status(404).json({ message: 'Employee not found' });

    const exists = await Salary.findOne({ employeeId, month });
    if (exists) return res.status(400).json({ message: 'Salary for this month already exists for the employee' });

    const salary = await Salary.create({ employeeId, month, amount, status: 'pending' });

    await createAndNotify(employeeId, `New salary generated for ${month}`, 'salary_generated');

    res.status(201).json({
      message: 'Salary created',
      salary: {
        id: String(salary._id),
        employeeId: String(salary.employeeId),
        month: salary.month,
        amount: salary.amount,
        status: salary.status,
        createdAt: salary.createdAt,
      },
    });
  } catch (err) {
    console.error('Create salary error:', err);
    res.status(500).json({ message: 'Server error creating salary' });
  }
});

// Update status
// Admin can set: pending -> approved -> paid
// Staff can set own: paid -> received (confirm)
router.patch('/update-status', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const { salaryId, status } = req.body as { salaryId: string; status: 'approved' | 'paid' | 'received' };
    if (!mongoose.isValidObjectId(salaryId)) return res.status(400).json({ message: 'Invalid salaryId' });

    const salary = await Salary.findById(salaryId);
    if (!salary) return res.status(404).json({ message: 'Salary not found' });

    const role = req.user!.role;

    if (status === 'approved' || status === 'paid') {
      if (role !== 'admin') return res.status(403).json({ message: 'Only admin can approve or mark as paid' });
      if (status === 'approved' && salary.status !== 'pending') {
        return res.status(400).json({ message: 'Only pending salaries can be approved' });
      }
      if (status === 'paid' && salary.status !== 'approved') {
        return res.status(400).json({ message: 'Only approved salaries can be marked as paid' });
      }
      salary.status = status;
      await salary.save();

      const notifyType = status === 'approved' ? 'salary_approved' : 'salary_paid';
      const message = status === 'approved' ? `Your salary for ${salary.month} is approved` : `Your salary for ${salary.month} is paid`;
      await createAndNotify(String(salary.employeeId), message, notifyType);
    } else if (status === 'received') {
      // Staff confirms their own salary only when paid
      const userId = req.user!.userId;
      if (role !== 'staff' && role !== 'admin') return res.status(403).json({ message: 'Unauthorized' });
      if (String(salary.employeeId) !== userId && role !== 'admin') {
        return res.status(403).json({ message: 'You can only confirm your own salary' });
      }
      // Relaxed: allow received confirmation regardless of current status (pending/approved/paid)
      if (salary.status === 'received') return res.status(400).json({ message: 'Already marked as received' });
      salary.status = 'received';
      await salary.save();

      // Notify all admins that staff confirmed
      const admins = await User.find({ role: 'admin' }, { _id: 1 }).lean();
      await Promise.all(
        admins.map((a) => createAndNotify(String(a._id), `Salary received confirmation for ${salary.month}`, 'salary_received'))
      );
    } else {
      return res.status(400).json({ message: 'Unsupported status' });
    }

    res.json({
      message: 'Status updated',
      salary: {
        id: String(salary._id),
        employeeId: String(salary.employeeId),
        month: salary.month,
        amount: salary.amount,
        status: salary.status,
        sentToAccounts: !!salary.sentToAccounts,
        createdAt: salary.createdAt,
      },
    });
  } catch (err) {
    console.error('Update salary status error:', err);
    res.status(500).json({ message: 'Server error updating salary status' });
  }
});

// HR: Generate monthly salary for staff based on current rates
router.post('/generate-monthly', authenticateToken, requireRole(['hr', 'admin', 'owner']), async (req: AuthRequest, res) => {
  try {
    const { month, staffIds } = req.body;
    const { startDate, endDate } = getMonthRange(month);

    console.log('Generating monthly salary:', { month, staffIds });

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

        // Create monthly salary record
        const monthlySalary = new MonthlySalary({
          userId: user._id,
          month: month,
          startDate: startDate,
          endDate: endDate,
          baseSalary: baseSalary,
          overtimeSalary: overtimeSalary,
          deductions: deductions,
          netSalary: netSalary,
          hourlyRate: hourlyRate,
          overtimeRate: overtimeRate,
          monthlyTargetHours: monthlyTargetHours,
          status: 'generated'
        });

        await monthlySalary.save();

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
        console.error(`Error generating salary for staff ${staffId}:`, userError);
        results.push({
          staffId: staffId,
          success: false,
          error: 'Error generating salary'
        });
      }
    }

    res.json({
      month: month,
      results: results,
      message: 'Monthly salary generation completed'
    });

  } catch (err) {
    console.error('Generate monthly salary error:', err);
    res.status(500).json({ message: 'Server error generating monthly salary' });
  }
});

export default router;

// --- Salary Plans ---
// Admin set/update a user's plan
router.put('/plan/:userId', authenticateToken, requireRole(['admin']), async (req: AuthRequest, res) => {
  try {
    const { userId } = req.params;
    const { baseAmount, active } = req.body as { baseAmount: number; active?: boolean };
    if (!mongoose.isValidObjectId(userId)) return res.status(400).json({ message: 'Invalid userId' });
    if (baseAmount == null || baseAmount < 0) return res.status(400).json({ message: 'baseAmount required' });
    const plan = await SalaryPlan.findOneAndUpdate(
      { userId },
      { hourlyRate: baseAmount, ...(typeof active === 'boolean' ? { status: active ? 'active' : 'inactive' } : {}) },
      { upsert: true, new: true }
    );
    res.json({ message: 'Plan saved', plan: { userId: String(plan.userId), baseAmount: plan.hourlyRate, active: plan.status === 'active' } });
  } catch (err) {
    console.error('Save plan error:', err);
    res.status(500).json({ message: 'Server error saving plan' });
  }
});

// Staff get my plan
router.get('/plan/me', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.userId;
    const plan = await SalaryPlan.findOne({ userId });
    if (!plan) return res.json({ plan: null });
    res.json({ plan: { userId: String(plan.userId), baseAmount: plan.baseAmount, active: plan.active } });
  } catch (err) {
    console.error('Get my plan error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// --- Staff request salary ---
router.post('/request', authenticateToken, requireRole(['staff', 'admin']), async (req: AuthRequest, res) => {
  try {
    const requesterId = req.user!.userId;
    const { month } = req.body as { month: string };
    if (!month) return res.status(400).json({ message: 'month is required (YYYY-MM)' });

    const plan = await SalaryPlan.findOne({ userId: requesterId, active: true });
    if (!plan) return res.status(400).json({ message: 'No active salary plan found. Please contact admin.' });

    const exists = await Salary.findOne({ employeeId: requesterId, month });
    if (exists) return res.status(400).json({ message: 'A salary entry for this month already exists.' });

    const salary = await Salary.create({ employeeId: requesterId, month, amount: plan.baseAmount, status: 'pending', source: 'staff' });

    // Notify all admins about request
    const admins = await User.find({ role: 'admin' }, { _id: 1 }).lean();
    await Promise.all(admins.map(a => createAndNotify(String(a._id), `Salary requested for ${month}`, 'salary_requested')));

    res.status(201).json({ message: 'Salary request submitted', salary: {
      id: String(salary._id), employeeId: String(salary.employeeId), month: salary.month, amount: salary.amount, status: salary.status, createdAt: salary.createdAt
    }});
  } catch (err) {
    console.error('Salary request error:', err);
    res.status(500).json({ message: 'Server error submitting salary request' });
  }
});

// --- Staff report salary issue ---
router.post('/issues', authenticateToken, requireRole(['staff', 'admin']), async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.userId;
    const { salaryId, message } = req.body as { salaryId: string; message: string };
    if (!mongoose.isValidObjectId(salaryId)) return res.status(400).json({ message: 'Invalid salaryId' });
    if (!message) return res.status(400).json({ message: 'message is required' });

    const salary = await Salary.findById(salaryId);
    if (!salary) return res.status(404).json({ message: 'Salary not found' });
    if (String(salary.employeeId) !== userId) return res.status(403).json({ message: 'You can only report issues for your own salary' });

    const issue = await SalaryIssue.create({ salaryId, userId, message });

    // Notify all admins
    const admins = await User.find({ role: 'admin' }, { _id: 1 }).lean();
    await Promise.all(admins.map(a => createAndNotify(String(a._id), `Salary issue reported for ${salary.month}`, 'salary_issue')));

    res.status(201).json({ message: 'Issue reported', issue: { id: String(issue._id), salaryId, userId, message, resolved: issue.resolved, createdAt: issue.createdAt } });
  } catch (err) {
    console.error('Salary issue error:', err);
    res.status(500).json({ message: 'Server error reporting issue' });
  }
});
