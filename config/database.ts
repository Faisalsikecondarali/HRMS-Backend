import mongoose from 'mongoose';

const connectDB = async (): Promise<void> => {
  try {
    const mongoURI = process.env.MONGODB_URI || 'mongodb://localhost:27017/attendance-system';

    await mongoose.connect(mongoURI);

    console.log('✅ MongoDB connected successfully');
  } catch (error) {
    console.error('❌ MongoDB connection error:', error);
    console.log('⚠️  Running in development mode without database');
    console.log('📝 To fix this:');
    console.log('   1. Set up MongoDB Atlas (free tier): https://www.mongodb.com/atlas');
    console.log('   2. Update MONGODB_URI environment variable');
    console.log('   3. Or install MongoDB locally');

    // Don't exit in development, let the app run without DB for UI testing
    if (process.env.NODE_ENV === 'production') {
      process.exit(1);
    }
  }
};

export default connectDB;
