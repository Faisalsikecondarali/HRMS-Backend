import { Router } from 'express';
import mongoose from 'mongoose';
import { authenticateToken, requireRole, AuthRequest } from '../middleware/auth';
import { User } from '../models/User';
import { ChatConversation } from '../models/ChatConversation';
import { ChatMessage } from '../models/ChatMessage';
import { DepartmentMessage } from '../models/DepartmentMessage';
import { createAndNotify } from '../utils/notifier';
import { upload } from '../utils/upload';

const router = Router();

router.get('/staff', authenticateToken, requireRole(['admin']), async (req: AuthRequest, res: Response) => {
  try {
    const users = await User.find({ role: 'staff', isActive: true })
      .select('_id name email role profilePicture department')
      .lean();
    const profileEntries = await Profile.find({ user: { $in: users.map((u) => u._id) } })
      .lean();

    const profileMap = new Map(profileEntries.map(p => [p.user.toString(), p]));

    const enriched = users.map(user => {
      const profilePicture = user.profilePicture;
      const fullAvatarUrl = profilePicture ? `${req.protocol}://${req.get('host')}/uploads/${profilePicture.split('/').pop()}` : null;
      
      return {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        profilePicture: fullAvatarUrl,
        avatarUrl: fullAvatarUrl, // Add avatarUrl for frontend compatibility
        department: user.department || profileMap.get(user._id.toString())?.department || 'General',
        phone: profileMap.get(user._id.toString())?.phone,
        address: profileMap.get(user._id.toString())?.address,
        cnic: profileMap.get(user._id.toString())?.cnic,
      };
    });
    res.json({ users: enriched });
  } catch (error) {
    console.error('Fetch staff chat list failed:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get all users for admin/HR/owner (for individual messaging list)
router.get('/all-users', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const myRole = req.user!.role;
    
    // Only admin, HR, and owner can access this endpoint
    if (!['admin', 'hr', 'owner'].includes(myRole)) {
      return res.status(403).json({ message: 'Insufficient permissions' });
    }

    const users = await User.find({ 
      _id: { $ne: req.user!.userId },
      isActive: true 
    }).select('_id name email role department avatar')
     .sort({ role: 1, name: 1 }); // Sort by role then name

    res.json({ users });
  } catch (err) {
    console.error('List all users error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get chatable users based on role
router.get('/admins', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const myRole = req.user!.role;
    let users = [];

    // Admin and HR can message everyone except themselves
    if (myRole === 'admin' || myRole === 'hr') {
      users = await User.find({ 
        _id: { $ne: req.user!.userId },
        isActive: true 
      }).select('_id name email role department profilePicture avatar');
    }
    // Owner can message everyone except themselves
    else if (myRole === 'owner') {
      users = await User.find({ 
        _id: { $ne: req.user!.userId },
        isActive: true 
      }).select('_id name email role department profilePicture avatar');
    }
    // Staff can only message admin and HR users
    else if (myRole === 'staff') {
      users = await User.find({ 
        _id: { $ne: req.user!.userId },
        role: { $in: ['admin', 'hr'] },
        isActive: true 
      }).select('_id name email role department profilePicture avatar');
    }

    // Add avatarUrl field for frontend compatibility with full URLs
    const usersWithAvatars = users.map(user => {
      const profilePicture = user.profilePicture || user.avatar;
      const fullAvatarUrl = profilePicture ? `${req.protocol}://${req.get('host')}/uploads/${profilePicture.split('/').pop()}` : null;
      
      return {
        ...user.toObject(),
        id: user._id,
        avatarUrl: fullAvatarUrl, // Use full URL
        profilePicture: fullAvatarUrl // Use full URL
      };
    });

    res.json({ users: usersWithAvatars });
  } catch (err) {
    console.error('List chatable users error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

router.post('/conversation', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const { participantId } = req.body as { participantId: string };
    if (!participantId || !mongoose.isValidObjectId(participantId)) {
      return res.status(400).json({ message: 'Invalid participantId' });
    }
    const me = req.user!.userId;
    const myRole = req.user!.role;

    // Get both users
    const [myUser, otherUser] = await Promise.all([
      User.findById(me),
      User.findById(participantId)
    ]);

    if (!myUser || !otherUser) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Role-based messaging permissions
    const canMessage = () => {
      // Admin and HR can message anyone
      if (myRole === 'admin' || myRole === 'hr') {
        return true;
      }
      
      // Owner can message anyone
      if (myRole === 'owner') {
        return true;
      }
      
      // Staff can only message admin and HR
      if (myRole === 'staff') {
        return otherUser.role === 'admin' || otherUser.role === 'hr';
      }
      
      return false;
    };

    if (!canMessage()) {
      return res.status(403).json({ 
        message: 'Insufficient permissions. Staff can only message admin and HR users.' 
      });
    }

    const participants = [new mongoose.Types.ObjectId(me), new mongoose.Types.ObjectId(participantId)].sort((a, b) => a.toString().localeCompare(b.toString()));

    let convo = await ChatConversation.findOne({ participants: { $all: participants, $size: 2 } });
    if (!convo) {
      convo = await ChatConversation.create({ participants });
    }

    res.json({ conversation: { id: convo._id } });
  } catch {
    res.status(500).json({ message: 'Server error' });
  }
});

router.get('/history/:conversationId', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const { conversationId } = req.params;
    if (!mongoose.isValidObjectId(conversationId)) {
      return res.status(400).json({ message: 'Invalid conversationId' });
    }
    const convo = await ChatConversation.findById(conversationId);
    if (!convo) return res.status(404).json({ message: 'Conversation not found' });

    const isParticipant = convo.participants.some(p => p.toString() === req.user!.userId);
    if (!isParticipant) return res.status(403).json({ message: 'Forbidden' });

    const messages = await ChatMessage.find({ conversationId }).sort({ createdAt: 1 });
    res.json({ messages });
  } catch {
    res.status(500).json({ message: 'Server error' });
  }
});

router.post('/upload', authenticateToken, upload.single('file'), async (req: AuthRequest, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'File is required' });
    }

    const { conversationId: rawConversationId, to } = req.body as { conversationId?: string; to?: string };
    let conversationId = rawConversationId;

    if (!conversationId && !to) {
      return res.status(400).json({ message: 'conversationId or to is required' });
    }

    const me = req.user!.userId;

    if (!conversationId && to) {
      if (!mongoose.isValidObjectId(to)) {
        return res.status(400).json({ message: 'Invalid recipient' });
      }

      if (req.user!.role !== 'admin' && req.user!.userId !== to) {
        const other = await User.findById(to);
        if (!other || other.role !== 'admin') {
          return res.status(403).json({ message: 'Insufficient permissions' });
        }
      }

      const participants = [new mongoose.Types.ObjectId(me), new mongoose.Types.ObjectId(to)].sort((a, b) => a.toString().localeCompare(b.toString()));
      let convo = await ChatConversation.findOne({ participants: { $all: participants, $size: 2 } });
      if (!convo) {
        convo = await ChatConversation.create({ participants });
      }
      conversationId = convo._id.toString();
    }

    if (!conversationId || !mongoose.isValidObjectId(conversationId)) {
      return res.status(400).json({ message: 'Invalid conversationId' });
    }

    const convo = await ChatConversation.findById(conversationId);
    if (!convo) return res.status(404).json({ message: 'Conversation not found' });

    const isParticipant = convo.participants.some(p => p.toString() === me || p.toString() === (to || ''));
    if (!isParticipant) return res.status(403).json({ message: 'Forbidden' });

    const fileUrl = `${req.protocol}://${req.get('host')}/uploads/${req.file.filename}`;
    const msgType: 'image' | 'file' = req.file.mimetype.startsWith('image/') ? 'image' : 'file';

    const otherId = to || convo.participants.find(p => p.toString() !== me)!.toString();

    const msg = await ChatMessage.create({
      conversationId,
      sender: me,
      recipient: otherId,
      content: fileUrl,
      type: msgType,
    });
    await ChatConversation.findByIdAndUpdate(conversationId, { $set: { lastMessageAt: new Date() } });

    try {
      await createAndNotify(otherId, 'New chat message received', 'chat');
    } catch {}

    return res.json({
      conversationId,
      message: {
        _id: msg._id,
        conversationId,
        sender: msg.sender,
        recipient: msg.recipient,
        content: msg.content,
        type: msg.type,
        createdAt: msg.createdAt,
        readAt: msg.readAt,
      },
    });
  } catch {
    res.status(500).json({ message: 'Server error' });
  }
});

