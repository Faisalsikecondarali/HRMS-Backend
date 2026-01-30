import mongoose from 'mongoose';

const liveLocationSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    lat: { type: Number, required: true },
    lng: { type: Number, required: true },
    distanceMeters: { type: Number, required: true },
    outside: { type: Boolean, required: true },
    lastPing: { type: Date, default: () => new Date() },
  },
  { timestamps: true }
);

export interface ILiveLocation extends mongoose.Document {
  userId: mongoose.Types.ObjectId;
  lat: number;
  lng: number;
  distanceMeters: number;
  outside: boolean;
  lastPing: Date;
  createdAt: Date;
  updatedAt: Date;
}

export const LiveLocation = mongoose.model<ILiveLocation>('LiveLocation', liveLocationSchema);
