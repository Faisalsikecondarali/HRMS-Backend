import mongoose from 'mongoose';

const attendanceSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  name: {
    type: String,
    required: true
  },
  date: {
    type: String,
    required: true // Format: YYYY-MM-DD
  },
  checkIn: {
    type: Date,
    required: true
  },
  checkOut: {
    type: Date,
    default: null
  },
  totalHours: {
    type: String,
    default: null
  },
  scheduledStart: {
    type: String, // HH:mm
    default: null
  },
  lateMinutes: {
    type: Number,
    default: 0
  },
  status: {
    type: String,
    enum: ['checked-in', 'checked-out', 'on-leave'],
    default: 'checked-in'
  },
  leaveReason: {
    type: String,
    default: null
  }
}, {
  timestamps: true
});

// Create compound index for user and date to prevent duplicate check-ins
attendanceSchema.index({ userId: 1, date: 1 }, { unique: true });

// Calculate total hours when checking out
attendanceSchema.pre('save', function(next) {
  if (this.checkOut && this.checkIn) {
    const diff = this.checkOut.getTime() - this.checkIn.getTime();
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    this.totalHours = `${hours}h ${minutes}m`;
    this.status = 'checked-out';
  }
  next();
});

export interface IAttendance extends mongoose.Document {
  userId: mongoose.Types.ObjectId;
  name: string;
  date: string;
  checkIn: Date;
  checkOut?: Date;
  totalHours?: string;
  scheduledStart?: string | null;
  lateMinutes?: number;
  status: 'checked-in' | 'checked-out' | 'on-leave';
  leaveReason?: string;
  createdAt: Date;
  updatedAt: Date;
}

export const Attendance = mongoose.model<IAttendance>('Attendance', attendanceSchema);