// Get unread messages count
router.get('/unread-count', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const me = req.user!.userId;
    
    // Get all conversations where user is participant
    const conversations = await ChatConversation.find({ 
      participants: { $in: [me] } 
    });
    
    // Count unread messages (messages sent to user that haven't been read)
    const unreadCount = await ChatMessage.countDocuments({
      recipient: me,
      readAt: { $exists: false }
    });
    
    res.json({ count: unreadCount });
  } catch (error) {
    console.error('Get unread count failed:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Send text message
router.post('/send', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const { to, content, type = 'text' } = req.body;
    if (!to || !content) {
      return res.status(400).json({ message: 'Recipient and content are required' });
    }

    const me = req.user!.userId;

    if (!mongoose.isValidObjectId(to)) {
      return res.status(400).json({ message: 'Invalid recipient' });
    }

    // Create or get conversation
    const participants = [new mongoose.Types.ObjectId(me), new mongoose.Types.ObjectId(to)].sort((a, b) => a.toString().localeCompare(b.toString()));
    let convo = await ChatConversation.findOne({ participants: { $all: participants, $size: 2 } });
    if (!convo) {
      convo = await ChatConversation.create({ participants });
    }

    const msg = await ChatMessage.create({
      conversationId: convo._id,
      sender: me,
      recipient: to,
      content,
      type,
    });
    
    await ChatConversation.findByIdAndUpdate(convo._id, { $set: { lastMessageAt: new Date() } });

    try {
      await createAndNotify(to, 'New chat message received', 'chat');
    } catch {}

    return res.json({
      success: true,
      message: {
        _id: msg._id,
        conversationId: convo._id,
        sender: msg.sender,
        recipient: msg.recipient,
        content: msg.content,
        type: msg.type,
        createdAt: msg.createdAt,
        readAt: msg.readAt,
      },
    });
  } catch (error) {
    console.error('Send message failed:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get chat groups/teams for owner
router.get('/owner/groups', authenticateToken, requireRole(['owner']), async (req: AuthRequest, res: Response) => {
  try {
    // Get all staff members grouped by role/department
    const [adminUsers, hrUsers, staffUsers, departments] = await Promise.all([
      User.find({ role: 'admin', isActive: true }).select('name email role isActive'),
      User.find({ role: 'hr', isActive: true }).select('name email role isActive'),
      User.find({ role: 'staff', isActive: true }).select('name email role isActive department'),
      // Import and use Department model to get real departments
      // For now, we'll simulate with staff departments
    ]);

    // Get unique departments from staff users
    const staffDepartments = [...new Set(staffUsers.map(user => user.department).filter(Boolean))];
    
    const chatGroups = [
      {
        id: 'admin-team',
        name: 'Admin Team',
        members: adminUsers.length,
        type: 'team',
        icon: 'admin_panel_settings',
        color: '#3B82F6',
        lastMessage: 'System update completed',
        timestamp: new Date().toISOString(),
        unreadCount: 2
      },
      {
        id: 'hr-team',
        name: 'HR Team',
        members: hrUsers.length,
        type: 'team',
        icon: 'people',
        color: '#10B981',
        lastMessage: 'New leave requests pending',
        timestamp: new Date().toISOString(),
        unreadCount: 1
      },
      ...staffDepartments.map((dept, index) => ({
        id: `dept-${dept.toLowerCase().replace(/\s+/g, '-')}`,
        name: dept,
        members: staffUsers.filter(user => user.department === dept).length,
        type: 'department',
        icon: 'business',
        color: ['#8B5CF6', '#F59E0B', '#EF4444', '#14B8A6', '#6366F1'][index % 5],
        lastMessage: 'Department discussion',
        timestamp: new Date().toISOString(),
        unreadCount: 0
      })),
      {
        id: 'all-staff',
        name: 'All Staff',
        members: staffUsers.length,
        type: 'broadcast',
        icon: 'groups',
        color: '#059669',
        lastMessage: 'Company announcement',
        timestamp: new Date().toISOString(),
        unreadCount: 0
      },
      {
        id: 'management',
        name: 'Management',
        members: adminUsers.length + hrUsers.length,
        type: 'team',
        icon: 'business',
        color: '#DC2626',
        lastMessage: 'Quarterly review meeting',
        timestamp: new Date().toISOString(),
        unreadCount: 3
      }
    ];

    return res.json({
      success: true,
      groups: chatGroups,
      totalMembers: adminUsers.length + hrUsers.length + staffUsers.length,
      departments: staffDepartments
    });

  } catch (error) {
    console.error('Chat groups error:', error);
    return res.status(500).json({ 
      success: false, 
      message: 'Failed to load chat groups' 
    });
  }
});

// Get messages for a specific group
router.get('/owner/messages/:groupId', authenticateToken, requireRole(['owner']), async (req: AuthRequest, res: Response) => {
  try {
    const { groupId } = req.params;
    
    // Mock messages for different groups and departments
    const mockMessages: { [key: string]: any[] } = {
      'admin-team': [
        {
          id: '1',
          senderId: 'admin1',
          senderName: 'John Admin',
          message: 'System maintenance completed successfully',
          timestamp: new Date(Date.now() - 3600000).toISOString(),
          type: 'text'
        },
        {
          id: '2',
          senderId: 'admin2',
          senderName: 'Sarah Admin',
          message: 'New employee onboarding scheduled',
          timestamp: new Date(Date.now() - 7200000).toISOString(),
          type: 'text'
        }
      ],
      'hr-team': [
        {
          id: '1',
          senderId: 'hr1',
          senderName: 'Mike HR',
          message: 'Leave requests for next week: 3 pending',
          timestamp: new Date(Date.now() - 1800000).toISOString(),
          type: 'text'
        }
      ],
      'all-staff': [
        {
          id: '1',
          senderId: 'owner',
          senderName: 'Business Owner',
          message: 'Welcome to our team! Looking forward to working together.',
          timestamp: new Date(Date.now() - 86400000).toISOString(),
          type: 'announcement'
        }
      ],
      'management': [
        {
          id: '1',
          senderId: 'owner',
          senderName: 'Business Owner',
          message: 'Quarterly performance review meeting tomorrow at 10 AM',
          timestamp: new Date(Date.now() - 3600000).toISOString(),
          type: 'text'
        }
      ]
    };

    // Add department-specific messages
    const departmentMessages = {
      'Engineering': [
        {
          id: '1',
          senderId: 'eng1',
          senderName: 'Alex Engineer',
          message: 'Code review scheduled for 2 PM',
          timestamp: new Date(Date.now() - 2400000).toISOString(),
          type: 'text'
        },
        {
          id: '2',
          senderId: 'eng2',
          senderName: 'Sam Developer',
          message: 'New feature deployment completed',
          timestamp: new Date(Date.now() - 4800000).toISOString(),
          type: 'text'
        }
      ],
      'Sales': [
        {
          id: '1',
          senderId: 'sales1',
          senderName: 'Rachel Sales',
          message: 'Q4 targets achieved! Great team effort.',
          timestamp: new Date(Date.now() - 3000000).toISOString(),
          type: 'text'
        }
      ],
      'Marketing': [
        {
          id: '1',
          senderId: 'marketing1',
          senderName: 'Tom Marketing',
          message: 'New campaign launch next Monday',
          timestamp: new Date(Date.now() - 3600000).toISOString(),
          type: 'text'
        }
      ],
      'HR': [
        {
          id: '1',
          senderId: 'hr1',
          senderName: 'Emma HR',
          message: 'Performance reviews due this week',
          timestamp: new Date(Date.now() - 4200000).toISOString(),
          type: 'text'
        }
      ]
    };

    // Check if it's a department group (starts with 'dept-')
    let messages = mockMessages[groupId] || [];
    
    if (groupId.startsWith('dept-')) {
      const deptName = groupId.replace('dept-', '').replace(/-/g, ' ');
      // Capitalize first letter of each word
      const formattedDeptName = deptName.replace(/\b\w/g, l => l.toUpperCase());
      messages = departmentMessages[formattedDeptName] || [
        {
          id: '1',
          senderId: 'dept_head',
          senderName: 'Department Head',
          message: `Welcome to ${formattedDeptName} department chat!`,
          timestamp: new Date(Date.now() - 3600000).toISOString(),
          type: 'text'
        }
      ];
    }

    return res.json({
      success: true,
      groupId,
      messages,
      isDepartment: groupId.startsWith('dept-')
    });

  } catch (error) {
    console.error('Chat messages error:', error);
    return res.status(500).json({ 
      success: false, 
      message: 'Failed to load chat messages' 
    });
  }
});

// Get all departments for admin/HR
router.get('/departments', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const myRole = req.user!.role;
    
    // Only admin and HR can access this endpoint
    if (!['admin', 'hr'].includes(myRole)) {
      return res.status(403).json({ message: 'Insufficient permissions' });
    }

    // Get all unique departments from users
    const departments = await User.aggregate([
      { $match: { department: { $exists: true, $ne: null, $ne: '' }, isActive: true } },
      { $group: { _id: '$department', count: { $sum: 1 } } },
      { $sort: { _id: 1 } }
    ]);

    const departmentList = departments.map(dept => ({
      name: dept._id,
      memberCount: dept.count,
      groupId: `dept-${dept._id.toLowerCase().replace(/\s+/g, '-')}`
    }));

    res.json({ 
      success: true,
      departments: departmentList 
    });
  } catch (err) {
    console.error('Get departments error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get department group for staff members
router.get('/staff/department-groups', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const user = await User.findById(userId);
    
    if (!user) {
      return res.status(400).json({ 
        success: false, 
        message: 'User not found' 
      });
    }

    // For admin and HR users, get all departments they can access
    let department = user.department;
    let departmentMembers = [];
    
    if (!department || department === 'General') {
      // For admin/HR without specific department, show all departments
      const allStaff = await User.find({ 
        role: 'staff', 
        isActive: true 
      }).select('name email role department');

      // Get unique departments from staff
      const departments = [...new Set(allStaff.map(staff => staff.department).filter(Boolean))];
      
      return res.json({
        success: true,
        type: 'admin_view',
        departments: departments,
        allStaff: allStaff.map(staff => ({
          id: staff._id,
          name: staff.name,
          email: staff.email,
          role: staff.role,
          department: staff.department || 'General'
        })),
        totalStaff: allStaff.length
      });
    }

    // For staff with specific department
    departmentMembers = await User.find({ 
      department: department, 
      isActive: true
    }).select('name email role department');

    const deptGroupId = `dept-${department.toLowerCase().replace(/\s+/g, '-')}`;
    
    return res.json({
      success: true,
      type: 'department_chat',
      department: department,
      groupId: deptGroupId,
      members: departmentMembers,
      totalMembers: departmentMembers.length
    });

  } catch (error) {
    console.error('Department groups error:', error);
    return res.status(500).json({ 
      success: false, 
      message: 'Failed to load department groups' 
    });
  }
});

// Send message to department group
router.post('/staff/department-message', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const { message, type = 'text', targetDepartment } = req.body;
    const senderId = req.user!.userId;
    const senderName = req.user!.name || 'Staff Member';
    
    if (!message) {
      return res.status(400).json({
        success: false,
        message: 'Message is required'
      });
    }

    // Get user's department
    const user = await User.findById(senderId);
    if (!user) {
      return res.status(400).json({
        success: false,
        message: 'User not found'
      });
    }

    let department = user.department;
    
    // For admin/HR, allow sending to specific department
    if (targetDepartment && (user.role === 'admin' || user.role === 'hr')) {
      department = targetDepartment;
    }

    if (!department) {
      return res.status(400).json({
        success: false,
        message: 'No department specified'
      });
    }

    const deptGroupId = `dept-${department.toLowerCase().replace(/\s+/g, '-')}`;
    
    // Create and save the message to database
    const newMessage = await DepartmentMessage.create({
      groupId: deptGroupId,
      department: department,
      senderId: senderId,
      senderName: senderName,
      message: message,
      type: type,
      timestamp: new Date()
    });

    // Get all department members to notify them
    const departmentMembers = await User.find({ 
      department: department, 
      isActive: true,
      _id: { $ne: senderId }
    });

    // Create notifications for all department members
    try {
      for (const member of departmentMembers) {
        await createAndNotify(
          member._id.toString(), 
          `New message in ${department} department`,
          'department-chat'
        );
      }
    } catch (notificationError) {
      console.error('Notification error:', notificationError);
    }

    return res.json({
      success: true,
      message: 'Department message sent successfully',
      data: {
        id: newMessage._id.toString(),
        senderId: newMessage.senderId.toString(),
        senderName: newMessage.senderName,
        message: newMessage.message,
        department: newMessage.department,
        timestamp: newMessage.timestamp.toISOString(),
        type: newMessage.type,
        groupId: newMessage.groupId
      },
      notifiedMembers: departmentMembers.length
    });

  } catch (error) {
    console.error('Send department message error:', error);
    return res.status(500).json({ 
      success: false, 
      message: 'Failed to send department message' 
    });
  }
});

// Get department chat messages
router.get('/staff/department-messages', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const user = await User.findById(userId);
    
    if (!user || !user.department) {
      return res.status(400).json({ 
        success: false, 
        message: 'User department not found' 
      });
    }

    const deptGroupId = `dept-${user.department.toLowerCase().replace(/\s+/g, '-')}`;
    
    // Fetch messages from database
    const messages = await DepartmentMessage.find({ groupId: deptGroupId })
      .sort({ timestamp: 1 })
      .lean();
    
    // If no messages exist, return empty array (no mock messages needed)
    const formattedMessages = messages.map(msg => ({
      id: msg._id.toString(),
      senderId: msg.senderId.toString(),
      senderName: msg.senderName,
      message: msg.message,
      timestamp: msg.timestamp.toISOString(),
      type: msg.type
    }));

    return res.json({
      success: true,
      groupId: deptGroupId,
      department: user.department,
      messages: formattedMessages
    });

  } catch (error) {
    console.error('Get department messages error:', error);
    return res.status(500).json({ 
      success: false, 
      message: 'Failed to load department messages' 
    });
  }
});

export default router;
