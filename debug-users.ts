import mongoose from 'mongoose';
import { User } from './models/User.js';

mongoose.connect('mongodb://localhost:27017/staff_management')
  .then(async () => {
    console.log('Connected to MongoDB');
    
    // Find the staff user
    const staff = await User.findOne({ email: 'staff@company.com' });
    if (staff) {
      console.log('Staff user found:');
      console.log('- ID:', staff._id);
      console.log('- Name:', staff.name);
      console.log('- Email:', staff.email);
      console.log('- Role:', staff.role);
      console.log('- Active:', staff.isActive);
      console.log('- Has Password:', !!staff.password);
      console.log('- Password Length:', staff.password?.length);
      
      // Test password comparison
      const isValid = await staff.comparePassword('staff123');
      console.log('- Password "staff123" valid:', isValid);
    } else {
      console.log('Staff user not found');
    }
    
    // List all users
    const allUsers = await User.find({});
    console.log('\nAll users in database:');
    for (const user of allUsers) {
      console.log(`- ${user.name} (${user.email}) - ${user.role} - Active: ${user.isActive}`);
    }
    
    await mongoose.disconnect();
  })
  .catch(console.error);
