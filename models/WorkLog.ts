import mongoose from 'mongoose';

const workLogSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    date: { type: String, required: true }, // YYYY-MM-DD
    hoursWorked: { type: Number, required: true, min: 0 },
    note: { type: String, default: '' },
  },
  { timestamps: true }
);

workLogSchema.index({ userId: 1, date: 1 });

export interface IWorkLog extends mongoose.Document {
  userId: mongoose.Types.ObjectId;
  date: string;
  hoursWorked: number;
  note?: string;
  createdAt: Date;
  updatedAt: Date;
}

export const WorkLog = mongoose.model<IWorkLog>('WorkLog', workLogSchema);
