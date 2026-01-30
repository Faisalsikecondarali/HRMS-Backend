import { EventEmitter } from 'events';
import { Notification } from '../models/Notification';

export interface NotificationEvent {
  userId: string;
  message: string;
  type: string;
  createdAt: string;
}

class Notifier extends EventEmitter {}

export const notifier = new Notifier();

export async function createAndNotify(userId: string, message: string, type: string) {
  const n = await Notification.create({ userId, message, type });
  const evt: NotificationEvent = {
    userId: String(n.userId),
    message: n.message,
    type: n.type,
    createdAt: n.createdAt.toISOString(),
  };
  notifier.emit('notify', evt);
  return n;
}
