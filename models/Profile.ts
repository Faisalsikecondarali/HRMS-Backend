import mongoose from 'mongoose';

const profileSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', unique: true, required: true },
    avatarUrl: { type: String, required: true },
    phone: { type: String },
    dob: { type: Date },
    joinDate: { type: Date },
    domicile: { type: String },
    position: { type: String },
    cnicNumber: { type: String },
    cnicImageUrl: { type: String },
    cvUrl: { type: String },
    isComplete: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export interface IProfile extends mongoose.Document {
  user: mongoose.Types.ObjectId;
  avatarUrl: string;
  isComplete: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export const Profile = mongoose.model<IProfile>('Profile', profileSchema);
