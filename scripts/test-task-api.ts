import mongoose from 'mongoose';
import { User } from '../models/User.js';
import { Department } from '../models/Department.js';
import { Task } from '../models/Task.js';
import dotenv from 'dotenv';

dotenv.config();

const testTaskAPI = async () => {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/attendance-system');
    console.log('✅ Connected to MongoDB');

    // Check if we have staff and departments
    const staffCount = await User.countDocuments({ isActive: true, role: { $ne: 'admin' } });
    const deptCount = await Department.countDocuments({ isActive: true });
    
    console.log(`📊 Found ${staffCount} staff members and ${deptCount} departments`);

    if (staffCount === 0) {
      console.log('⚠️ No staff found. Creating sample staff...');
      
      // Create sample staff
      const sampleStaff = new User({
        name: 'Test Staff Member',
        email: 'staff@test.com',
        password: 'password123',
        role: 'staff',
        department: 'Development',
        phone: '+92 300 1234567',
        address: 'Test Address',
        cnic: '12345-1234567-1',
        isActive: true
      });
      
      await sampleStaff.save();
      console.log('✅ Created sample staff member');
    }

    if (deptCount === 0) {
      console.log('⚠️ No departments found. Creating sample department...');
      
      // Create sample department
      const sampleDept = new Department({
        name: 'Development',
        description: 'Software development team',
        head: 'Team Lead',
        location: 'Office',
        phone: '+923001234567',
        email: 'dev@company.com',
        isActive: true
      });
      
      await sampleDept.save();
      console.log('✅ Created sample department');
    }

    // Create a sample task
    const sampleTask = new Task({
      title: 'Test Task',
      description: 'This is a test task for API verification',
      assignedTo: (await User.findOne({ role: 'staff' }))?._id,
      assignedToName: 'Test Staff Member',
      assignedBy: (await User.findOne({ role: 'admin' }))?._id,
      assignedByName: 'Test Admin',
      dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days from now
      priority: 'medium',
      status: 'pending'
    });

    await sampleTask.save();
    console.log('✅ Created sample task');

    // Verify task was created
    const taskCount = await Task.countDocuments();
    console.log(`📊 Total tasks in database: ${taskCount}`);

    console.log('🎉 Task API test completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error testing task API:', error);
    process.exit(1);
  }
};

testTaskAPI();
