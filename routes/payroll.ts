import { Router, Response } from 'express';
import mongoose from 'mongoose';
import { authenticateToken, requireRole, AuthRequest } from '../middleware/auth';
import { SalaryPlan } from '../models/SalaryPlan';
import { WorkLog } from '../models/WorkLog';
import { MonthlySalary } from '../models/MonthlySalary';
import { User } from '../models/User';

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

// ---------------- Salary Plans ----------------

// Admin: create/update salary plan for a user
router.put('/plans/:userId', authenticateToken, requireRole(['admin']), async (req: AuthRequest, res: Response) => {
  try {
    const { userId } = req.params;
    if (!mongoose.isValidObjectId(userId)) {
      return res.status(400).json({ message: 'Invalid userId' });
    }

    const { hourlyRate, overtimeRate, latePenaltyPerMinute, designation, monthlyTargetHours, status } = req.body as {
      hourlyRate: number;
      overtimeRate?: number;
      latePenaltyPerMinute?: number;
      designation?: string;
      monthlyTargetHours?: number;
      status?: 'active' | 'inactive';
    };

    if (hourlyRate == null || hourlyRate < 0) {
      return res.status(400).json({ message: 'hourlyRate is required' });
    }

    const plan = await SalaryPlan.findOneAndUpdate(
      { userId },
      {
        hourlyRate,
        ...(overtimeRate !== undefined ? { overtimeRate } : {}),
        ...(latePenaltyPerMinute !== undefined ? { latePenaltyPerMinute } : {}),
        ...(designation !== undefined ? { designation } : {}),
        ...(monthlyTargetHours !== undefined ? { monthlyTargetHours } : {}),
        ...(status ? { status } : {}),
      },
      { upsert: true, new: true }
    );

    res.json({
      plan: {
        userId: String(plan.userId),
        hourlyRate: plan.hourlyRate,
        designation: plan.designation,
        monthlyTargetHours: plan.monthlyTargetHours,
        status: plan.status,
      },
    });
  } catch (err) {
    console.error('Save salary plan error:', err);
    res.status(500).json({ message: 'Server error saving salary plan' });
  }
});

// Admin: list all salary plans
router.get('/plans', authenticateToken, requireRole(['admin']), async (_req: AuthRequest, res: Response) => {
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
          hourlyRate: p.hourlyRate,
          designation: p.designation,
          monthlyTargetHours: p.monthlyTargetHours,
          status: p.status,
        };
      }),
    });
  } catch (err) {
    console.error('List salary plans error:', err);
    res.status(500).json({ message: 'Server error listing salary plans' });
  }
});

