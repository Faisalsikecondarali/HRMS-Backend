const mongoose = require('mongoose');

console.log('🚀 Testing Server with MongoDB Atlas');
console.log('===================================');

async function testServerWithAtlas() {
  try {
    // MongoDB Atlas connection
    const atlasURI = 'mongodb+srv://faisalali:faisal123@cluster0.32vd3j8.mongodb.net/attendance-system?appName=Cluster0';
    
    console.log('📡 Connecting to MongoDB Atlas...');
    await mongoose.connect(atlasURI);
    console.log('✅ MongoDB Atlas Connected Successfully!');
    
    // Test basic database operations
    const db = mongoose.connection.db;
    
    // Create a test collection
    const testCollection = db.collection('server-test');
    
    // Insert test document
    const testDoc = {
      message: 'Server Test with Atlas',
      timestamp: new Date(),
      environment: 'production',
      server: 'Staff Management System'
    };
    
    await testCollection.insertOne(testDoc);
    console.log('✅ Test document inserted successfully!');
    
    // Read it back
    const found = await testCollection.findOne({ message: 'Server Test with Atlas' });
    console.log(`📖 Found: ${found.message} at ${found.timestamp}`);
    
    // Clean up
    await testCollection.deleteMany({});
    console.log('🧹 Test data cleaned up!');
    
    console.log('\n🎉 Server is ready with MongoDB Atlas!');
    console.log('🌐 Database: attendance-system');
    console.log('🚀 Ready for production deployment!');
    
    // Show connection info
    console.log('\n📋 Connection Details:');
    console.log(`Host: ${mongoose.connection.host}`);
    console.log(`Port: ${mongoose.connection.port}`);
    console.log(`Database: ${db.databaseName}`);
    
  } catch (error) {
    console.error('❌ Server Test Failed:', error.message);
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Disconnected from MongoDB Atlas');
  }
}

testServerWithAtlas();
