import mongoose from 'mongoose';

const notificationSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  message: { type: String, required: true },
  type: { 
    type: String, 
    enum: [
      'leave_approved',
      'leave_rejected',
      'leave_request',
      'attendance_edit',
      'task_assigned',
      'task_completed',
      'info',
      'salary_generated',
      'salary_approved',
      'salary_paid',
      'salary_received',
      'salary_requested',
      'salary_issue',
      'chat',
      'department-chat',
      'geofence_alert',
    ],
    default: 'info'
  },
  read: { type: Boolean, default: false },
}, { timestamps: true });

export interface INotification extends mongoose.Document {
  userId: mongoose.Types.ObjectId;
  message: string;
  type:
    | 'leave_approved'
    | 'leave_rejected'
    | 'leave_request'
    | 'attendance_edit'
    | 'task_assigned'
    | 'task_completed'
    | 'info'
    | 'salary_generated'
    | 'salary_approved'
    | 'salary_paid'
    | 'salary_received'
    | 'salary_requested'
    | 'salary_issue'
    | 'chat'
    | 'department-chat'
    | 'geofence_alert';
  read: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export const Notification = mongoose.model<INotification>('Notification', notificationSchema);
