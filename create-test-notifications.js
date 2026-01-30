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
        // Create test notifications
        const testNotifications = [
          {
            type: 'leave_request',
            message: 'New leave request from John Doe for Sick Leave - Feeling unwell with fever'
          },
          {
            type: 'attendance_edit',
            message: 'New attendance edit request from Jane Smith - Wrong check-in time recorded'
          },
          {
            type: 'task_completed',
            message: 'Task completed: Monthly Report submitted by Mike Johnson'
          },
          {
            type: 'salary_generated',
            message: 'Salary generated for December 2024 - 6 staff members processed'
          },
          {
            type: 'system',
            message: 'System maintenance scheduled for tonight at 11:00 PM'
          }
        ];
        
        testNotifications.forEach((notification, index) => {
          setTimeout(() => {
            const createOptions = {
              hostname: 'localhost',
              port: 3000,
              path: '/api/notifications/create',
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
              }
            };
            
            const createReq = http.request(createOptions, (res) => {
              console.log(`Create notification ${index + 1} status: ${res.statusCode}`);
              
              let createBody = '';
              res.on('data', (chunk) => {
                createBody += chunk;
              });
              
              res.on('end', () => {
                console.log(`Create notification ${index + 1} response: ${createBody}`);
              });
            });
            
            createReq.on('error', (e) => {
              console.error(`Create notification ${index + 1} error: ${e.message}`);
            });
            
            createReq.write(JSON.stringify(notification));
            createReq.end();
          }, index * 200); // Stagger requests by 200ms
        });
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
