import mongoose from 'mongoose';
import { User } from '../models/User.js';
import { Department } from '../models/Department.js';
import { Task } from '../models/Task.js';
import dotenv from 'dotenv';

dotenv.config();

const testTaskAssignment = async () => {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/attendance-system');
    console.log('✅ Connected to MongoDB');

    // Create test staff member if not exists
    let testStaff = await User.findOne({ email: 'shaharyar@test.com' });
    if (!testStaff) {
      testStaff = new User({
        name: 'Shaharyar Ali',
        email: 'shaharyar@test.com',
        password: 'password123',
        role: 'staff',
        department: 'Development',
        phone: '+923001234567',
        address: 'Test Address',
        cnic: '12345-1234567-2',
        isActive: true
      });
      await testStaff.save();
      console.log('✅ Created test staff member: Shaharyar Ali');
    }

    // Create test department if not exists
    let devDept = await Department.findOne({ name: 'Development' });
    if (!devDept) {
      devDept = new Department({
        name: 'Development',
        description: 'Software development team',
        head: 'Team Lead',
        location: 'Office',
        phone: '+923001234567',
        email: 'dev@company.com',
        isActive: true
      });
      await devDept.save();
      console.log('✅ Created Development department');
    }

    // Create a test task
    const testTask = new Task({
      title: 'Test Task Assignment',
      description: 'This is a test task to verify the assignment flow',
      assignedTo: testStaff._id,
      assignedToName: testStaff.name,
      assignedBy: (await User.findOne({ role: 'admin' }))?._id,
      assignedByName: 'Test Admin',
      dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      priority: 'high',
      status: 'pending'
    });

    await testTask.save();
    console.log('✅ Created test task assigned to Shaharyar Ali');

    // Verify the task was created
    const allTasks = await Task.find({});
    console.log(`📊 Total tasks in database: ${allTasks.length}`);

    // Show staff and department info
    const allStaff = await User.find({ role: 'staff', isActive: true });
    const allDepts = await Department.find({ isActive: true });
    
    console.log(`👥 Total staff members: ${allStaff.length}`);
    console.log(`🏢 Total departments: ${allDepts.length}`);
    
    // Show staff by department
    const devStaff = allStaff.filter(staff => staff.department === 'Development');
    console.log(`💻 Development department staff: ${devStaff.length}`);
    devStaff.forEach(staff => {
      console.log(`   - ${staff.name} (${staff.email})`);
    });

    console.log('🎉 Task assignment test completed successfully!');
    console.log('');
    console.log('📋 Test Data Summary:');
    console.log(`   Admin User: admin@test.com`);
    console.log(`   Staff User: ${testStaff.name} (${testStaff.email})`);
    console.log(`   Department: ${devDept.name}`);
    console.log(`   Task Created: "${testTask.title}"`);
    console.log('');
    console.log('🚀 Ready to test in the browser!');
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error testing task assignment:', error);
    process.exit(1);
  }
};

testTaskAssignment();
