import mongoose from 'mongoose';
import { User } from '../models/User.js';
import { Department } from '../models/Department.js';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';

dotenv.config();

const createRoleBasedUsers = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/attendance-system');
    console.log('✅ Connected to MongoDB');

    // Clean up existing test users (keep only real ones)
    console.log('\n🧹 Cleaning up test users...');
    const testEmails = [
      'admin@test.com',
      'adminfaisal@company.com',
      'staff1@gmail.com',
      'staff2@gmail.com',
      'admin12@company.com'
    ];
    
    await User.deleteMany({ email: { $in: testEmails } });
    console.log('✅ Test users removed');

    // Create HR user
    console.log('\n👥 Creating HR user...');
    const hrUser = new User({
      name: 'HR Manager',
      email: 'hr@company.com',
      password: await bcrypt.hash('hr123', 10),
      role: 'hr',
      department: 'HR',
      phone: '+923001234580',
      address: 'HR Department Office',
      cnic: '12345-9876543-1',
      isActive: true,
      createdAt: new Date()
    });
    
    await hrUser.save();
    console.log('✅ HR user created: hr@company.com / hr123');

    // Create Owner user
    console.log('\n👑 Creating Owner user...');
    const ownerUser = new User({
      name: 'Company Owner',
      email: 'owner@company.com',
      password: await bcrypt.hash('owner123', 10),
      role: 'owner',
      department: 'Management',
      phone: '+923001234581',
      address: 'Owner Office',
      cnic: '12345-9876543-2',
      isActive: true,
      createdAt: new Date()
    });
    
    await ownerUser.save();
    console.log('✅ Owner user created: owner@company.com / owner123');

    // Update existing admin user to have proper credentials
    console.log('\n🔧 Updating admin user...');
    await User.updateOne(
      { email: 'admin@company.com' },
      { 
        password: await bcrypt.hash('admin123', 10),
        department: 'Management',
        phone: '+923001234582',
        address: 'Admin Office',
        cnic: '12345-9876543-3'
      }
    );
    console.log('✅ Admin user updated: admin@company.com / admin123');

    // Create sample staff users with proper departments
    console.log('\n👥 Creating staff users...');
    const staffUsers = [
      {
        name: 'Ahmed Khan',
        email: 'ahmed@company.com',
        password: 'staff123',
        role: 'staff',
        department: 'Development',
        phone: '+923001234571',
        address: 'Dev Office A',
        cnic: '12345-1234567-1'
      },
      {
        name: 'Sara Ali',
        email: 'sara@company.com',
        password: 'staff123',
        role: 'staff',
        department: 'HR',
        phone: '+923001234572',
        address: 'HR Office B',
        cnic: '12345-1234567-2'
      },
      {
        name: 'Mohammed Raza',
        email: 'raza@company.com',
        password: 'staff123',
        role: 'staff',
        department: 'Sales',
        phone: '+923001234573',
        address: 'Sales Office C',
        cnic: '12345-1234567-3'
      },
      {
        name: 'Fatima Sheikh',
        email: 'fatima@company.com',
        password: 'staff123',
        role: 'staff',
        department: 'Marketing',
        phone: '+923001234574',
        address: 'Marketing Office D',
        cnic: '12345-1234567-4'
      }
    ];

    for (const staff of staffUsers) {
      const existingStaff = await User.findOne({ email: staff.email });
      if (!existingStaff) {
        const staffUser = new User({
          ...staff,
          password: await bcrypt.hash(staff.password, 10),
          isActive: true,
          createdAt: new Date()
        });
        await staffUser.save();
        console.log(`✅ Staff created: ${staff.email} / ${staff.password}`);
      } else {
        await User.updateOne(
          { email: staff.email },
          { 
            password: await bcrypt.hash(staff.password, 10),
            department: staff.department,
            phone: staff.phone,
            address: staff.address,
            cnic: staff.cnic
          }
        );
        console.log(`✅ Staff updated: ${staff.email} / ${staff.password}`);
      }
    }

    // Show summary
    console.log('\n📊 User Summary:');
    const users = await User.find({});
    const roleCount = {};
    
    users.forEach(user => {
      roleCount[user.role] = (roleCount[user.role] || 0) + 1;
    });

    console.log('\n🎭 Role Distribution:');
    Object.entries(roleCount).forEach(([role, count]) => {
      console.log(`- ${role}: ${count} users`);
    });

    console.log('\n🔑 Login Credentials:');
    console.log('👑 Owner: owner@company.com / owner123');
    console.log('🔧 Admin: admin@company.com / admin123');
    console.log('👥 HR: hr@company.com / hr123');
    console.log('👤 Staff: ahmed@company.com / staff123');
    console.log('👤 Staff: sara@company.com / staff123');
    console.log('👤 Staff: raza@company.com / staff123');
    console.log('👤 Staff: fatima@company.com / staff123');

    console.log('\n🎉 Role-based users created successfully!');
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await mongoose.disconnect();
  }
};

createRoleBasedUsers();
