import { Router, Response } from 'express';
import { authenticateToken, AuthRequest, requireRole } from '../middleware/auth';

const router = Router();

// Get performance data (admin only)
router.get('/', authenticateToken, requireRole(['admin']), async (req: AuthRequest, res: Response) => {
  try {
    // Since we don't have a performance model, we'll return mock data based on attendance
    const { period = 'monthly' } = req.query;
    
    // Mock performance data
    const performanceData = [
      { 
        id: 1, 
        staffName: 'Ahmed Khan', 
        staffId: 'EMP001', 
        department: 'Development',
        overallScore: 92,
        attendanceScore: 95,
        productivityScore: 90,
        qualityScore: 88,
        teamworkScore: 94,
        period: period === 'monthly' ? 'Nov 2024' : 'Q4 2024',
        trend: 'up',
        previousScore: 88,
        goals: 4,
        completedGoals: 3,
        lastReview: '2024-11-15'
      },
      { 
        id: 2, 
        staffName: 'Sara Ali', 
        staffId: 'EMP002', 
        department: 'HR',
        overallScore: 88,
        attendanceScore: 92,
        productivityScore: 85,
        qualityScore: 90,
        teamworkScore: 85,
        period: period === 'monthly' ? 'Nov 2024' : 'Q4 2024',
        trend: 'up',
        previousScore: 85,
        goals: 3,
        completedGoals: 3,
        lastReview: '2024-11-10'
      },
      { 
        id: 3, 
        staffName: 'Mohammed Raza', 
        staffId: 'EMP003', 
        department: 'Sales',
        overallScore: 75,
        attendanceScore: 80,
        productivityScore: 70,
        qualityScore: 75,
        teamworkScore: 75,
        period: period === 'monthly' ? 'Nov 2024' : 'Q4 2024',
        trend: 'down',
        previousScore: 80,
        goals: 5,
        completedGoals: 2,
        lastReview: '2024-11-12'
      },
      { 
        id: 4, 
        staffName: 'Fatima Sheikh', 
        staffId: 'EMP004', 
        department: 'Marketing',
        overallScore: 95,
        attendanceScore: 98,
        productivityScore: 95,
        qualityScore: 92,
        teamworkScore: 95,
        period: period === 'monthly' ? 'Nov 2024' : 'Q4 2024',
        trend: 'up',
        previousScore: 91,
        goals: 4,
        completedGoals: 4,
        lastReview: '2024-11-20'
      },
    ];

    res.json({ performance: performanceData });
  } catch (error) {
    console.error('Fetch performance data failed:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Create/update performance review (admin only)
router.post('/review', authenticateToken, requireRole(['admin']), async (req: AuthRequest, res: Response) => {
  try {
    const { staffId, scores, goals, feedback } = req.body;
    
    // In a real implementation, this would save to a database
    // For now, we'll just return success
    
    res.json({ 
      message: 'Performance review saved successfully',
      reviewId: new Date().getTime().toString()
    });
  } catch (error) {
    console.error('Save performance review failed:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

export default router;
