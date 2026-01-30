console.log('🧪 Testing Staff Management API');
console.log('==============================');

async function testStaffAPI() {
  try {
    console.log('📡 Testing Staff API Endpoints...');
    
    // Test 1: Get all staff
    console.log('\n1️⃣ Testing GET /api/admin/staff');
    const staffResponse = await fetch('http://localhost:3000/api/admin/staff', {
      headers: {
        'Authorization': 'Bearer mock-token', // This would be real JWT in production
        'Content-Type': 'application/json'
      }
    });
    
    if (staffResponse.ok) {
      const staffData = await staffResponse.json();
      console.log('✅ GET /api/admin/staff - Success');
      console.log(`📊 Found ${staffData.staff?.length || 0} staff members`);
    } else {
      console.log('❌ GET /api/admin/staff - Failed:', staffResponse.status);
    }
    
    // Test 2: Get departments
    console.log('\n2️⃣ Testing GET /api/admin/departments');
    const deptResponse = await fetch('http://localhost:3000/api/admin/departments', {
      headers: {
        'Authorization': 'Bearer mock-token',
        'Content-Type': 'application/json'
      }
    });
    
    if (deptResponse.ok) {
      const deptData = await deptResponse.json();
      console.log('✅ GET /api/admin/departments - Success');
      console.log(`📁 Found ${deptData.departments?.length || 0} departments`);
      deptData.departments?.forEach((dept, index) => {
        console.log(`   ${index + 1}. ${dept.name} (${dept.staffCount} staff)`);
      });
    } else {
      console.log('❌ GET /api/admin/departments - Failed:', deptResponse.status);
    }
    
    // Test 3: Get shifts
    console.log('\n3️⃣ Testing GET /api/admin/shifts');
    const shiftResponse = await fetch('http://localhost:3000/api/admin/shifts', {
      headers: {
        'Authorization': 'Bearer mock-token',
        'Content-Type': 'application/json'
      }
    });
    
    if (shiftResponse.ok) {
      const shiftData = await shiftResponse.json();
      console.log('✅ GET /api/admin/shifts - Success');
      console.log(`⏰ Found ${shiftData.shifts?.length || 0} shifts`);
      shiftData.shifts?.forEach((shift, index) => {
        console.log(`   ${index + 1}. ${shift.name}`);
      });
    } else {
      console.log('❌ GET /api/admin/shifts - Failed:', shiftResponse.status);
    }
    
    // Test 4: Create staff (sample data)
    console.log('\n4️⃣ Testing POST /api/admin/staff');
    const createResponse = await fetch('http://localhost:3000/api/admin/staff', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer mock-token',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        name: 'Test Staff Member',
        email: 'test.staff@company.com',
        password: 'test123',
        role: 'staff',
        department: 'Development',
        shift: 'Morning (9AM-5PM)',
        phone: '+92 300 9999999',
        address: 'Test Address, Karachi',
        cnic: '12345-1234567-1',
        profilePicture: '',
        cv: ''
      })
    });
    
    if (createResponse.ok) {
      const createdStaff = await createResponse.json();
      console.log('✅ POST /api/admin/staff - Success');
      console.log(`👤 Created staff: ${createdStaff.name} (${createdStaff.email})`);
    } else {
      const error = await createResponse.json();
      console.log('❌ POST /api/admin/staff - Failed:', createResponse.status);
      console.log('Error:', error.message);
    }
    
    console.log('\n🎉 Staff Management API Test Complete!');
    console.log('🌐 Ready for frontend integration');
    
  } catch (error) {
    console.error('❌ API Test Failed:', error.message);
    console.log('\n💡 Make sure server is running on http://localhost:3000');
  }
}

// Only run if server is available
testStaffAPI();