// Staff/Admin: get my plan or specific user plan
router.get('/plans/me', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const plan = await SalaryPlan.findOne({ userId }).lean();
    if (!plan) return res.json({ plan: null });
    res.json({
      plan: {
        userId: String(plan.userId),
        hourlyRate: plan.hourlyRate,
        designation: plan.designation,
        monthlyTargetHours: plan.monthlyTargetHours,
        status: plan.status,
      },
    });
  } catch (err) {
    console.error('Get my salary plan error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

router.get('/plans/:userId', authenticateToken, requireRole(['admin']), async (req: AuthRequest, res: Response) => {
  try {
    const { userId } = req.params;
    if (!mongoose.isValidObjectId(userId)) return res.status(400).json({ message: 'Invalid userId' });
    const plan = await SalaryPlan.findOne({ userId }).lean();
    if (!plan) return res.json({ plan: null });
    res.json({
      plan: {
        userId: String(plan.userId),
        hourlyRate: plan.hourlyRate,
        designation: plan.designation,
        monthlyTargetHours: plan.monthlyTargetHours,
        status: plan.status,
      },
    });
  } catch (err) {
    console.error('Get user plan error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// ---------------- Work Logs ----------------

// Admin: add work log for staff
router.post('/work-logs', authenticateToken, requireRole(['admin']), async (req: AuthRequest, res: Response) => {
  try {
    const { userId, date, hoursWorked, note } = req.body as {
      userId: string;
      date: string;
      hoursWorked: number;
      note?: string;
    };

    if (!userId || !mongoose.isValidObjectId(userId)) return res.status(400).json({ message: 'Invalid userId' });
    if (!date) return res.status(400).json({ message: 'date is required' });
    if (hoursWorked == null || hoursWorked < 0) return res.status(400).json({ message: 'hoursWorked is required' });

    const log = await WorkLog.create({ userId, date, hoursWorked, note });
    res.status(201).json({
      log: {
        id: String(log._id),
        userId: String(log.userId),
        date: log.date,
        hoursWorked: log.hoursWorked,
        note: log.note,
      },
    });
  } catch (err) {
    console.error('Create work log error:', err);
    res.status(500).json({ message: 'Server error creating work log' });
  }
});

// Admin/Staff: list work logs for a user by month
router.get('/work-logs/user/:userId', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const { userId } = req.params;
    const { month } = req.query as { month?: string };

    if (!mongoose.isValidObjectId(userId)) return res.status(400).json({ message: 'Invalid userId' });

    // Allow staff to only read their own
    if (req.user!.role !== 'admin' && req.user!.userId !== userId) {
      return res.status(403).json({ message: 'Forbidden' });
    }

    const { startDate, endDate, month: m } = getMonthRange(month);

    const logs = await WorkLog.find({ userId, date: { $gte: startDate, $lte: endDate } })
      .sort({ date: 1 })
      .lean();

    const totalHours = logs.reduce((sum, l) => sum + (l.hoursWorked || 0), 0);

    res.json({
      month: m,
      totalHours,
      logs: logs.map((l) => ({
        id: String(l._id),
        date: l.date,
        hoursWorked: l.hoursWorked,
        note: l.note,
      })),
    });
  } catch (err) {
    console.error('List work logs error:', err);
    res.status(500).json({ message: 'Server error listing work logs' });
  }
});

// Staff: my work logs
router.get('/work-logs/me', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const { month } = req.query as { month?: string };
    const { startDate, endDate, month: m } = getMonthRange(month);

    const logs = await WorkLog.find({ userId, date: { $gte: startDate, $lte: endDate } })
      .sort({ date: 1 })
      .lean();

    const totalHours = logs.reduce((sum, l) => sum + (l.hoursWorked || 0), 0);

    res.json({
      month: m,
      totalHours,
      logs: logs.map((l) => ({
        id: String(l._id),
        date: l.date,
        hoursWorked: l.hoursWorked,
        note: l.note,
      })),
    });
  } catch (err) {
    console.error('My work logs error:', err);
    res.status(500).json({ message: 'Server error listing my work logs' });
  }
});

// ---------------- Monthly Salary ----------------

// Admin: recalculate monthly salary for all users with active plans
router.post('/monthly/recalculate', authenticateToken, requireRole(['admin']), async (req: AuthRequest, res: Response) => {
  try {
    const { month } = req.body as { month?: string };
    const { startDate, endDate, month: m } = getMonthRange(month);

    const plans = await SalaryPlan.find({ status: 'active' }).lean();
    if (plans.length === 0) {
      return res.json({ message: 'No active salary plans found', month: m, items: [] });
    }

    const items: Array<{ userId: string; totalHours: number; hourlyRate: number; calculatedSalary: number }> = [];

    for (const plan of plans) {
      const logs = await WorkLog.find({ userId: plan.userId, date: { $gte: startDate, $lte: endDate } }).lean();
      const totalHours = logs.reduce((sum, l) => sum + (l.hoursWorked || 0), 0);
      const hourlyRate = plan.hourlyRate;
      const calculatedSalary = Number((totalHours * hourlyRate).toFixed(2));

      const ms = await MonthlySalary.findOneAndUpdate(
        { userId: plan.userId, month: m },
        {
          totalHours,
          calculatedSalary,
          // Do not override status if already paid; otherwise keep or reset to pending
        },
        { upsert: true, new: true }
      );

      items.push({
        userId: String(ms.userId),
        totalHours: ms.totalHours,
        hourlyRate,
        calculatedSalary: ms.calculatedSalary,
      });
    }

    res.json({ message: 'Recalculated salaries', month: m, items });
  } catch (err) {
    console.error('Recalculate monthly salary error:', err);
    res.status(500).json({ message: 'Server error recalculating monthly salary' });
  }
});

// Admin: get monthly salaries summary
router.get('/monthly/summary', authenticateToken, requireRole(['admin']), async (req: AuthRequest, res: Response) => {
  try {
    const { month } = req.query as { month?: string };
    const { month: m } = getMonthRange(month);

    const salaries = await MonthlySalary.find({ month: m }).lean();
    if (salaries.length === 0) return res.json({ month: m, items: [] });

    const userIds = salaries.map((s) => s.userId);
    const users = await User.find({ _id: { $in: userIds } }).select('_id name email');
    const userMap = new Map<string, { name: string; email: string | undefined }>();
    users.forEach((u) => userMap.set(String(u._id), { name: u.name, email: u.email }));

    res.json({
      month: m,
      items: salaries.map((s) => ({
        id: String(s._id),
        userId: String(s.userId),
        name: userMap.get(String(s.userId))?.name || '',
        email: userMap.get(String(s.userId))?.email || '',
        totalHours: s.totalHours,
        calculatedSalary: s.calculatedSalary,
        status: s.status,
        paidDate: s.paidDate,
      })),
    });
  } catch (err) {
    console.error('Monthly salary summary error:', err);
    res.status(500).json({ message: 'Server error listing monthly salary summary' });
  }
});

// Staff: get my monthly salary
router.get('/monthly/me', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const { month } = req.query as { month?: string };
    const { month: m } = getMonthRange(month);

    const salary = await MonthlySalary.findOne({ userId, month: m }).lean();
    if (!salary) return res.json({ month: m, salary: null });

    res.json({
      month: m,
      salary: {
        totalHours: salary.totalHours,
        calculatedSalary: salary.calculatedSalary,
        status: salary.status,
        paidDate: salary.paidDate,
      },
    });
  } catch (err) {
    console.error('My monthly salary error:', err);
    res.status(500).json({ message: 'Server error getting my monthly salary' });
  }
});

