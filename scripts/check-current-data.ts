import mongoose from 'mongoose';
import { User } from '../models/User.js';
import dotenv from 'dotenv';

dotenv.config();

const checkCurrentData = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/attendance-system');
    console.log('✅ Connected to MongoDB');

    // Check existing users and roles
    console.log('\n👥 Checking existing users...');
    const users = await User.find({});
    
    if (users.length === 0) {
      console.log('❌ No users found in database');
      return;
    }

    console.log(`📊 Found ${users.length} users:`);
    const roles = new Set();
    
    users.forEach(user => {
      console.log(`- ${user.name} (${user.email}) - Role: ${user.role} - Active: ${user.isActive}`);
      roles.add(user.role);
    });

    console.log(`\n🎭 Available roles: ${Array.from(roles).join(', ')}`);
    
    // Check departments
    console.log('\n🏢 Checking departments...');
    const { Department } = await import('../models/Department.js');
    const departments = await Department.find({});
    console.log(`📊 Found ${departments.length} departments:`);
    departments.forEach(dept => {
      console.log(`- ${dept.name} (${dept.head || 'No head'})`);
    });

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await mongoose.disconnect();
  }
};

checkCurrentData();
