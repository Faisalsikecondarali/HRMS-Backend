const mongoose = require('mongoose');

console.log('🌍 Testing MongoDB Atlas Connection');
console.log('===================================');

async function testAtlasMongoDB() {
  try {
    // MongoDB Atlas connection
    const atlasURI = 'mongodb+srv://faisalali:faisal123@cluster0.32vd3j8.mongodb.net/?appName=Cluster0';
    
    console.log('📡 Connecting to MongoDB Atlas...');
    console.log(`URI: mongodb+srv://faisalali:****@cluster0.32vd3j8.mongodb.net/`);
    
    await mongoose.connect(atlasURI);
    console.log('✅ MongoDB Atlas Connected Successfully!');
    
    // Test database operations
    const db = mongoose.connection.db;
    const databases = await db.admin().listDatabases();
    
    console.log(`📊 Available Databases: ${databases.databases.length}`);
    databases.databases.forEach(db => {
      console.log(`  - ${db.name} (${db.sizeOnDisk} bytes)`);
    });
    
    // Test creating a simple document in attendance-system database
    console.log('\n🧪 Testing Document Creation...');
    
    // Switch to attendance-system database
    const attendanceDB = mongoose.connection.useDb('attendance-system');
    
    const TestSchema = new mongoose.Schema({
      name: String,
      timestamp: { type: Date, default: Date.now },
      environment: String
    });
    const TestModel = attendanceDB.model('AtlasTest', TestSchema);
    
    const testDoc = new TestModel({ 
      name: 'MongoDB Atlas Test', 
      environment: 'production'
    });
    await testDoc.save();
    console.log('✅ Test document created in Atlas successfully!');
    
    // Read it back
    const savedDoc = await TestModel.findOne({ name: 'MongoDB Atlas Test' });
    console.log(`📖 Retrieved document: ${savedDoc.name} at ${savedDoc.timestamp}`);
    
    // Clean up
    await TestModel.deleteMany({});
    console.log('🧹 Test document cleaned up from Atlas!');
    
    console.log('\n🎉 MongoDB Atlas is working perfectly!');
    console.log('🚀 Ready for production deployment!');
    
  } catch (error) {
    console.error('❌ MongoDB Atlas Connection Failed:', error.message);
    console.log('\n💡 Possible Issues:');
    console.log('1. Check your internet connection');
    console.log('2. Verify MongoDB Atlas credentials');
    console.log('3. Check IP whitelist in Atlas settings');
    console.log('4. Verify cluster is running');
    
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Disconnected from MongoDB Atlas');
  }
}

testAtlasMongoDB();
