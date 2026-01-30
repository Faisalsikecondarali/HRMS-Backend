const mongoose = require('mongoose');

const MONGODB_URI = 'mongodb+srv://portfolioforupwork_db_user:gfce2pTVw9IVcqLY@cluster0.nuho6mj.mongodb.net/attendance-system?appName=Cluster0';

async function testConnection() {
  console.log('🔍 Testing MongoDB Atlas connection...');
  console.log('URI:', MONGODB_URI.replace(/Faisal786[^@]+/, 'Faisal786***'));
  
  try {
    const conn = await mongoose.connect(MONGODB_URI);
    console.log('✅ MongoDB Atlas connected successfully!');
    console.log('📍 Host:', conn.connection.host);
    console.log('🗄️  Database:', conn.connection.name);
    
    // Test database operations
    const collections = await conn.connection.db.listCollections().toArray();
    console.log('📋 Collections:', collections.map(c => c.name));
    
    // Check users count
    const User = require('./models/User');
    const userCount = await User.countDocuments();
    console.log('👥 Users in database:', userCount);
    
    await mongoose.disconnect();
    console.log('🔌 Disconnected successfully');
    
  } catch (error) {
    console.error('❌ Connection failed:', error.message);
    process.exit(1);
  }
}

testConnection();
