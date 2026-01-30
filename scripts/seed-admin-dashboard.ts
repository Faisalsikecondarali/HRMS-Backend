import mongoose from 'mongoose';
import { User } from '../models/User.js';
import { Department } from '../models/Department.js';
import { Task } from '../models/Task.js';
import { Attendance } from '../models/Attendance.js';
import dotenv from 'dotenv';

dotenv.config();

const seedAdminDashboard = async () => {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/attendance-system');
    console.log('✅ Connected to MongoDB');

    // 1. Create departments if not exists
    console.log('\n📁 Creating departments...');
    const departments = [
      { name: 'Development', description: 'Software development team', head: 'John Doe', location: 'Office A', phone: '+923001234567', email: 'dev@company.com' },
      { name: 'HR', description: 'Human Resources team', head: 'Jane Smith', location: 'Office B', phone: '+923001234568', email: 'hr@company.com' },
      { name: 'Sales', description: 'Sales team', head: 'Mike Johnson', location: 'Office C', phone: '+923001234569', email: 'sales@company.com' },
      { name: 'Marketing', description: 'Marketing team', head: 'Sarah Wilson', location: 'Office D', phone: '+923001234570', email: 'marketing@company.com' }
    ];

    for (const dept of departments) {
      const existingDept = await Department.findOne({ name: dept.name });
      if (!existingDept) {
        await Department.create(dept);
        console.log(`✅ Created department: ${dept.name}`);
      }
    }

    // 2. Create staff members if not exists
    console.log('\n👥 Creating staff members...');
    const staffMembers = [
      { name: 'Ahmed Khan', email: 'ahmed@company.com', password: 'password123', role: 'staff', department: 'Development', phone: '+923001234571', address: 'Address 1', cnic: '12345-1234567-1' },
      { name: 'Sara Ali', email: 'sara@company.com', password: 'password123', role: 'staff', department: 'HR', phone: '+923001234572', address: 'Address 2', cnic: '12345-1234567-2' },
      { name: 'Mohammed Raza', email: 'raza@company.com', password: 'password123', role: 'staff', department: 'Sales', phone: '+923001234573', address: 'Address 3', cnic: '12345-1234567-3' },
      { name: 'Fatima Sheikh', email: 'fatima@company.com', password: 'password123', role: 'staff', department: 'Marketing', phone: '+923001234574', address: 'Address 4', cnic: '12345-1234567-4' },
      { name: 'Shaharyar Ali', email: 'shaharyar@company.com', password: 'password123', role: 'staff', department: 'Development', phone: '+923001234575', address: 'Address 5', cnic: '12345-1234567-5' }
    ];

    for (const staff of staffMembers) {
      const existingStaff = await User.findOne({ email: staff.email });
      if (!existingStaff) {
        await User.create(staff);
        console.log(`✅ Created staff: ${staff.name}`);
      }
    }

    // 3. Create tasks if not exists
    console.log('\n📋 Creating tasks...');
    const createdStaff = await User.find({ role: 'staff' });
    
    const tasks = [
      { title: 'Complete project documentation', description: 'Write comprehensive documentation for the new feature', priority: 'high', assignedToIndex: 0 },
      { title: 'Review code changes', description: 'Review pull requests from team members', priority: 'medium', assignedToIndex: 1 },
      { title: 'Client meeting preparation', description: 'Prepare presentation for client meeting', priority: 'urgent', assignedToIndex: 2 },
      { title: 'Update marketing materials', description: 'Update website and marketing brochures', priority: 'low', assignedToIndex: 3 },
      { title: 'Bug fixes and testing', description: 'Fix reported bugs and perform testing', priority: 'high', assignedToIndex: 4 }
    ];

    for (const task of tasks) {
      const existingTask = await Task.findOne({ title: task.title });
      if (!existingTask && createdStaff[task.assignedToIndex]) {
        await Task.create({
          title: task.title,
          description: task.description,
          assignedTo: createdStaff[task.assignedToIndex]._id,
          assignedToName: createdStaff[task.assignedToIndex].name,
          assignedBy: (await User.findOne({ role: 'admin' }))?._id,
          assignedByName: 'Admin',
          priority: task.priority,
          status: 'pending',
          dueDate: new Date(Date.now() + Math.random() * 7 * 24 * 60 * 60 * 1000)
        });
        console.log(`✅ Created task: ${task.title}`);
      }
    }

    // 4. Create attendance records
    console.log('\n⏰ Creating attendance records...');
    const attendanceRecords = [];
    const today = new Date();
    
    for (let i = 0; i < 30; i++) { // Last 30 days
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      
      for (const staff of createdStaff) {
        // Random attendance status
        const random = Math.random();
        let status, checkIn, checkOut, overtime = 0;
        
        if (random < 0.8) { // 80% present
          status = 'present';
          checkIn = new Date(date);
          checkIn.setHours(9 + Math.floor(Math.random() * 2), Math.floor(Math.random() * 60));
          checkOut = new Date(date);
          checkOut.setHours(17 + Math.floor(Math.random() * 2), Math.floor(Math.random() * 60));
          overtime = Math.random() > 0.7 ? Math.floor(Math.random() * 3) : 0;
        } else if (random < 0.9) { // 10% late
          status = 'late';
          checkIn = new Date(date);
          checkIn.setHours(10 + Math.floor(Math.random() * 2), Math.floor(Math.random() * 60));
          checkOut = new Date(date);
          checkOut.setHours(18 + Math.floor(Math.random() * 2), Math.floor(Math.random() * 60));
          overtime = Math.random() > 0.5 ? Math.floor(Math.random() * 2) : 0;
        } else { // 10% absent
          status = 'absent';
          checkIn = null;
          checkOut = null;
          overtime = 0;
        }
        
        // Skip weekends
        if (date.getDay() === 0 || date.getDay() === 6) continue;
        
        attendanceRecords.push({
          userId: staff._id,
          userName: staff.name,
          department: staff.department,
          date: date,
          checkIn,
          checkOut,
          status,
          overtime,
          workHours: status !== 'absent' ? 8 + overtime : 0
        });
      }
    }

    // Insert attendance records in batches
    for (let i = 0; i < attendanceRecords.length; i += 50) {
      const batch = attendanceRecords.slice(i, i + 50);
      await Attendance.insertMany(batch, { ordered: false });
    }
    
    console.log(`✅ Created ${attendanceRecords.length} attendance records`);

    // 5. Show summary
    const summary = await Promise.all([
      User.countDocuments({ role: { $ne: 'owner' } }),
      User.countDocuments({ role: 'staff', isActive: true }),
      Department.countDocuments(),
      Task.countDocuments(),
      Attendance.countDocuments()
    ]);

    console.log('\n📊 Database Summary:');
    console.log(`👥 Total Staff: ${summary[0]}`);
    console.log(`✅ Active Staff: ${summary[1]}`);
    console.log(`🏢 Departments: ${summary[2]}`);
    console.log(`📋 Tasks: ${summary[3]}`);
    console.log(`⏰ Attendance Records: ${summary[4]}`);

    console.log('\n🎉 Admin dashboard data seeding completed successfully!');
    console.log('\n🚀 Now you can:');
    console.log('1. Login as admin: admin@test.com / admin123');
    console.log('2. View the admin dashboard with real data');
    console.log('3. Test task assignment functionality');
    console.log('4. View attendance analytics');
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error seeding data:', error);
    process.exit(1);
  }
};

seedAdminDashboard();