// HR: update monthly salary status (approve/paid)
router.patch('/monthly/:id/status', authenticateToken, requireRole(['hr', 'admin']), async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { status } = req.body as { status: 'pending' | 'approved' | 'paid' };
    if (!mongoose.isValidObjectId(id)) return res.status(400).json({ message: 'Invalid id' });

    const allowed: Array<'pending' | 'approved' | 'paid'> = ['pending', 'approved', 'paid'];
    if (!allowed.includes(status)) return res.status(400).json({ message: 'Invalid status' });

    const salary = await MonthlySalary.findById(id);
    if (!salary) return res.status(404).json({ message: 'Monthly salary not found' });

    salary.status = status;
    if (status === 'paid') {
      salary.paidDate = new Date();
    }
    await salary.save();

    res.json({
      message: 'Status updated',
      salary: {
        id: String(salary._id),
        userId: String(salary.userId),
        month: salary.month,
        totalHours: salary.totalHours,
        calculatedSalary: salary.calculatedSalary,
        status: salary.status,
        paidDate: salary.paidDate,
      },
    });
  } catch (err) {
    console.error('Update monthly salary status error:', err);
    res.status(500).json({ message: 'Server error updating salary status' });
  }
});

// HR: Generate salary for staff based on work hours
router.post('/generate', authenticateToken, requireRole(['hr', 'admin']), async (req: AuthRequest, res: Response) => {
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

// HR: Get salary generation data for a specific month
router.get('/generation-data', authenticateToken, requireRole(['hr', 'admin']), async (req: AuthRequest, res: Response) => {
  try {
    const { month } = req.query as { month?: string };
    const { startDate, endDate } = getMonthRange(month);

    // Get all active HR and staff users
    const users = await User.find({ 
      role: { $in: ['hr', 'staff'] },
      isActive: true 
    }).select('name email role department');

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
      data: data
    });

  } catch (err) {
    console.error('Get generation data error:', err);
    res.status(500).json({ message: 'Server error getting generation data' });
  }
});

// HR: Apply extra hours rate to staff
router.post('/apply-extra-hours', authenticateToken, requireRole(['hr', 'admin']), async (req: AuthRequest, res: Response) => {
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

export default router;
