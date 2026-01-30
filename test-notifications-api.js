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
        // Test the notification API
        const notificationOptions = {
          hostname: 'localhost',
          port: 3000,
          path: '/api/hr/notifications',
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        };
        
        const notificationReq = http.request(notificationOptions, (res) => {
          console.log(`\nNotifications Status: ${res.statusCode}`);
          
          let notificationBody = '';
          res.on('data', (chunk) => {
            notificationBody += chunk;
          });
          
          res.on('end', () => {
            console.log(`Notifications Response: ${notificationBody}`);
            
            try {
              const notificationData = JSON.parse(notificationBody);
              console.log('\n=== NOTIFICATION API TEST RESULTS ===');
              console.log('Success:', notificationData.success);
              console.log('Unread Count:', notificationData.unreadCount);
              console.log('Total Count:', notificationData.totalCount);
              console.log('Notifications:', notificationData.notifications?.length || 0);
              
              if (notificationData.notifications && notificationData.notifications.length > 0) {
                console.log('\nSample notifications:');
                notificationData.notifications.slice(0, 3).forEach((n, i) => {
                  console.log(`${i + 1}. [${n.type}] ${n.message} - Read: ${n.read}`);
                });
              }
            } catch (e) {
              console.error('Error parsing notification response:', e);
            }
          });
        });
        
        notificationReq.on('error', (e) => {
          console.error(`Notification request error: ${e.message}`);
        });
        
        notificationReq.end();
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
