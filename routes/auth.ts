import { Router, Request, Response } from 'express';
import { User } from '../models/User';
import { Profile } from '../models/Profile';
import { generateToken } from '../utils/jwt';
import { authenticateToken, AuthRequest, requireRole } from '../middleware/auth';
import { findUserByEmail, findUserById, getAllUsers } from '../data/mockData';
import mongoose from 'mongoose';

const router = Router();

const isDBConnected = () => mongoose.connection.readyState === 1;

// Register new user (admin only)
router.post('/register', authenticateToken, requireRole(['admin']), async (req: AuthRequest, res: Response) => {
  try {
    let {
      name,
      email,
      password,
      role = 'staff',
      phone,
      dob,
      domicile,
      position,
      cnicNumber
    } = req.body as {
      name: string;
      email: string;
      password: string;
      role?: 'staff' | 'admin';
      phone?: string;
      dob?: string;
      domicile?: string;
      position?: string;
      cnicNumber?: string;
    };
    // Normalize inputs
    name = (name || '').trim();
    email = (email || '').trim().toLowerCase();

    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: 'User already exists with this email' });
    }

    // Create new user
    const user = new User({ name, email, password, role });

    await user.save();

    // Profile is auto-created in User model post-save hook

    await Profile.findOneAndUpdate(
      { user: user._id },
      {
        phone,
        dob: dob ? new Date(dob) : undefined,
        joinDate: new Date(),
        domicile,
        position,
        cnicNumber,
        isComplete: true,
      },
      { new: true, upsert: true }
    );

    res.status(201).json({
      message: 'User created successfully',
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role
      }
    });
  } catch (error: any) {
    console.error('Registration error:', error);
    // Handle duplicate email
    if (error?.code === 11000 || error?.name === 'MongoServerError') {
      return res.status(400).json({ message: 'User already exists with this email' });
    }
    // Handle validation errors
    if (error?.name === 'ValidationError') {
      return res.status(400).json({ message: 'Invalid user data' });
    }
    res.status(500).json({ message: 'Server error during registration' });
  }
});

// Login
router.post('/login', async (req: Request, res: Response) => {
  console.log('🔐 LOGIN ROUTE CALLED!!!');
  try {
    const { email, password } = req.body;
    
    console.log('🔐 Login attempt:', { email, passwordLength: password?.length });

    let user;
    let isPasswordValid = false;

    if (isDBConnected()) {
      console.log('📊 Using database for authentication');
      // Use database
      user = await User.findOne({ email });
      console.log('👤 User found:', !!user);
      if (user) {
        console.log('👤 User details:', {
          id: user._id,
          name: user.name,
          email: user.email,
          role: user.role,
          isActive: user.isActive,
          hasPassword: !!user.password
        });
        
        if (user.isActive) {
          isPasswordValid = await user.comparePassword(password);
          console.log('🔑 Password valid:', isPasswordValid);
        } else {
          console.log('⚠️ User is inactive');
        }
      }
    } else {
      console.log('📊 Using mock data for authentication');
      // Use mock data for development
      user = findUserByEmail(email);
      if (user && user.isActive) {
        isPasswordValid = await user.comparePassword(password);
      }
    }

    if (!user || !user.isActive || !isPasswordValid) {
      console.log('❌ Login failed:', {
        userExists: !!user,
        userActive: user?.isActive,
        passwordValid: isPasswordValid
      });
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    console.log('✅ Login successful for:', user.name);

    // Generate token
    const token = generateToken(user as any);

    res.json({
      message: 'Login successful',
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        profilePicture: user.profilePicture ? `${req.protocol}://${req.get('host')}/uploads/${user.profilePicture.split('/').pop()}` : null,
        avatarUrl: user.profilePicture ? `${req.protocol}://${req.get('host')}/uploads/${user.profilePicture.split('/').pop()}` : null, // For Flutter compatibility
        department: user.department,
        phone: user.phone,
        address: user.address,
        cnic: user.cnic,
        isActive: user.isActive,
        employeeId: user.employeeId
      }
    });
  } catch (error) {
    console.error('❌ Login error:', error);
    res.status(500).json({ message: 'Server error during login' });
  }
});

