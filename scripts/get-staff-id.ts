import mongoose from 'mongoose';
import { User } from '../models/User.js';
import dotenv from 'dotenv';

dotenv.config();

const getStaffId = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/attendance-system');
    
    const staff = await User.findOne({ email: 'shaharyar@test.com' });
    if (staff) {
      console.log('✅ Staff found:');
      console.log('📋 ID:', staff._id);
      console.log('👤 Name:', staff.name);
      console.log('📧 Email:', staff.email);
      console.log('🏢 Department:', staff.department);
    } else {
      console.log('❌ Staff not found');
    }
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
};

getStaffId();
