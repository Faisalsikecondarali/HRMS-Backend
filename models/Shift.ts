import mongoose from 'mongoose';

const shiftSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    startTime: { type: String, required: true }, // HH:mm
    endTime: { type: String, required: true },   // HH:mm
    days: { type: [String], default: [] },
    location: { type: String, default: 'Main Office' },
    staffCount: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export interface IShift extends mongoose.Document {
  name: string;
  startTime: string;
  endTime: string;
  days: string[];
  location: string;
  staffCount: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export const Shift = mongoose.model<IShift>('Shift', shiftSchema);
