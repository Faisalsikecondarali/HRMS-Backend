import mongoose from 'mongoose';
import { User } from '../models/User';
import connectDB from '../config/database';
import bcrypt from 'bcryptjs';

async function createAdminUser() {
  try {
    await connectDB();
    console.log('🔍 Connecting to database...');

    // Check if user already exists
    const existingUser = await User.findOne({ email: 'faisal@gmail.com' });
    
    if (existingUser) {
      console.log('ℹ️ User with email faisal@gmail.com already exists. Updating to admin role...');
      existingUser.role = 'admin';
      existingUser.isActive = true;
      await existingUser.save();
      console.log('✅ Updated existing user to admin role');
    } else {
      // Create new admin user
      const hashedPassword = await bcrypt.hash('faisal123', 10);
      
      const adminUser = new User({
        name: 'Faisal Admin',
        email: 'faisal@gmail.com',
        password: hashedPassword,
        role: 'admin',
        isActive: true
      });
      
      await adminUser.save();
      console.log('✅ Created new admin user');
    }

    console.log('\nAdmin user details:');
    console.log('📧 Email: faisal@gmail.com');
    console.log('🔑 Password: faisal123');
    console.log('👑 Role: admin');
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error creating admin user:', error);
    process.exit(1);
  }
}

// Call the function to create admin user
createAdminUser();
