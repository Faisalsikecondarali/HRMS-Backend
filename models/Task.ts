import mongoose from 'mongoose';

const taskSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true },
  description: { type: String, required: true, trim: true },
  assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  assignedToName: { type: String, required: true },
  assignedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  assignedByName: { type: String, required: true },
  dueDate: { type: Date, required: true },
  status: { type: String, enum: ['pending', 'in_progress', 'completed', 'overdue'], default: 'pending' },
  priority: { type: String, enum: ['low', 'medium', 'high', 'urgent'], default: 'medium' },
  submissionNote: { type: String, default: null },
  completedAt: { type: Date, default: null },
}, { timestamps: true });

export interface ITask extends mongoose.Document {
  title: string;
  description: string;
  assignedTo: mongoose.Types.ObjectId;
  assignedToName: string;
  assignedBy: mongoose.Types.ObjectId;
  assignedByName: string;
  dueDate: Date;
  status: 'pending' | 'in_progress' | 'completed' | 'overdue';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  submissionNote?: string;
  completedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export const Task = mongoose.model<ITask>('Task', taskSchema);
