// Simple test to create notifications without TypeScript compilation
import { MongoClient } from 'mongodb';

async function createTestNotifications() {
  const client = new MongoClient('mongodb://localhost:27017');
  
  try {
    await client.connect();
    console.log('Connected to MongoDB');
    
    const db = client.db('staff_management');
    const users = db.collection('users');
    const notifications = db.collection('notifications');
    
    // Find HR user
    const hrUser = await users.findOne({ email: 'hr@company.com' });
    if (!hrUser) {
      console.log('HR user not found');
      return;
    }
    
    console.log('HR user found:', hrUser._id);
    
    // Clear existing notifications for this user
    await notifications.deleteMany({ userId: hrUser._id });
    console.log('Cleared existing notifications');
    
    // Create test notifications
    const testNotifications = [
      {
        userId: hrUser._id,
        type: 'leave_request',
        message: 'New leave request from John Doe for Sick Leave - Feeling unwell with fever',
        read: false,
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        userId: hrUser._id,
        type: 'attendance_edit',
        message: 'New attendance edit request from Jane Smith - Wrong check-in time recorded',
        read: false,
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        userId: hrUser._id,
        type: 'task_completed',
        message: 'Task completed: Monthly Report submitted by Mike Johnson',
        read: false,
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        userId: hrUser._id,
        type: 'salary_generated',
        message: 'Salary generated for December 2024 - 6 staff members processed',
        read: true,
        createdAt: new Date(),
        updatedAt: new Date()
      }
    ];
    
    const result = await notifications.insertMany(testNotifications);
    console.log(`Created ${result.insertedCount} test notifications`);
    
    // Count unread notifications
    const unreadCount = await notifications.countDocuments({ 
      userId: hrUser._id, 
      read: false 
    });
    console.log(`Unread notifications: ${unreadCount}`);
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await client.close();
  }
}

createTestNotifications();
