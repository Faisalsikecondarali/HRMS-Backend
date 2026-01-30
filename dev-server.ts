import { createServer } from './index';
import http from 'http';
import { initSocket } from './realtime/socket';
import os from 'os';

// Type definition for network interface
interface NetworkInterfaceInfo {
  address: string;
  netmask: string;
  family: string;
  mac: string;
  internal: boolean;
  cidr: string | null;
}

async function main() {
  try {
    const app = await createServer();
    const port = process.env.PORT ? Number(process.env.PORT) : 3000;
    const server = http.createServer(app);
    
    // Initialize Socket.IO
    initSocket(server);
    
    // Get network interfaces for better logging
    const networkInterfaces = os.networkInterfaces();
    
    server.listen(port, '0.0.0.0', () => {
      console.log('\n🚀 ===== Server Started =====');
      console.log(`🌐 Local:            http://localhost:${port}`);
      console.log(`🌐 Network:          http://${getLocalIpAddress()}:${port}`);
      console.log(`🌐 Android Emulator: http://10.0.2.2:${port}`);
      console.log('🚀 ========================\n');
      
      // Log available network interfaces
      console.log('🔌 Available network interfaces:');
      Object.entries(networkInterfaces).forEach(([name, iface]) => {
        if (!iface) return;
        console.log(`   ${name}:`);
        iface.forEach(details => {
          if (details.family === 'IPv4' && !details.internal) {
            console.log(`     http://${details.address}:${port}`);
          }
        });
      });
      console.log('');
    });
    
    // Handle server errors
    server.on('error', (error: NodeJS.ErrnoException) => {
      if (error.syscall !== 'listen') throw error;
      
      switch (error.code) {
        case 'EACCES':
          console.error(`Port ${port} requires elevated privileges`);
          process.exit(1);
        case 'EADDRINUSE':
          console.error(`Port ${port} is already in use`);
          process.exit(1);
        default:
          throw error;
      }
    });
    
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Helper function to get local IP address
function getLocalIpAddress(): string {
  const ifaces = os.networkInterfaces();
  
  for (const iface of Object.values(ifaces)) {
    if (!iface) continue;
    for (const details of iface) {
      if (details.family === 'IPv4' && !details.internal) {
        return details.address;
      }
    }
  }
  
  return '127.0.0.1'; // Fallback to localhost
}

main().catch((err) => {
  console.error('Failed to start dev API server:', err);
  process.exit(1);
});