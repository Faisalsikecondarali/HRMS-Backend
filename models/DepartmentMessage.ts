import mongoose from 'mongoose';

const departmentMessageSchema = new mongoose.Schema({
  groupId: {
    type: String,
    required: true,
    index: true
  },
  department: {
    type: String,
    required: true,
    index: true
  },
  senderId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  senderName: {
    type: String,
    required: true
  },
  message: {
    type: String,
    required: true
  },
  type: {
    type: String,
    enum: ['text', 'image', 'file'],
    default: 'text'
  },
  timestamp: {
    type: Date,
    default: Date.now,
    index: true
  }
}, {
  timestamps: true
});

export interface IDepartmentMessage extends mongoose.Document {
  groupId: string;
  department: string;
  senderId: mongoose.Types.ObjectId;
  senderName: string;
  message: string;
  type: 'text' | 'image' | 'file';
  timestamp: Date;
  createdAt: Date;
  updatedAt: Date;
}

export const DepartmentMessage = mongoose.model<IDepartmentMessage>('DepartmentMessage', departmentMessageSchema);
