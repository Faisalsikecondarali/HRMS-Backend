import express, { Response, Router } from 'express';
import mongoose from 'mongoose';
import { authenticateToken, requireRole, AuthRequest } from '../middleware/auth';
import { User } from '../models/User';
import { SalaryPlan } from '../models/SalaryPlan';
import { upload, uploadToCloudinary } from '../utils/upload';
import fs from 'fs/promises';
import path from 'path';

const router = express.Router();

// ... (rest of the code remains the same)
  try {
    const users = await User.find({ isActive: true })
      .select('-password')
      .sort({ createdAt: -1 });
    
    res.json({ 
      success: true,
      users: users,
      total: users.length 
    });
  } catch (error) {
    console.error('Get all users failed:', error);
    res.status(500).json({ 
      success: false,
      message: 'Server error' 
    });
  }
});

// Get user by ID
router.get('/:id', authenticateToken, requireRole(['admin']), async (req: any, res: Response) => {
  try {
    const { id } = req.params;
    const user = await User.findById(id).select('-password');
    
    if (!user) {
      return res.status(404).json({ 
        success: false,
        message: 'User not found' 
      });
    }
    
    res.json({ 
      success: true,
      user: user 
    });
  } catch (error) {
    console.error('Get user failed:', error);
    res.status(500).json({ 
      success: false,
      message: 'Server error' 
    });
  }
});

// Update user department
router.put('/:id/department', authenticateToken, requireRole(['admin']), async (req: any, res: Response) => {
  try {
    const { id } = req.params;
    const { department } = req.body;
    
    const user = await User.findByIdAndUpdate(
      id, 
      { department: department || '' }, 
      { new: true }
    ).select('-password');
    
    if (!user) {
      return res.status(404).json({ 
        success: false,
        message: 'User not found' 
      });
    }
    
    res.json({ 
      success: true,
      user: user,
      message: 'User department updated successfully' 
    });
  } catch (error) {
    console.error('Update user department failed:', error);
    res.status(500).json({ 
      success: false,
      message: 'Server error' 
    });
  }
});

// Get staff for salary management (lower security requirement)
router.get('/staff-list', authenticateToken, async (req: AuthRequest, res) => {
  try {
    console.log('=== STAFF-LIST API CALLED ===');
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
    console.log('=== STAFF-LIST API COMPLETED ===');

    res.json({
      staff: staff
    });

  } catch (err) {
    console.error('Get staff-list error:', err);
    res.status(500).json({ message: 'Server error getting staff list' });
  }
});

// Update staff salary rate (simplified - no role restriction)
router.put('/staff-rate/:userId', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const { userId } = req.params;
    const { hourlyRate, overtimeRate, status } = req.body;
    
    console.log('Updating staff rate:', {
      requestUserId: req.user?.userId,
      targetUserId: userId,
      hourlyRate: hourlyRate,
      userRole: req.user?.role
    });
    
    if (!mongoose.isValidObjectId(userId)) {
      return res.status(400).json({ message: 'Invalid user ID' });
    }
    
    if (!hourlyRate || hourlyRate < 0) {
      return res.status(400).json({ message: 'Valid hourly rate is required' });
    }
    
    // Check if user exists and is staff/HR
    const user = await User.findOne({ 
      _id: userId, 
      role: { $in: ['hr', 'staff'] },
      isActive: true 
    });
    
    if (!user) {
      return res.status(404).json({ message: 'Staff member not found' });
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
      message: 'Salary rate updated successfully',
      salaryPlan: {
        userId: String(salaryPlan.userId),
        hourlyRate: salaryPlan.hourlyRate,
        overtimeRate: salaryPlan.overtimeRate,
        status: salaryPlan.status
      }
    });
    
  } catch (err) {
    console.error('Update staff salary error:', err);
    res.status(500).json({ message: 'Server error updating salary rate' });
  }
});

// Upload avatar for current user
router.post('/upload-avatar', authenticateToken, upload.single('avatar'), async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    
    if (!req.file) {
      return res.status(400).json({ 
        success: false,
        message: 'No file uploaded' 
      });
    }

    const uploaded = await uploadToCloudinary(req.file, {
      folder: "attendance-system/avatars",
      resource_type: "image",
    });
    const avatarUrl = uploaded.secureUrl;
    
    // Update user's profilePicture URL in User model
    const updatedUser = await User.findByIdAndUpdate(
      userId,
      { profilePicture: avatarUrl },
      { new: true }
    ).select('-password');
    
    if (!updatedUser) {
      return res.status(404).json({ 
        success: false,
        message: 'User not found' 
      });
    }

    console.log('Avatar uploaded for user:', userId);
    console.log('Avatar URL:', avatarUrl);

    const fullAvatarUrl = avatarUrl;

    res.json({
      success: true,
      message: 'Avatar uploaded successfully',
      data: {
        avatarUrl: fullAvatarUrl, // Return full URL for Flutter compatibility
        profilePicture: fullAvatarUrl,
        filename: uploaded.publicId,
        size: req.file.size,
        mimetype: req.file.mimetype
      }
    });

  } catch (error) {
    console.error('Upload avatar error:', error);
    res.status(500).json({ 
      success: false,
      message: 'Failed to upload avatar: ' + (error as Error).message
    });
  }
});

export default router;
