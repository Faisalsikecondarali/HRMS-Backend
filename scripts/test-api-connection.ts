import fetch from 'node-fetch';

// Define flexible interfaces for type safety
interface LoginResponse {
  token?: string;
  user?: {
    id?: string;
    name?: string;
    email?: string;
    role?: string;
  };
}

interface DashboardStats {
  totalStaff?: number;
  activeStaff?: number;
  totalDepartments?: number;
  pendingTasks?: number;
  todayAttendance?: number;
  activeSessions?: number;
  systemHealth?: number;
  databaseStatus?: string;
  apiResponseTime?: number;
  systemUptime?: string;
  timestamp?: string;
}

interface TasksResponse {
  tasks?: Array<{
    id?: string;
    title?: string;
    description?: string;
    status?: string;
    priority?: string;
    assignedToName?: string;
    dueDate?: string;
  }>;
}

const testAPIConnection = async () => {
  try {
    console.log('🔍 Testing API Connection...');
    
    // Test 1: Basic server connection
    console.log('\n1️⃣ Testing server connection...');
    const response1 = await fetch('http://localhost:3000/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@company.com', password: 'admin123' })
    });
    
    if (response1.ok) {
      const data = await response1.json() as LoginResponse;
      console.log('✅ Server connection successful');
      console.log('🔑 Token received:', data.token ? 'Yes' : 'No');
      
      if (!data.token) {
        console.log('❌ No token in response');
        return;
      }
      
      // Test 2: Dashboard API with token
      console.log('\n2️⃣ Testing dashboard API...');
      const response2 = await fetch('http://localhost:3000/api/admin/dashboard/stats', {
        headers: {
          'Authorization': `Bearer ${data.token}`,
          'Content-Type': 'application/json'
        }
      });
      
      if (response2.ok) {
        const stats = await response2.json() as DashboardStats;
        console.log('✅ Dashboard API successful');
        console.log('📊 Stats:', stats);
      } else {
        console.log('❌ Dashboard API failed:', response2.status);
        const error = await response2.text();
        console.log('Error:', error);
      }
      
      // Test 3: Tasks API
      console.log('\n3️⃣ Testing tasks API...');
      const response3 = await fetch('http://localhost:3000/api/admin/tasks', {
        headers: {
          'Authorization': `Bearer ${data.token}`,
          'Content-Type': 'application/json'
        }
      });
      
      if (response3.ok) {
        const tasksData = await response3.json() as TasksResponse;
        console.log('✅ Tasks API successful');
        console.log('📋 Tasks count:', tasksData.tasks?.length || 0);
      } else {
        console.log('❌ Tasks API failed:', response3.status);
        const error = await response3.text();
        console.log('Error:', error);
      }
      
    } else {
      console.log('❌ Server connection failed:', response1.status);
      const error = await response1.text();
      console.log('Error:', error);
    }
    
  } catch (error) {
    console.error('❌ API Connection Error:', error instanceof Error ? error.message : 'Unknown error');
  }
};

testAPIConnection();
