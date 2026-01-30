import fetch from 'node-fetch';

// Define interfaces for type safety
interface LoginResponse {
  user?: {
    role?: string;
    name?: string;
    email?: string;
  };
  token?: string;
  message?: string;
}

const testLoginAPI = async () => {
  console.log('🔍 Testing Login API...');
  
  const testUsers = [
    { email: 'admin@company.com', password: 'admin123', role: 'Admin' },
    { email: 'owner@company.com', password: 'owner123', role: 'Owner' },
    { email: 'hr@company.com', password: 'hr123', role: 'HR' },
    { email: 'ahmed@company.com', password: 'staff123', role: 'Staff' }
  ];

  for (const user of testUsers) {
    console.log(`\n🧪 Testing ${user.role} login...`);
    
    try {
      const response = await fetch('http://localhost:3000/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: user.email, password: user.password })
      });
      
      const data = await response.json() as LoginResponse;
      
      if (response.ok) {
        console.log(`✅ ${user.role} login successful!`);
        console.log(`📧 Email: ${user.email}`);
        console.log(`🎭 Role: ${data.user?.role}`);
        console.log(`👤 Name: ${data.user?.name}`);
        console.log(`🔑 Token: ${data.token?.substring(0, 50)}...`);
      } else {
        console.log(`❌ ${user.role} login failed!`);
        console.log(`📧 Email: ${user.email}`);
        console.log(`🔐 Password: ${user.password}`);
        console.log(`❌ Error: ${data.message}`);
        console.log(`📊 Status: ${response.status}`);
      }
    } catch (error) {
      console.log(`💥 ${user.role} login error:`, error instanceof Error ? error.message : 'Unknown error');
    }
  }
};

testLoginAPI();
