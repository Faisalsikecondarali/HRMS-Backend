import mongoose, { Schema, Types } from 'mongoose';

const chatMessageSchema = new Schema({
  conversationId: { type: Schema.Types.ObjectId, ref: 'ChatConversation', required: true, index: true },
  sender: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  recipient: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  content: { type: String, required: true, trim: true },
  type: { type: String, enum: ['text', 'image', 'file'], default: 'text' },
  readAt: { type: Date, default: null },
}, { timestamps: true });

export interface IChatMessage extends mongoose.Document {
  conversationId: Types.ObjectId;
  sender: Types.ObjectId;
  recipient: Types.ObjectId;
  content: string;
  type: 'text' | 'image' | 'file';
  readAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export const ChatMessage = mongoose.model<IChatMessage>('ChatMessage', chatMessageSchema);
