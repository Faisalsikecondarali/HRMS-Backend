import connectDB from '../config/database';
import { User } from '../models/User';
import { Attendance } from '../models/Attendance';

async function reset() {
  try {
    await connectDB();

    const ADMIN_EMAIL = 'admin@company.com';
    const ADMIN_PASSWORD = 'admin123';

    console.log('🗑️  Clearing attendance data...');
    await Attendance.deleteMany({});

    console.log('👤 Ensuring single admin exists...');
    let admin = await User.findOne({ email: ADMIN_EMAIL });

    if (!admin) {
      admin = new User({
        name: 'Admin User',
        email: ADMIN_EMAIL,
        password: ADMIN_PASSWORD,
        role: 'admin',
        isActive: true,
      });
      await admin.save();
      console.log('✅ Created admin account:', ADMIN_EMAIL);
    } else {
      // Update admin to ensure known password and status
      admin.name = admin.name || 'Admin User';
      admin.role = 'admin';
      admin.isActive = true;
      if (!admin.employeeId) {
        igger pre-save to assign employeeId
        admin.employeeId = undefined as unknown as string;
      }
      // Reset password
      admin.password = ADMIN_PASSWORD;
      await admin.save();
      console.log('✅ Reset admin account password and status:', ADMIN_EMAIL);
    }

    console.log('🗑️  Removing all non-admin users...');
    await User.deleteMany({ _id: { $ne: admin._id } });

    console.log('✅ Database reset complete.');
    console.log('   Admin login ->', ADMIN_EMAIL, '/', ADMIN_PASSWORD);

    process.exit(0);
  } catch (err) {
    console.error('❌ Reset failed:', err);
    process.exit(1);
  }
}

reset();
