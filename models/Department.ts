import mongoose, { Schema, Document } from 'mongoose';

export interface IDepartment extends Document {
  name: string;
  description: string;
  head: string; // Department head name
  headId?: mongoose.Types.ObjectId; // Reference to User who is head
  location: string;
  phone: string;
  email: string;
  staffCount: number; // Auto-calculated
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const DepartmentSchema: Schema = new Schema({
  name: {
    type: String,
    required: [true, 'Department name is required'],
    trim: true,
    unique: true,
    maxlength: [100, 'Department name cannot exceed 100 characters']
  },
  description: {
    type: String,
    required: [true, 'Department description is required'],
    trim: true,
    maxlength: [500, 'Description cannot exceed 500 characters']
  },
  head: {
    type: String,
    required: [true, 'Department head name is required'],
    trim: true,
    maxlength: [100, 'Head name cannot exceed 100 characters']
  },
  headId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  location: {
    type: String,
    required: [true, 'Department location is required'],
    trim: true,
    maxlength: [200, 'Location cannot exceed 200 characters']
  },
  phone: {
    type: String,
    required: [true, 'Department phone is required'],
    trim: true,
    match: [/^[\+]?[1-9][\d]{0,15}$/, 'Please enter a valid phone number']
  },
  email: {
    type: String,
    required: [true, 'Department email is required'],
    trim: true,
    lowercase: true,
    match: [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/, 'Please enter a valid email']
  },
  staffCount: {
    type: Number,
    default: 0,
    min: [0, 'Staff count cannot be negative']
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Index for better query performance
// Note: name field already has unique index, so no need for separate index
DepartmentSchema.index({ isActive: 1 });
DepartmentSchema.index({ headId: 1 });

// Pre-save middleware to update staff count
DepartmentSchema.pre('save', async function(next) {
  if (this.isNew || this.isModified('headId')) {
    try {
      // Count staff in this department
      const User = mongoose.model('User');
      const staffCount = await User.countDocuments({ 
        department: this.name,
        isActive: true 
      });
      this.staffCount = staffCount;
    } catch (error) {
      console.error('Error updating staff count:', error);
    }
  }
  next();
});

// Static method to get all departments with staff count
DepartmentSchema.statics.getDepartmentsWithStaffCount = async function() {
  const User = mongoose.model('User');
  const departments = await this.find({ isActive: true });
  
  const departmentsWithCount = await Promise.all(
    departments.map(async (dept) => {
      const staffCount = await User.countDocuments({ 
        department: dept.name,
        isActive: true 
      });
      return {
        ...dept.toObject(),
        staffCount
      };
    })
  );
  
  return departmentsWithCount;
};

export const Department = mongoose.model<IDepartment>('Department', DepartmentSchema);
