const express = require('express');
const cors = require('cors');
const path = require('path');

// Simple mock API for development
const app = express();
const PORT = 3001; // Different port from Vite

app.use(cors());
app.use(express.json());

// Mock users data
const mockUsers = [
  {
    _id: '507f1f77bcf86cd799439011',
    name: 'Admin User',
    email: 'admin@company.com',
    role: 'admin'
  },
  {
    _id: '507f1f77bcf86cd799439012',
    name: 'John Doe',
    email: 'staff@company.com',
    role: 'staff'
  }
];

// Mock attendance data
let mockAttendance = [];
let todayAttendance = {};

// Simple JWT-like token generation
function generateToken(user) {
  return Buffer.from(JSON.stringify({
    userId: user._id,
    email: user.email,
    role: user.role
  })).toString('base64');
}

function verifyToken(token) {
  try {
    return JSON.parse(Buffer.from(token, 'base64').toString());
  } catch {
    return null;
  }
}

// Auth middleware
function authenticateToken(req, res, next) {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.split(' ')[1];
  
  if (!token) {
    return res.status(401).json({ message: 'Access token required' });
  }
  
  const user = verifyToken(token);
  if (!user) {
    return res.status(403).json({ message: 'Invalid token' });
  }
  
  req.user = user;
  next();
}

// API Routes
app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body;
  
  // Simple credential check
  const validCredentials = {
    'admin@company.com': 'admin123',
    'staff@company.com': 'staff123'
  };
  
  if (validCredentials[email] === password) {
    const user = mockUsers.find(u => u.email === email);
    const token = generateToken(user);
    
    res.json({
      message: 'Login successful',
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role
      }
    });
  } else {
    res.status(401).json({ message: 'Invalid credentials' });
  }
});

app.get('/api/auth/profile', authenticateToken, (req, res) => {
  const user = mockUsers.find(u => u._id === req.user.userId);
  res.json({
    user: {
      id: user._id,
      name: user.name,
      email: user.email,
      role: user.role
    }
  });
});

app.get('/api/auth/users', authenticateToken, (req, res) => {
  res.json({ users: mockUsers });
});

app.post('/api/attendance/checkin', authenticateToken, (req, res) => {
  const userId = req.user.userId;
  const today = new Date().toISOString().split('T')[0];
  
  if (todayAttendance[userId]) {
    return res.status(400).json({ message: 'Already checked in today' });
  }
  
  const user = mockUsers.find(u => u._id === userId);
  const attendance = {
    _id: `attendance_${userId}_${today}`,
    userId,
    name: user.name,
    date: today,
    checkIn: new Date(),
    status: 'checked-in'
  };
  
  todayAttendance[userId] = attendance;
  
  res.status(201).json({
    message: 'Checked in successfully',
    attendance
  });
});

app.put('/api/attendance/checkout', authenticateToken, (req, res) => {
  const userId = req.user.userId;
  const attendance = todayAttendance[userId];
  
  if (!attendance) {
    return res.status(404).json({ message: 'No check-in record found for today' });
  }
  
  if (attendance.checkOut) {
    return res.status(400).json({ message: 'Already checked out today' });
  }
  
  const checkOutTime = new Date();
  const diff = checkOutTime.getTime() - new Date(attendance.checkIn).getTime();
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  
  attendance.checkOut = checkOutTime;
  attendance.totalHours = `${hours}h ${minutes}m`;
  attendance.status = 'checked-out';
  
  res.json({
    message: 'Checked out successfully',
    attendance
  });
});

app.get('/api/attendance/today', authenticateToken, (req, res) => {
  const userId = req.user.userId;
  const attendance = todayAttendance[userId];
  
  res.json({ attendance: attendance || null });
});

app.get('/api/attendance/all', authenticateToken, (req, res) => {
  const allRecords = Object.values(todayAttendance);
  res.json({
    attendance: allRecords,
    pagination: {
      page: 1,
      limit: 20,
      total: allRecords.length,
      pages: 1
    }
  });
});

app.get('/api/attendance/history', authenticateToken, (req, res) => {
  const userId = req.user.userId;
  const userRecords = Object.values(todayAttendance).filter(r => r.userId === userId);
  
  res.json({
    attendance: userRecords,
    pagination: {
      page: 1,
      limit: 10,
      total: userRecords.length,
      pages: 1
    }
  });
});

app.post('/api/attendance/leave', authenticateToken, (req, res) => {
  const { date, reason } = req.body;
  res.json({
    message: 'Leave request submitted successfully',
    attendance: {
      id: 'leave_' + Date.now(),
      date,
      reason,
      status: 'on-leave'
    }
  });
});

app.post('/api/auth/register', authenticateToken, (req, res) => {
  const { name, email, password, role } = req.body;
  
  const newUser = {
    _id: 'user_' + Date.now(),
    name,
    email,
    role: role || 'staff'
  };
  
  mockUsers.push(newUser);
  
  res.status(201).json({
    message: 'User created successfully',
    user: newUser
  });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Mock API server running on http://0.0.0.0:${PORT}`);
  console.log('📝 Demo credentials:');
  console.log('   Admin: admin@company.com / admin123');
  console.log('   Staff: staff@company.com / staff123');
});
