import mongoose, { Schema, Types } from 'mongoose';

const chatConversationSchema = new Schema({
  participants: [{ type: Schema.Types.ObjectId, ref: 'User', required: true }],
  lastMessageAt: { type: Date, default: Date.now },
}, { timestamps: true });

chatConversationSchema.index({ participants: 1 });

export interface IChatConversation extends mongoose.Document {
  participants: Types.ObjectId[];
  lastMessageAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

export const ChatConversation = mongoose.model<IChatConversation>('ChatConversation', chatConversationSchema);
