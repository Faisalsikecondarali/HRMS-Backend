import mongoose from 'mongoose';
import { User } from '../models/User';
import { Attendance } from '../models/Attendance';
import connectDB from '../config/database';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

async function seedDatabase() {
  try {
    await connectDB();
    
    console.log('🌱 Starting database seed...');

    // Clear existing data
    await User.deleteMany({});
    await Attendance.deleteMany({});
    console.log('🗑️  Cleared existing data');

    // Create admin user
    const admin = new User({
      name: 'System Administrator',
      email: 'admin@hrms.bitlyt.com',
      password: 'Admin@2026',
      role: 'admin',
      department: 'Management',
      phone: '+92-300-1111111',
      address: 'Head Office, Business District',
      cnic: '11111-1111111-1'
    });
    await admin.save();
    console.log('👤 Created admin user: admin@hrms.bitlyt.com / Admin@2026');

    // Create owner user
    const owner = new User({
      name: 'Company Owner',
      email: 'owner@hrms.bitlyt.com',
      password: 'Owner@2026',
      role: 'owner',
      department: 'Management',
      phone: '+92-300-2222222',
      address: 'Executive Office, Business District',
      cnic: '22222-2222222-2'
    });
    await owner.save();
    console.log('👤 Created owner user: owner@hrms.bitlyt.com / Owner@2026');

    // Create HR user
    const hr = new User({
      name: 'HR Manager',
      email: 'hr@hrms.bitlyt.com',
      password: 'HR@2026',
      role: 'hr',
      department: 'Human Resources',
      phone: '+92-300-3333333',
      address: 'HR Department, Corporate Office',
      cnic: '33333-3333333-3'
    });
    await hr.save();
    console.log('👤 Created HR user: hr@hrms.bitlyt.com / HR@2026');

    // Create staff users
    const staff1 = new User({
      name: 'Senior Developer',
      email: 'dev@hrms.bitlyt.com',
      password: 'Staff@2026',
      role: 'staff',
      department: 'Engineering',
      phone: '+92-300-4444444',
      address: 'Engineering Block, Tech Park',
      cnic: '44444-4444444-4'
    });
    await staff1.save();

    const staff2 = new User({
      name: 'Sales Executive',
      email: 'sales@hrms.bitlyt.com',
      password: 'Staff@2026',
      role: 'staff',
      department: 'Sales',
      phone: '+92-300-5555555',
      address: 'Sales Office, Commercial Center',
      cnic: '55555-5555555-5'
    });
    await staff2.save();

    const staff3 = new User({
      name: 'Accountant',
      email: 'finance@hrms.bitlyt.com',
      password: 'Staff@2026',
      role: 'staff',
      department: 'Finance',
      phone: '+92-300-6666666',
      address: 'Finance Department, Corporate Tower',
      cnic: '66666-6666666-6'
    });
    await staff3.save();

    console.log('👥 Created staff users:');
    console.log('   dev@hrms.bitlyt.com / Staff@2026');
    console.log('   sales@hrms.bitlyt.com / Staff@2026');
    console.log('   finance@hrms.bitlyt.com / Staff@2026');

    // Create some sample attendance records for the past few days
    const today = new Date();
    const dates = [];
    for (let i = 4; i >= 0; i--) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      dates.push(date.toISOString().split('T')[0]);
    }

    const users = [staff1, staff2, staff3];
    
    for (const date of dates) {
      for (const user of users) {
        // Skip some records to simulate realistic attendance
        if (Math.random() > 0.85) continue;

        const checkInTime = new Date(`${date}T09:${Math.floor(Math.random() * 30).toString().padStart(2, '0')}:00`);
        const checkOutTime = new Date(`${date}T17:${Math.floor(Math.random() * 60).toString().padStart(2, '0')}:00`);
        
        const attendance = new Attendance({
          userId: user._id,
          name: user.name,
          date: date,
          checkIn: checkInTime,
          checkOut: checkOutTime,
          status: 'checked-out'
        });
        
        await attendance.save();
      }
    }

    console.log('📊 Created sample attendance records');
    console.log('✅ Database seeded successfully!');
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error seeding database:', error);
    process.exit(1);
  }
}

seedDatabase();
