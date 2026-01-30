import mongoose from 'mongoose';

const leaveRequestSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  userName: { type: String, required: true },
  date: { type: String, required: true }, // YYYY-MM-DD
  reason: { type: String, required: true },
  status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
  requestedAt: { type: Date, default: () => new Date() },
  reviewedAt: { type: Date, default: null },
}, { timestamps: true });

leaveRequestSchema.index({ userId: 1, date: 1 }, { unique: true });

export interface ILeaveRequest extends mongoose.Document {
  userId: mongoose.Types.ObjectId;
  userName: string;
  date: string;
  reason: string;
  status: 'pending' | 'approved' | 'rejected';
  requestedAt: Date;
  reviewedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export const LeaveRequest = mongoose.model<ILeaveRequest>('LeaveRequest', leaveRequestSchema);
