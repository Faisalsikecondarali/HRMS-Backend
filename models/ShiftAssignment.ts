import mongoose from 'mongoose';

const shiftAssignmentSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    date: { type: String, required: true }, // YYYY-MM-DD
    startTime: { type: String, required: true }, // HH:mm
    endTime: { type: String, required: true },   // HH:mm
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

shiftAssignmentSchema.index({ userId: 1, date: 1 }, { unique: true });

export interface IShiftAssignment extends mongoose.Document {
  userId: mongoose.Types.ObjectId;
  date: string;
  startTime: string;
  endTime: string;
  createdBy?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

export const ShiftAssignment = mongoose.model<IShiftAssignment>('ShiftAssignment', shiftAssignmentSchema);
