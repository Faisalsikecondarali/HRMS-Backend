import { IUser } from '../models/User';
import { IAttendance } from '../models/Attendance';

// Mock users for development mode (when DB is not connected)
export const mockUsers = [
  {
    _id: '507f1f77bcf86cd799439011',
    name: 'Admin User',
    email: 'admin@company.com',
    password: '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', // admin123
    role: 'admin' as const,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    comparePassword: async (password: string) => password === 'admin123'
  },
  {
    _id: '507f1f77bcf86cd799439012',
    name: 'John Doe',
    email: 'staff@company.com',
    password: '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', // staff123
    role: 'staff' as const,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    comparePassword: async (password: string) => password === 'staff123'
  },
  {
    _id: '507f1f77bcf86cd799439013',
    name: 'Jane Smith',
    email: 'jane@company.com',
    password: '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', // staff123
    role: 'staff' as const,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    comparePassword: async (password: string) => password === 'staff123'
  }
];

// Mock attendance data for development
export const mockAttendance = [
  {
    _id: '507f1f77bcf86cd799439021',
    userId: '507f1f77bcf86cd799439012',
    name: 'John Doe',
    date: '2025-01-13',
    checkIn: new Date('2025-01-13T09:15:00'),
    checkOut: new Date('2025-01-13T17:30:00'),
    totalHours: '8h 15m',
    status: 'checked-out' as const,
    createdAt: new Date(),
    updatedAt: new Date()
  },
  {
    _id: '507f1f77bcf86cd799439022',
    userId: '507f1f77bcf86cd799439013',
    name: 'Jane Smith',
    date: '2025-01-13',
    checkIn: new Date('2025-01-13T09:00:00'),
    checkOut: new Date('2025-01-13T17:45:00'),
    totalHours: '8h 45m',
    status: 'checked-out' as const,
    createdAt: new Date(),
    updatedAt: new Date()
  },
  {
    _id: '507f1f77bcf86cd799439023',
    userId: '507f1f77bcf86cd799439012',
    name: 'John Doe',
    date: '2025-01-12',
    checkIn: new Date('2025-01-12T09:05:00'),
    checkOut: new Date('2025-01-12T17:20:00'),
    totalHours: '8h 15m',
    status: 'checked-out' as const,
    createdAt: new Date(),
    updatedAt: new Date()
  },
  {
    _id: '507f1f77bcf86cd799439024',
    userId: '507f1f77bcf86cd799439013',
    name: 'Jane Smith',
    date: '2025-01-12',
    checkIn: new Date('2025-01-12T08:55:00'),
    checkOut: new Date('2025-01-12T17:35:00'),
    totalHours: '8h 40m',
    status: 'checked-out' as const,
    createdAt: new Date(),
    updatedAt: new Date()
  }
];

let todayAttendance: { [userId: string]: any } = {};

export const getTodayAttendance = (userId: string) => {
  return todayAttendance[userId] || null;
};

export const setTodayAttendance = (userId: string, attendance: any) => {
  todayAttendance[userId] = attendance;
};

export const clearAllAttendanceMock = () => {
  todayAttendance = {};
};

export const findUserByEmail = (email: string) => {
  return mockUsers.find(user => user.email === email);
};

export const findUserById = (id: string) => {
  return mockUsers.find(user => user._id === id);
};

export const getAllUsers = () => {
  return mockUsers.filter(user => user.isActive);
};

export const getAllAttendance = () => {
  return [...mockAttendance, ...Object.values(todayAttendance)];
};
