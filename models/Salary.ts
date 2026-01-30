import mongoose from 'mongoose';

const salarySchema = new mongoose.Schema(
  {
    employeeId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    month: { type: String, required: true },
    amount: { type: Number, required: true, min: 0 },
    status: { type: String, enum: ['pending', 'approved', 'paid', 'received'], default: 'pending' },
    source: { type: String, enum: ['admin', 'staff'], default: 'admin' },
    sentToAccounts: { type: Boolean, default: false },
  },
  { timestamps: true }
);

export interface ISalary extends mongoose.Document {
  employeeId: mongoose.Types.ObjectId;
  month: string;
  amount: number;
  status: 'pending' | 'approved' | 'paid' | 'received';
  source: 'admin' | 'staff';
  sentToAccounts: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export const Salary = mongoose.model<ISalary>('Salary', salarySchema);
