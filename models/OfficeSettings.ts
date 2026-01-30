import mongoose from 'mongoose';

const officeSettingsSchema = new mongoose.Schema(
  {
    officeLat: { type: Number, required: true },
    officeLng: { type: Number, required: true },
    radiusMeters: { type: Number, required: true, default: 60 },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
);

export interface IOfficeSettings extends mongoose.Document {
  officeLat: number;
  officeLng: number;
  radiusMeters: number;
  updatedBy: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

export const OfficeSettings = mongoose.model<IOfficeSettings>('OfficeSettings', officeSettingsSchema);
