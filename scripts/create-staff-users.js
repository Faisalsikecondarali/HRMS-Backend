const mongoose = require('mongoose');
const User = require('../models/User');
const Profile = require('../models/Profile');
require('dotenv').config();

async function createStaffUsers() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    const staffUsers = [
      {
        email: 'ahmed@company.com',
        password: 'password123',
        role: 'staff',
        isActive: true,
        name: 'Ahmed Khan'
      },
      {
        email: 'sara@company.com', 
        password: 'password123',
        role: 'staff',
        isActive: true,
        name: 'Sara Ali'
      },
      {
        email: 'raza@company.com',
        password: 'password123', 
        role: 'staff',
        isActive: true,
        name: 'Mohammed Raza'
      },
      {
        email: 'fatima@company.com',
        password: 'password123',
        role: 'staff', 
        isActive: true,
        name: 'Fatima Sheikh'
      }
    ];

    for (const userData of staffUsers) {
      // Check if user already exists
      const existingUser = await User.findOne({ email: userData.email });
      if (existingUser) {
        console.log(`User ${userData.email} already exists`);
        continue;
      }

      // Create user
      const user = new User(userData);
      await user.save();

      // Create profile
      const profile = new Profile({
        user: user._id,
        name: userData.name,
        email: userData.email,
        avatarUrl: '/api/placeholder/40/40'
      });
      await profile.save();

      console.log(`Created staff user: ${userData.name} (${userData.email})`);
    }

    console.log('Staff users created successfully!');
  } catch (error) {
    console.error('Error creating staff users:', error);
  } finally {
    await mongoose.disconnect();
  }
}

createStaffUsers();
