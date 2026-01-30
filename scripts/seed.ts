import mongoose from 'mongoose';
import { User } from '../models/User';
import { Attendance } from '../models/Attendance';
import connectDB from '../config/database';

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
      name: 'Admin User',
      email: 'admin@company.com',
      password: 'admin123',
      role: 'admin',
      department: 'Management',
      phone: '0300-1234567',
      address: 'Office Address',
      cnic: '12345-1234567-1'
    });
    await admin.save();
    console.log('👤 Created admin user: admin@company.com / admin123');

    // Create staff users
    const staff1 = new User({
      name: 'John Doe',
      email: 'john@company.com',
      password: 'staff123',
      role: 'staff',
      department: 'Engineering',
      phone: '0300-2345678',
      address: '123 Street, City',
      cnic: '23456-2345678-2'
    });
    await staff1.save();

    const staff2 = new User({
      name: 'Jane Smith',
      email: 'jane@company.com',
      password: 'staff123',
      role: 'staff',
      department: 'HR',
      phone: '0300-3456789',
      address: '456 Avenue, City',
      cnic: '34567-3456789-3'
    });
    await staff2.save();

    const staff3 = new User({
      name: 'Mike Johnson',
      email: 'mike@company.com',
      password: 'staff123',
      role: 'staff',
      department: 'Sales',
      phone: '0300-4567890',
      address: '789 Boulevard, City',
      cnic: '45678-4567890-4'
    });
    await staff3.save();

    console.log('👥 Created staff users:');
    console.log('   john@company.com / staff123');
    console.log('   jane@company.com / staff123');
    console.log('   mike@company.com / staff123');

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
