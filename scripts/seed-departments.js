import mongoose from 'mongoose';
import { Department } from '../models/Department.ts';

// Sample departments data
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

async function seedDepartments() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/staff_management');
    
    console.log('Connected to MongoDB');
    
    // Clear existing departments
    await Department.deleteMany({});
    console.log('Cleared existing departments');
    
    // Insert new departments
    const insertedDepartments = await Department.insertMany(departments);
    console.log(`Inserted ${insertedDepartments.length} departments:`);
    
    insertedDepartments.forEach(dept => {
      console.log(`- ${dept.name} (${dept.head})`);
    });
    
    console.log('Department seeding completed successfully!');
    
  } catch (error) {
    console.error('Error seeding departments:', error);
  } finally {
    await mongoose.disconnect();
  }
}

// Run the seeding function
seedDepartments();
