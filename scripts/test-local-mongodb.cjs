const mongoose = require('mongoose');

console.log('🔍 Testing Local MongoDB Connection');
console.log('===================================');

async function testLocalMongoDB() {
  try {
    // Local MongoDB connection
    const localURI = 'mongodb://127.0.0.1:27017/attendance-system';
    
    console.log('📡 Connecting to Local MongoDB...');
    console.log(`URI: ${localURI}`);
    
    await mongoose.connect(localURI);
    console.log('✅ Local MongoDB Connected Successfully!');
    
    // Test database operations
    const db = mongoose.connection.db;
    const collections = await db.listCollections().toArray();
    
    console.log(`📊 Database: ${db.databaseName}`);
    console.log(`📁 Collections: ${collections.length}`);
    
    if (collections.length > 0) {
      console.log('Available collections:');
      collections.forEach(col => console.log(`  - ${col.name}`));
    }
    
    // Test creating a simple document
    console.log('\n🧪 Testing Document Creation...');
    const TestSchema = new mongoose.Schema({
      name: String,
      timestamp: { type: Date, default: Date.now }
    });
    const TestModel = mongoose.model('Test', TestSchema);
    
    const testDoc = new TestModel({ name: 'MongoDB Test' });
    await testDoc.save();
    console.log('✅ Test document created successfully!');
    
    // Clean up
    await TestModel.deleteMany({});
    console.log('🧹 Test document cleaned up!');
    
    console.log('\n🎉 Local MongoDB is working perfectly!');
    
  } catch (error) {
    console.error('❌ Local MongoDB Connection Failed:', error.message);
    console.log('\n💡 Solutions:');
    console.log('1. Make sure MongoDB is installed and running');
    console.log('2. Check MongoDB service: mongod');
    console.log('3. Install MongoDB: https://www.mongodb.com/try/download/community');
    console.log('4. Or use MongoDB Atlas (cloud solution)');
    
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Disconnected from MongoDB');
  }
}

testLocalMongoDB();
