const { spawn } = require('child_process');
const path = require('path');

console.log('🚀 Starting Server with MongoDB Atlas');
console.log('=====================================');

// Set environment variable for Atlas
process.env.MONGODB_URI = 'mongodb+srv://faisalali:faisal123@cluster0.32vd3j8.mongodb.net/attendance-system?appName=Cluster0';

console.log('📡 MongoDB Atlas URI Set');
console.log('🌐 Database: attendance-system');
console.log('🚀 Starting server...');

// Start the server
const server = spawn('npm', ['run', 'dev'], {
  stdio: 'inherit',
  shell: true,
  env: { ...process.env }
});

server.on('error', (error) => {
  console.error('❌ Failed to start server:', error.message);
});

server.on('close', (code) => {
  console.log(`\n📋 Server exited with code: ${code}`);
});

// Handle process termination
process.on('SIGINT', () => {
  console.log('\n🛑 Shutting down server...');
  server.kill('SIGINT');
});

console.log('\n📝 Server Commands:');
console.log('🌐 Open: http://localhost:8080');
console.log('👤 Admin Login: admin@company.com / admin123');
console.log('👥 Staff Login: staff@company.com / staff123');
console.log('\n⏹️  Press Ctrl+C to stop the server');
