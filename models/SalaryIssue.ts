import mongoose from 'mongoose';

const salaryIssueSchema = new mongoose.Schema(
  {
    salaryId: { type: mongoose.Schema.Types.ObjectId, ref: 'Salary', required: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    message: { type: String, required: true },
    resolved: { type: Boolean, default: false },
  },
  { timestamps: true }
);

export interface ISalaryIssue extends mongoose.Document {
  salaryId: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  message: string;
  resolved: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export const SalaryIssue = mongoose.model<ISalaryIssue>('SalaryIssue', salaryIssueSchema);
