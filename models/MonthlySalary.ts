import mongoose from 'mongoose';

const monthlySalarySchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    month: { type: String, required: true }, // YYYY-MM
    totalHours: { type: Number, required: true, min: 0 },
    calculatedSalary: { type: Number, required: true, min: 0 },
    status: { type: String, enum: ['pending', 'approved', 'paid'], default: 'pending' },
    paidDate: { type: Date, default: null },
  },
  { timestamps: true }
);

monthlySalarySchema.index({ userId: 1, month: 1 }, { unique: true });

export interface IMonthlySalary extends mongoose.Document {
  userId: mongoose.Types.ObjectId;
  month: string;
  totalHours: number;
  calculatedSalary: number;
  status: 'pending' | 'approved' | 'paid';
  paidDate: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export const MonthlySalary = mongoose.model<IMonthlySalary>('MonthlySalary', monthlySalarySchema);