// Get current user profile
router.get('/profile', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    let user: any;

    if (isDBConnected()) {
      try {
        user = await User.findById(req.user!.userId).select('-password');
      } catch (e) {
        console.warn('DB profile lookup failed, falling back to mock data:', e);
      }
    }

    if (!user) {
      user = findUserById(req.user!.userId);
    }

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.json({
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        profilePicture: user.profilePicture ? `${req.protocol}://${req.get('host')}/uploads/${user.profilePicture.split('/').pop()}` : null,
        avatarUrl: user.profilePicture ? `${req.protocol}://${req.get('host')}/uploads/${user.profilePicture.split('/').pop()}` : null, // For Flutter compatibility
        department: user.department,
        phone: user.phone,
        address: user.address,
        cnic: user.cnic,
        isActive: user.isActive,
        employeeId: user.employeeId
      }
    });
  } catch (error) {
    console.error('Profile error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Update current user basic info (name, email)
router.put('/profile', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    if (!isDBConnected()) {
      return res.status(500).json({ message: 'Database not connected' });
    }

    const userId = req.user!.userId;
    let { name, email } = req.body as { name?: string; email?: string };

    const updates: Partial<{ name: string; email: string }> = {};
    if (typeof name === 'string') {
      name = name.trim();
      if (name) updates.name = name;
    }
    if (typeof email === 'string') {
      email = email.trim().toLowerCase();
      if (email) updates.email = email;
    }

    if (!updates.name && !updates.email) {
      return res.status(400).json({ message: 'Nothing to update' });
    }

    if (updates.email) {
      const existing = await User.findOne({ email: updates.email, _id: { $ne: userId } });
      if (existing) {
        return res.status(400).json({ message: 'Another user already uses this email' });
      }
    }

    const user = await User.findByIdAndUpdate(userId, updates, { new: true }).select('-password');
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.json({
      message: 'Profile updated successfully',
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    });
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({ message: 'Server error updating profile' });
  }
});

// Change current user password
router.put('/change-password', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    if (!isDBConnected()) {
      return res.status(500).json({ message: 'Database not connected' });
    }

    const userId = req.user!.userId;
    const { currentPassword, newPassword } = req.body as { currentPassword?: string; newPassword?: string };

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ message: 'Current and new password are required' });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const valid = await user.comparePassword(currentPassword);
    if (!valid) {
      return res.status(400).json({ message: 'Current password is incorrect' });
    }

    user.password = newPassword;
    await user.save();

    res.json({ message: 'Password updated successfully' });
  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({ message: 'Server error changing password' });
  }
});

// Seed test users (admin, hr, staff, owner) in real database for testing
const seedTestUsersHandler = async (_req: Request, res: Response) => {
  try {
    if (!isDBConnected()) {
      return res.status(500).json({ message: 'Database not connected' });
    }

    const testUsers = [
      {
        name: 'System Admin',
        email: 'admin@company.com',
        password: 'admin123',
        role: 'admin',
        department: 'IT',
        phone: '+92 300 2222222',
        address: 'Karachi, Pakistan',
        cnic: '11111-1111111-1',
      },
      {
        name: 'HR Manager',
        email: 'hr@company.com',
        password: 'password123',
        role: 'hr',
        department: 'Human Resources',
        phone: '+92 300 1111111',
        address: 'Lahore, Pakistan',
        cnic: '22222-2222222-2',
      },
      {
        name: 'Staff Member',
        email: 'staff@company.com',
        password: 'staff123',
        role: 'staff',
        department: 'Operations',
        phone: '+92 300 3333333',
        address: 'Islamabad, Pakistan',
        cnic: '33333-3333333-3',
      },
      {
        name: 'Business Owner',
        email: 'owner@company.com',
        password: 'owner123',
        role: 'owner',
        department: 'Executive',
        phone: '+92 300 4444444',
        address: 'Karachi, Pakistan',
        cnic: '44444-4444444-4',
      },
    ] as const;

    const results: any[] = [];

    for (const u of testUsers) {
      let user = await User.findOne({ email: u.email });
      if (!user) {
        user = new User({
          name: u.name,
          email: u.email,
          password: u.password,
          role: u.role,
          department: u.department,
          phone: u.phone,
          address: u.address,
          cnic: u.cnic,
        });
        await user.save();
        results.push({ email: u.email, status: 'created', id: user._id });
      } else {
        results.push({ email: u.email, status: 'exists', id: user._id });
      }
    }

    return res.json({
      message: 'Test users seeded successfully',
      users: results,
    });
  } catch (error) {
    console.error('Seed test users error:', error);
    return res.status(500).json({ message: 'Server error seeding test users' });
  }
};

router.post('/seed-test-users', seedTestUsersHandler);
router.get('/seed-test-users', seedTestUsersHandler);

// Get all users (admin only)
router.get('/users', authenticateToken, requireRole(['admin']), async (req: AuthRequest, res: Response) => {
  try {
    let users;

    if (isDBConnected()) {
      users = await User.find({ isActive: true }).select('-password');
    } else {
      users = getAllUsers().map(user => ({
        _id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        isActive: user.isActive
      }));
    }

    res.json({ users });
  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

export default router;
