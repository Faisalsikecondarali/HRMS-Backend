import fetch from 'node-fetch';

const testAuth = async () => {
  try {
    console.log('🔐 Testing Authentication Flow...');
    
    // Step 1: Login with admin credentials
    console.log('\n1️⃣ Logging in with admin credentials...');
    const loginResponse = await fetch('http://localhost:3000/api/auth/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        email: 'admin@test.com',
        password: 'admin123'
      })
    });

    if (!loginResponse.ok) {
      console.error('❌ Login failed:', await loginResponse.text());
      return;
    }

    const loginData = await loginResponse.json();
    console.log('✅ Login successful!');
    console.log('📋 Token received:', loginData.token ? 'Yes' : 'No');
    console.log('👤 User info:', loginData.user);

    // Step 2: Test task creation with the token
    console.log('\n2️⃣ Testing task creation with token...');
    
    const taskResponse = await fetch('http://localhost:3000/api/admin/tasks', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${loginData.token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        title: 'Test Task from Script',
        description: 'This is a test task to verify authentication works',
        assignedTo: '673f8f5e8a1b2c3d4e5f6a7b', // Test staff ID (will be updated)
        priority: 'high',
        dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
      })
    });

    console.log('📊 Task creation response status:', taskResponse.status);
    const taskData = await taskResponse.text();
    console.log('📋 Task creation response:', taskData);

    if (taskResponse.ok) {
      console.log('✅ Task creation successful!');
    } else {
      console.log('❌ Task creation failed');
    }

  } catch (error) {
    console.error('❌ Test failed:', error);
  }
};

testAuth();
