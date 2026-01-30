import mongoose from 'mongoose';
import { User } from '../models/User.js';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';

dotenv.config();

const fixUserPasswords = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/attendance-system');
    console.log('✅ Connected to MongoDB');
    
    // Fix Owner password
    console.log('\n👑 Fixing Owner password...');
    const owner = await User.findOne({ email: 'owner@company.com' });
    if (owner) {
      const hashedPassword = await bcrypt.hash('owner123', 10);
      await User.updateOne(
        { email: 'owner@company.com' },
        { password: hashedPassword }
      );
      console.log('✅ Owner password fixed');
    }
    
    // Fix HR password
    console.log('\n💼 Fixing HR password...');
    const hr = await User.findOne({ email: 'hr@company.com' });
    if (hr) {
      const hashedPassword = await bcrypt.hash('hr123', 10);
      await User.updateOne(
        { email: 'hr@company.com' },
        { password: hashedPassword }
      );
      console.log('✅ HR password fixed');
    }
    
    // Test all logins again
    console.log('\n🧪 Testing all logins after fix...');
    
    const testUsers = [
      { email: 'admin@company.com', password: 'admin123', role: 'Admin' },
      { email: 'owner@company.com', password: 'owner123', role: 'Owner' },
      { email: 'hr@company.com', password: 'hr123', role: 'HR' },
      { email: 'ahmed@company.com', password: 'staff123', role: 'Staff' }
    ];

    for (const user of testUsers) {
      const userDoc = await User.findOne({ email: user.email });
      const isValid = await bcrypt.compare(user.password, userDoc?.password || '');
      console.log(`${isValid ? '✅' : '❌'} ${user.role}: ${user.email} - Password ${isValid ? 'valid' : 'invalid'}`);
    }
    
    console.log('\n🎉 All passwords fixed and verified!');
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await mongoose.disconnect();
  }
};

fixUserPasswords();
