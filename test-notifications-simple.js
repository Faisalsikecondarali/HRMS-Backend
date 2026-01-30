import mongoose from 'mongoose';
import { Notification } from './models/Notification.js';
import { User } from './models/User.js';

mongoose.connect('mongodb://localhost:27017/staff_management')
  .then(async () => {
    console.log('Connected to MongoDB');
    
    // Find HR user
    const hrUser = await User.findOne({ email: 'hr@company.com' });
    if (!hrUser) {
      console.log('HR user not found');
      await mongoose.disconnect();
      return;
    }
    
    console.log('HR user found:', hrUser._id);
    
    // Clear existing notifications for this user
    await Notification.deleteMany({ userId: hrUser._id });
    console.log('Cleared existing notifications');
    
    // Create test notifications
    const testNotifications = [
      {
        userId: hrUser._id,
        type: 'leave_request',
        message: 'New leave request from John Doe for Sick Leave - Feeling unwell with fever',
        read: false
      },
      {
        userId: hrUser._id,
        type: 'attendance_edit',
        message: 'New attendance edit request from Jane Smith - Wrong check-in time recorded',
        read: false
      },
      {
        userId: hrUser._id,
        type: 'task_completed',
        message: 'Task completed: Monthly Report submitted by Mike Johnson',
        read: false
      },
      {
        userId: hrUser._id,
        type: 'salary_generated',
        message: 'Salary generated for December 2024 - 6 staff members processed',
        read: true
      },
      {
        userId: hrUser._id,
        type: 'system',
        message: 'System maintenance scheduled for tonight at 11:00 PM',
        read: true
      }
    ];
    
    const createdNotifications = await Notification.insertMany(testNotifications);
    console.log(`Created ${createdNotifications.length} test notifications`);
    
    // Count unread notifications
    const unreadCount = await Notification.countDocuments({ 
      userId: hrUser._id, 
      read: false 
    });
    console.log(`Unread notifications: ${unreadCount}`);
    
    await mongoose.disconnect();
  })
  .catch(console.error);
