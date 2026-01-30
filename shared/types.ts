export interface User {
  id: string;
  name: string;
  email: string;
  role: 'staff' | 'admin';
  joiningDate?: string; // YYYY-MM-DD format
  createdAt?: string;
}

export interface Attendance {
  id: string;
  userId: string;
  name: string;
  date: string; // YYYY-MM-DD format
  checkIn: string; // ISO date string
  checkOut?: string; // ISO date string
  totalHours?: string; // "8h 30m" format
  status: 'checked-in' | 'checked-out' | 'on-leave';
  leaveReason?: string;
}

export interface LoginResponse {
  message: string;
  token: string;
  user: User;
}

export interface AttendanceResponse {
  message: string;
  attendance: Attendance;
}

export interface AttendanceListResponse {
  attendance: Attendance[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    pages: number;
  };
}

export interface Task {
  id: string;
  title: string;
  description: string;
  assignedTo: string; // user ID
  assignedToName: string; // user name
  assignedBy: string; // admin ID
  assignedByName: string; // admin name
  dueDate: string; // ISO date string
  status: 'pending' | 'in_progress' | 'completed' | 'overdue';
  priority: 'low' | 'medium' | 'high';
  createdAt: string;
  completedAt?: string;
  submissionNote?: string;
}
