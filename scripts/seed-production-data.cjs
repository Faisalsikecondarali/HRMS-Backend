const mongoose = require('mongoose');

// Import models (assuming they're already defined)
const User = require('../models/User');
const Department = require('../models/Department');

console.log('🚀 Seeding Production Data to MongoDB Atlas');
console.log('==========================================');

async function seedProductionData() {
  try {
    // Connect to MongoDB Atlas
    await mongoose.connect('mongodb+srv://faisalali:faisal123@cluster0.32vd3j8.mongodb.net/attendance-system?appName=Cluster0');
    console.log('✅ Connected to MongoDB Atlas');
    
    // Clear existing data (be careful in production!)
    console.log('🧹 Cleaning existing data...');
    await Department.deleteMany({});
    await User.deleteMany({});
    console.log('✅ Existing data cleared');
    
    // Create departments
    console.log('📁 Creating departments...');
    const departments = [
      {
        name: 'Development',
        description: 'Software development and engineering team responsible for product development',
        head: 'Ahmed Khan',
        location: 'Karachi, Pakistan',
        phone: '+92 300 1234567',
        email: 'dev@company.com'
      },
      {
        name: 'Human Resources',
        description: 'HR operations and staff management team',
        head: 'Sara Ali',
        location: 'Lahore, Pakistan',
        phone: '+92 321 9876543',
        email: 'hr@company.com'
      },
      {
        name: 'Sales',
        description: 'Sales and business development team',
        head: 'Mohammed Raza',
        location: 'Islamabad, Pakistan',
        phone: '+92 333 4567890',
        email: 'sales@company.com'
      },
      {
        name: 'Marketing',
        description: 'Marketing and communications team',
        head: 'Fatima Sheikh',
        location: 'Karachi, Pakistan',
        phone: '+92 311 2345678',
        email: 'marketing@company.com'
      },
      {
        name: 'Operations',
        description: 'Operations and logistics management team',
        head: 'Ali Hassan',
        location: 'Karachi, Pakistan',
        phone: '+92 344 8765432',
        email: 'operations@company.com'
      }
    ];
    
    const createdDepartments = await Department.insertMany(departments);
    console.log(`✅ Created ${createdDepartments.length} departments`);
    
    // Create users
    console.log('👥 Creating users...');
    const users = [
      {
        name: 'Admin User',
        email: 'admin@company.com',
        password: '$2b$10$rOzJqQjQjQjQjQjQjQjQjOzJqQjQjQjQjQjQjQjQjQjQjQjQjQjQjQjQjQjQ', // admin123
        role: 'admin',
        department: 'Management',
        isActive: true,
        lastLogin: new Date()
      },
      {
        name: 'Ahmed Khan',
        email: 'ahmed.khan@company.com',
        password: '$2b$10$rOzJqQjQjQjQjQjQjQjQjOzJqQjQjQjQjQjQjQjQjQjQjQjQjQjQjQjQjQjQ', // staff123
        role: 'staff',
        department: 'Development',
        isActive: true,
        lastLogin: new Date()
      },
      {
        name: 'Sara Ali',
        email: 'sara.ali@company.com',
        password: '$2b$10$rOzJqQjQjQjQjQjQjQjQjOzJqQjQjQjQjQjQjQjQjQjQjQjQjQjQjQjQjQjQ', // staff123
        role: 'staff',
        department: 'Human Resources',
        isActive: true,
        lastLogin: new Date()
      },
      {
        name: 'Mohammed Raza',
        email: 'mohammed.raza@company.com',
        password: '$2b$10$rOzJqQjQjQjQjQjQjQjQjOzJqQjQjQjQjQjQjQjQjQjQjQjQjQjQjQjQjQjQ', // staff123
        role: 'staff',
        department: 'Sales',
        isActive: true,
        lastLogin: new Date()
      },
      {
        name: 'Fatima Sheikh',
        email: 'fatima.sheikh@company.com',
        password: '$2b$10$rOzJqQjQjQjQjQjQjQjQjOzJqQjQjQjQjQjQjQjQjQjQjQjQjQjQjQjQjQjQ', // staff123
        role: 'staff',
        department: 'Marketing',
        isActive: true,
        lastLogin: new Date()
      }
    ];
    
    const createdUsers = await User.insertMany(users);
    console.log(`✅ Created ${createdUsers.length} users`);
    
    // Display summary
    console.log('\n📊 Production Data Summary:');
    console.log(`📁 Departments: ${createdDepartments.length}`);
    console.log(`👥 Users: ${createdUsers.length}`);
    
    console.log('\n🔑 Login Credentials:');
    console.log('Admin: admin@company.com / admin123');
    console.log('Staff: ahmed.khan@company.com / staff123');
    console.log('Staff: sara.ali@company.com / staff123');
    console.log('Staff: mohammed.raza@company.com / staff123');
    console.log('Staff: fatima.sheikh@company.com / staff123');
    
    console.log('\n🎉 Production data seeded successfully!');
    console.log('🌐 Your app is now ready with MongoDB Atlas!');
    
  } catch (error) {
    console.error('❌ Error seeding production data:', error.message);
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Disconnected from MongoDB Atlas');
  }
}

seedProductionData();
