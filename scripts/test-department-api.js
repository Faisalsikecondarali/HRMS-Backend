// Simple test script for Department API
const mongoose = require('mongoose');

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

console.log('🚀 Department API Test Script');
console.log('================================');
console.log('Sample Departments Ready:');
departments.forEach((dept, index) => {
  console.log(`${index + 1}. ${dept.name} - ${dept.head}`);
});

console.log('\n📋 Next Steps:');
console.log('1. Start your server: npm run dev');
console.log('2. Open browser: http://localhost:8080');
console.log('3. Login as admin: admin@company.com / admin123');
console.log('4. Go to Admin Dashboard');
console.log('5. Check Department Management section');
console.log('6. Test Create, Edit, Delete operations');

console.log('\n🎯 Expected API Endpoints:');
console.log('- GET    /api/admin/departments');
console.log('- POST   /api/admin/departments');
console.log('- PUT    /api/admin/departments/:id');
console.log('- DELETE /api/admin/departments/:id');
console.log('- GET    /api/admin/system-stats');

console.log('\n✅ Department system is ready for testing!');
