import mongoose, { Document, Schema } from 'mongoose';

export type AttendanceCorrectionStatus = 'new' | 'in-progress' | 'resolved' | 'rejected';

export interface AttendanceCorrectionReportDocument extends Document {
  userId: mongoose.Types.ObjectId;
  date: string; // YYYY-MM-DD
  subject: string;
  details: string;
  status: AttendanceCorrectionStatus;
  originalTime?: string;
  requestedTime?: string;
  correctedTime?: string;
  createdAt: Date;
  updatedAt: Date;
}

const AttendanceCorrectionReportSchema = new Schema<AttendanceCorrectionReportDocument>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    date: { type: String, required: true },
    subject: { type: String, required: true },
    details: { type: String, required: true },
    status: {
      type: String,
      enum: ['new', 'in-progress', 'resolved', 'rejected'],
      default: 'new',
    },
    originalTime: { type: String },
    requestedTime: { type: String },
    correctedTime: { type: String },
  },
  { timestamps: true }
);

export const AttendanceCorrectionReport = mongoose.model<AttendanceCorrectionReportDocument>(
  'AttendanceCorrectionReport',
  AttendanceCorrectionReportSchema
);
