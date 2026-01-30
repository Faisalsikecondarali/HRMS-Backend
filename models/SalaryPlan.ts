import mongoose from 'mongoose';

const salaryPlanSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    hourlyRate: { type: Number, required: true, min: 0 }, // PKR per hour
    overtimeRate: { type: Number, default: 1.5 }, // Overtime multiplier (1.5x by default)
    extraHourRate: { type: Number, default: 0 }, // Extra hours payment rate (PKR per hour)
    latePenaltyPerMinute: { type: Number, default: 5 }, // PKR penalty per minute for late arrival
    designation: { type: String, default: '' },
    monthlyTargetHours: { type: Number, default: 160 }, // Fixed 160 hours per month
    status: { type: String, enum: ['active', 'inactive'], default: 'active' },
  },
  { timestamps: true }
);

export interface ISalaryPlan extends mongoose.Document {
  userId: mongoose.Types.ObjectId;
  hourlyRate: number;
  overtimeRate: number;
  extraHourRate: number;
  latePenaltyPerMinute: number;
  designation?: string;
  monthlyTargetHours?: number;
  status: 'active' | 'inactive';
  createdAt: Date;
  updatedAt: Date;
}

export const SalaryPlan = mongoose.model<ISalaryPlan>('SalaryPlan', salaryPlanSchema);
