import mongoose from 'mongoose';
import { User } from '../models/User.js';
import dotenv from 'dotenv';

dotenv.config();

const checkUserCredentials = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/attendance-system');
    console.log('✅ Connected to MongoDB');
    
    // Check admin user
    const admin = await User.findOne({ email: 'admin@company.com' });
    console.log('👑 Admin User:', admin ? {
      email: admin.email,
      role: admin.role,
      isActive: admin.isActive,
      hasPassword: !!admin.password
    } : 'Not found');
    
    // Check owner user
    const owner = await User.findOne({ email: 'owner@company.com' });
    console.log('👑 Owner User:', owner ? {
      email: owner.email,
      role: owner.role,
      isActive: owner.isActive,
      hasPassword: !!owner.password
    } : 'Not found');
    
    // Check HR user
    const hr = await User.findOne({ email: 'hr@company.com' });
    console.log('💼 HR User:', hr ? {
      email: hr.email,
      role: hr.role,
      isActive: hr.isActive,
      hasPassword: !!hr.password
    } : 'Not found');
    
    // Check staff user
    const staff = await User.findOne({ email: 'ahmed@company.com' });
    console.log('👥 Staff User:', staff ? {
      email: staff.email,
      role: staff.role,
      isActive: staff.isActive,
      hasPassword: !!staff.password
    } : 'Not found');
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await mongoose.disconnect();
  }
};

checkUserCredentials();
