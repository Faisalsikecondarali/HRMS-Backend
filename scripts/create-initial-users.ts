import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { User } from '../models/User.js';
import { Profile } from '../models/Profile.js';

// Initial users to create
const initialUsers = [
  {
    name: 'Admin User',
    email: 'admin@company.com',
    password: 'admin123',
    role: 'admin',
    department: 'Administration',
    phone: '03001234567',
    address: 'Office Address',
    cnic: '12345-1234567-1',
  },
  {
    name: 'HR Manager',
    email: 'hr@company.com',
    password: 'hr12345', // Fixed: minimum 6 characters
    role: 'hr',
    department: 'Human Resources',
    phone: '03001234568',
    address: 'Office Address',
    cnic: '12345-1234567-2',
  },
  {
    name: 'Company Owner',
    email: 'owner@company.com',
    password: 'owner123',
    role: 'owner',
    department: 'Management',
    phone: '03001234569',
    address: 'Office Address',
    cnic: '12345-1234567-3',
  },
  {
    name: 'Staff Member',
    email: 'staff@company.com',
    password: 'staff123',
    role: 'staff',
    department: 'General',
    phone: '03001234570',
    address: 'Office Address',
    cnic: '12345-1234567-4',
  },
];

async function createInitialUsers() {
  try {
    // Connect to MongoDB
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/staff_management';
    await mongoose.connect(mongoUri);
    console.log('Connected to MongoDB');

    // Clear existing users (optional - remove if you want to keep existing data)
    console.log('Creating initial users...');

    for (const userData of initialUsers) {
      try {
        // Check if user already exists
        const existingUser = await User.findOne({ email: userData.email });
        if (existingUser) {
          console.log(`User ${userData.email} already exists, deleting and recreating...`);
          await User.deleteOne({ email: userData.email });
        }

        // Create user with proper password hashing (handled by User model pre-save hook)
        const user = new User({
          ...userData,
          password: userData.password, // Plain password - will be hashed by pre-save hook
        });

        await user.save();
        console.log(`✅ Created ${userData.role}: ${userData.email}`);

      } catch (error: any) {
        console.error(`❌ Error creating user ${userData.email}:`, error.message);
      }
    }

    console.log('🎉 Initial users creation completed!');
    
    // Display created users
    const users = await User.find({}).select('name email role employeeId isActive');
    console.log('\n📋 Current Users in Database:');
    users.forEach(user => {
      console.log(`- ${user.name} (${user.email}) - ${user.role} - ID: ${user.employeeId}`);
    });

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');
  }
}

// Run the script
createInitialUsers();
