import mongoose from 'mongoose';
import { User } from '../models/User';
import connectDB from '../config/database';

async function cleanupUsers() {
  try {
    await connectDB();
    console.log('🔍 Starting database cleanup...');

    // Keep only one admin user (the original one)
    const adminUser = await User.findOne({ role: 'admin' }).sort({ createdAt: 1 });
    
    if (!adminUser) {
      console.log('❌ No admin user found. Please create at least one admin user.');
      process.exit(1);
    }

    // Delete all other users except the first admin
    const result = await User.deleteMany({
      _id: { $ne: adminUser._id }
    });

    console.log(`✅ Cleanup complete!`);
    console.log(`   - Kept admin user: ${adminUser.email}`);
    console.log(`   - Removed ${result.deletedCount} test/mock users`);
    console.log('\nYour database is now clean with only the original admin user.');
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error during cleanup:', error);
    process.exit(1);
  }
}

cleanupUsers();
