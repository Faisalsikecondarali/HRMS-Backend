import http from 'http';

// First login to get token
const loginOptions = {
  hostname: 'localhost',
  port: 3000,
  path: '/api/auth/login',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  }
};

const loginData = JSON.stringify({
  email: 'hr@company.com',
  password: 'password123'
});

const loginReq = http.request(loginOptions, (res) => {
  console.log(`Login Status: ${res.statusCode}`);
  
  let body = '';
  res.on('data', (chunk) => {
    body += chunk;
  });
  
  res.on('end', () => {
    console.log(`Login Response: ${body}`);
    
    try {
      const loginResponse = JSON.parse(body);
      const token = loginResponse.token;
      
      if (token) {
        // Now test HR dashboard with token
        const dashboardOptions = {
          hostname: 'localhost',
          port: 3000,
          path: '/api/hr/dashboard',
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        };
        
        const dashboardReq = http.request(dashboardOptions, (res) => {
          console.log(`\nDashboard Status: ${res.statusCode}`);
          
          let dashboardBody = '';
          res.on('data', (chunk) => {
            dashboardBody += chunk;
          });
          
          res.on('end', () => {
            console.log(`Dashboard Response: ${dashboardBody}`);
            
            try {
              const dashboardData = JSON.parse(dashboardBody);
              console.log('\n=== HR DASHBOARD ANALYSIS ===');
              console.log('Total Staff:', dashboardData.data?.totalStaff || 0);
              console.log('Active Salary Plans:', dashboardData.data?.activeSalaryPlans || 0);
              console.log('Pending Leave Requests:', dashboardData.data?.pendingLeaveRequests || 0);
              console.log('Late Staff Today:', dashboardData.data?.lateStaffToday || 0);
              console.log('Present Today:', dashboardData.data?.presentToday || 0);
              console.log('Absent Today:', dashboardData.data?.absentToday || 0);
              console.log('Attendance Percentage:', dashboardData.data?.attendancePercentage || 0);
              
              if (dashboardData.data?.staffByDepartment) {
                console.log('\nStaff by Department:');
                dashboardData.data.staffByDepartment.forEach(dept => {
                  console.log(`- ${dept._id}: ${dept.count}`);
                });
              }
            } catch (e) {
              console.error('Error parsing dashboard response:', e);
            }
          });
        });
        
        dashboardReq.on('error', (e) => {
          console.error(`Dashboard request error: ${e.message}`);
        });
        
        dashboardReq.end();
      }
    } catch (e) {
      console.error('Error parsing login response:', e);
    }
  });
});

loginReq.on('error', (e) => {
  console.error(`Login request error: ${e.message}`);
});

loginReq.write(loginData);
loginReq.end();
