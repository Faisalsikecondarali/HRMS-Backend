import dotenv from 'dotenv';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { User } from '../models/User.js';

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/attendance-system';

const testUsers = [
  {
    name: 'Admin User',
    email: 'admin@test.com',
    password: 'admin123',
    role: 'admin',
    isActive: true
  },
  {
    name: 'Staff User',
    email: 'staff@test.com',
    password: 'staff123',
    role: 'staff',
    isActive: true
  }
];

async function seedUsers() {
  try {
    // Connect to MongoDB
    await mongoose.connect(MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });

    console.log('Connected to MongoDB');

    // Clear existing users (optional)
    await User.deleteMany({});
    console.log('Cleared existing users');

    // Hash passwords and create users
    const createdUsers = [];
    for (const user of testUsers) {
      const hashedPassword = await bcrypt.hash(user.password, 10);
      const newUser = new User({
        ...user,
        password: hashedPassword
      });
      createdUsers.push(await newUser.save());
    }

    console.log('Created test users:');
    createdUsers.forEach(user => {
      console.log(`- ${user.name} (${user.email}) - Role: ${user.role}`);
      console.log(`  Email: ${user.email}`);
      console.log(`  Password: ${testUsers.find(u => u.email === user.email).password}`);
    });

    console.log('\nYou can now log in with these credentials:');
    console.log('Admin login:');
    console.log('  Email: admin@test.com');
    console.log('  Password: admin123\n');
    console.log('Staff login:');
    console.log('  Email: staff@test.com');
    console.log('  Password: staff123');

    process.exit(0);
  } catch (error) {
    console.error('Error seeding users:', error);
    process.exit(1);
  }
}

seedUsers();
