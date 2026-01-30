import { Server as IOServer } from 'socket.io';
import type { Server as HTTPServer } from 'http';
import { verifyToken } from '../utils/jwt';
import { ChatConversation } from '../models/ChatConversation';
import { ChatMessage } from '../models/ChatMessage';
import { DepartmentMessage } from '../models/DepartmentMessage';
import { User } from '../models/User';
import mongoose from 'mongoose';
import { notifier, createAndNotify } from '../utils/notifier';

export interface SocketUser {
  userId: string;
  role: string;
}

export function initSocket(httpServer: HTTPServer) {
  const io = new IOServer(httpServer, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST']
    }
  });

  // Bridge existing notifier events to user sockets
  notifier.on('notify', (evt: any) => {
    if (evt?.userId) {
      io.to(`user:${evt.userId}`).emit('notify', evt);
    }
  });

  io.use((socket, next) => {
    try {
      const token = socket.handshake.auth?.token || (socket.handshake.headers['authorization']?.toString().split(' ')[1]);
      if (!token) return next(new Error('Unauthorized'));
      const payload = verifyToken(token);
      // @ts-ignore
      socket.user = { userId: payload.userId, role: payload.role } as SocketUser;
      return next();
    } catch (e) {
      return next(new Error('Unauthorized'));
    }
  });

  io.on('connection', (socket) => {
    const user = (socket as any).user as SocketUser;
    const userRoom = `user:${user.userId}`;
    socket.join(userRoom);
    io.to(userRoom).emit('connected', { ok: true });

    // Join staff into their department room for realtime department chat
    (async () => {
      try {
        const dbUser = await User.findById(user.userId).select('department role').lean();
        const department = dbUser?.department;
        const role = (dbUser?.role || user.role || '').toString();
        if (role === 'staff' && department && department.toString().trim().length > 0) {
          const groupId = `dept-${department.toString().toLowerCase().replace(/\s+/g, '-')}`;
          socket.join(`dept:${groupId}`);
          socket.emit('department_joined', { groupId, department });
        }
      } catch {
        // ignore
      }
    })();

    // Allow admin/hr to join a department room explicitly
    socket.on('join_department', async (data: { department?: string; groupId?: string }) => {
      try {
        if (!['admin', 'hr', 'owner'].includes(user.role)) return;
        const groupId = data?.groupId
          ? data.groupId
          : data?.department
              ? `dept-${data.department.toString().toLowerCase().replace(/\s+/g, '-')}`
              : null;
        if (!groupId) return;
        socket.join(`dept:${groupId}`);
        socket.emit('department_joined', { groupId });
      } catch {
        // ignore
      }
    });

    socket.on('typing', (data: { to: string; conversationId?: string; typing: boolean }) => {
      if (!data?.to) return;
      io.to(`user:${data.to}`).emit('typing', { from: user.userId, typing: !!data.typing, conversationId: data.conversationId });
    });

    socket.on('read_receipt', async (data: { conversationId: string }) => {
      try {
        if (!data?.conversationId || !mongoose.isValidObjectId(data.conversationId)) return;
        await ChatMessage.updateMany({ conversationId: data.conversationId, recipient: user.userId, readAt: null }, { $set: { readAt: new Date() } });
        io.to(userRoom).emit('read_receipt_ack', { conversationId: data.conversationId });
      } catch {}
    });

    socket.on('send_message', async (data: { conversationId?: string; to: string; content: string }) => {
      try {
        console.log('📨 Received send_message event:', data);
        const { to, content } = data;
        if (!to || !content?.trim()) {
          console.log('❌ Invalid message data:', { to, content });
          return;
        }
        let conversationId = data.conversationId;

        if (!conversationId) {
          const participants = [new mongoose.Types.ObjectId(user.userId), new mongoose.Types.ObjectId(to)].sort((a, b) => a.toString().localeCompare(b.toString()));
          let convo = await ChatConversation.findOne({ participants: { $all: participants, $size: 2 } });
          if (!convo) {
            convo = await ChatConversation.create({ participants });
          }
          conversationId = convo._id.toString();
        }

        if (!mongoose.isValidObjectId(conversationId)) {
          console.log('❌ Invalid conversation ID:', conversationId);
          return;
        }

        const msg = await ChatMessage.create({
          conversationId,
          sender: user.userId,
          recipient: to,
          content: content.trim(),
          type: 'text',
        });
        await ChatConversation.findByIdAndUpdate(conversationId, { $set: { lastMessageAt: new Date() } });

        try {
          await createAndNotify(to, 'New chat message received', 'chat');
        } catch {}

        const payload = {
          _id: msg._id,
          conversationId,
          sender: user.userId,
          recipient: to,
          content: msg.content,
          type: msg.type,
          createdAt: msg.createdAt,
          readAt: msg.readAt,
        };

        console.log('📤 Emitting message to recipients:', {
          to: `user:${to}`,
          from: userRoom,
          payload: payload
        });

        io.to(`user:${to}`).emit('message', payload);
        io.to(userRoom).emit('message', payload);
      } catch (e) {
        console.error('❌ Error sending message:', e);
        socket.emit('error_message', { message: 'Failed to send message' });
      }
    });

    socket.on(
      'send_department_message',
      async (data: { message: string; type?: string; targetDepartment?: string }) => {
        try {
          const message = data?.message?.toString().trim();
          const type = (data?.type?.toString() || 'text') as string;
          if (!message) return;

          const dbUser = await User.findById(user.userId).select('department role name').lean();
          if (!dbUser) return;

          let department = dbUser.department?.toString();
          const role = (dbUser.role || user.role || '').toString();
          const senderName = (dbUser as any).name?.toString() || 'Staff Member';

          // Admin/HR can optionally choose targetDepartment; staff cannot
          if (data?.targetDepartment && ['admin', 'hr', 'owner'].includes(role)) {
            department = data.targetDepartment.toString();
          }

          if (!department || department.trim().length === 0) return;
          const groupId = `dept-${department.toLowerCase().replace(/\s+/g, '-')}`;

          const newMessage = await DepartmentMessage.create({
            groupId,
            department,
            senderId: new mongoose.Types.ObjectId(user.userId),
            senderName,
            message,
            type,
            timestamp: new Date(),
          });

          const payload = {
            id: newMessage._id.toString(),
            senderId: user.userId,
            senderName,
            message,
            timestamp: newMessage.timestamp.toISOString(),
            type,
            groupId,
            department,
          };

          io.to(`dept:${groupId}`).emit('department_message', payload);
        } catch (e) {
          console.error('❌ Error sending department message:', e);
          socket.emit('error_message', { message: 'Failed to send department message' });
        }
      }
    );

    socket.on('end_conversation', async (data: { conversationId: string; to: string }) => {
      try {
        if (user.role !== 'admin') return;
        const { conversationId, to } = data;
        if (!conversationId || !mongoose.isValidObjectId(conversationId)) return;

        await ChatMessage.deleteMany({ conversationId });
        await ChatConversation.findByIdAndDelete(conversationId);

        const payload = { conversationId };
        io.to(`user:${to}`).emit('conversation_ended', payload);
        io.to(userRoom).emit('conversation_ended', payload);
      } catch {
        // silently ignore
      }
    });

    socket.on('disconnect', () => {
      // Optionally handle presence
    });
  });

  return io;
}
