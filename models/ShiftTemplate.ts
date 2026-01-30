import mongoose from 'mongoose';

const shiftTemplateSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    startTime: { type: String, required: true }, // HH:mm (24h)
    endTime: { type: String, required: true },   // HH:mm (24h)
    daysOfWeek: { type: [Number], default: [1,2,3,4,5] }, // 0-6 (Sun-Sat)
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export interface IShiftTemplate extends mongoose.Document {
  name: string;
  startTime: string; // HH:mm
  endTime: string;   // HH:mm
  daysOfWeek: number[];
  active: boolean;
}

export const ShiftTemplate = mongoose.model<IShiftTemplate>('ShiftTemplate', shiftTemplateSchema);
