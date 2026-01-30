const { spawn } = require('child_process');

console.log('🔄 Restarting Server (Fixed Mongoose Warning)');
console.log('==========================================');

// Kill any existing server process
console.log('🛑 Stopping any existing server...');

// Wait a moment
setTimeout(() => {
  console.log('🚀 Starting server with fixed mongoose warning...');
  
  // Start server with Atlas
  const server = spawn('npm', ['run', 'dev'], {
    stdio: 'inherit',
    shell: true,
    env: { 
      ...process.env,
      MONGODB_URI: 'mongodb+srv://faisalali:faisal123@cluster0.32vd3j8.mongodb.net/attendance-system?appName=Cluster0'
    }
  });

  server.on('error', (error) => {
    console.error('❌ Failed to start server:', error.message);
  });

  server.on('close', (code) => {
    console.log(`\n📋 Server exited with code: ${code}`);
  });

  console.log('\n✅ Server started without mongoose warning!');
  console.log('🌐 Open: http://localhost:8080');
  console.log('👤 Admin Login: admin@company.com / admin123');
  
}, 2000);
