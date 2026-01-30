import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { Profile } from './Profile';

const userSchema = new mongoose.Schema({
  employeeId: {
    type: String,
    unique: true,
    required: true,
    default: () => `EMP${Date.now()}${Math.random().toString(36).slice(2, 6).toUpperCase()}`
  },
  name: {
    type: String,
    required: true,
    trim: true
  },
  email: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    lowercase: true
  },
  password: {
    type: String,
    required: true,
    minlength: 6
  },
  role: {
    type: String,
    enum: ['staff', 'hr', 'admin', 'owner'],
    default: 'staff'
  },
  department: {
    type: String,
    required: false, // Made optional
    trim: true,
    default: 'General'
  },
  shift: {
    type: String,
    trim: true
  },
  phone: {
    type: String,
    required: false, // Made optional
    trim: true,
    default: ''
  },
  address: {
    type: String,
    required: false, // Made optional
    trim: true,
    default: ''
  },
  cnic: {
    type: String,
    required: false, // Made optional
    trim: true,
    match: [/^[0-9]{5}-[0-9]{7}-[0-9]$/, 'Please enter a valid CNIC format (12345-1234567-1)'],
    default: ''
  },
  profilePicture: {
    type: String,
    trim: true
  },
  cv: {
    type: String,
    trim: true
  },
  lastLogin: {
    type: Date,
    default: null
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

// Hash password before saving
userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  
  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error as Error);
  }
});

// Ensure employeeId exists before saving (for legacy docs)
userSchema.pre('save', function(next) {
  if (!this.employeeId) {
    this.employeeId = `EMP${Date.now()}${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
  }
  next();
});

// Auto-create profile after user is saved
userSchema.post('save', async function(doc, next) {
  try {
    const existing = await Profile.findOne({ user: doc._id });
    if (!existing) {
      const seed = encodeURIComponent(doc.name || doc.email || String(doc._id));
      const avatarUrl = `https://api.dicebear.com/7.x/initials/svg?seed=${seed}`;
      await Profile.create({ user: doc._id, avatarUrl, isComplete: true });
    }
    next();
  } catch (err) {
    next(err as Error);
  }
});

// Compare password method
userSchema.methods.comparePassword = async function(candidatePassword: string): Promise<boolean> {
  return bcrypt.compare(candidatePassword, this.password);
};

export interface IUser extends mongoose.Document {
  employeeId: string;
  name: string;
  email: string;
  password: string;
  role: 'staff' | 'hr' | 'admin' | 'owner';
  department: string;
  shift?: string;
  phone?: string;
  address?: string;
  cnic?: string;
  isActive: boolean;
  comparePassword(candidatePassword: string): Promise<boolean>;
  createdAt: Date;
  updatedAt: Date;
}

export const User = mongoose.model<IUser>('User', userSchema);
