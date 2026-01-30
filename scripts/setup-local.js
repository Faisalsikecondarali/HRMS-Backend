#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

console.log('🚀 Setting up Local Deployment...\n');

// Create local deployment README
const localReadme = `# 📱 Staff Attendance System - Local Deployment

## 🚀 Quick Start

### Prerequisites
- Node.js 18+ installed
- Git (optional)

### Installation

1. **Extract/Clone the project:**
   \`\`\`bash
   # If from zip file, extract to desired location
   # If from git: git clone <repository-url>
   cd staff-attendance-system
   \`\`\`

2. **Install dependencies:**
   \`\`\`bash
   npm install
   \`\`\`

3. **Start the application:**
   \`\`\`bash
   npm run dev
   \`\`\`

4. **Open in browser:**
   - Navigate to: http://localhost:8080
   - The application will open automatically

## 👥 Demo Accounts

### Administrator Access
- **Email:** admin@company.com
- **Password:** admin123

### Staff Access
- **Email:** staff@company.com
- **Password:** staff123
- **Email:** jane@company.com  
- **Password:** staff123

## 📋 Features Available

### For Staff Members:
- ✅ Check-in/Check-out attendance
- ✅ View personal attendance history  
- ✅ Request leave
- ✅ View leave status notifications
- ✅ See personal profile with joining date

### For Administrators:
- ✅ View all staff attendance records
- ✅ Export attendance data to CSV
- ✅ Add new staff members
- ✅ Edit/delete existing staff
- ✅ Approve/reject leave requests
- ✅ View analytics and reports
- ✅ Manage staff joining dates

## 💾 Data Storage

This application uses **localStorage** for data persistence:
- All data is stored locally in your browser
- Data persists between sessions
- No external database required
- Perfect for local/offline use`;

// Write the local README
fs.writeFileSync(path.join(__dirname, '..', 'LOCAL_DEPLOYMENT.md'), localReadme);

// Create start scripts
const startScript = `#!/bin/bash
echo "🚀 Starting Staff Attendance System..."
npm install
npm run dev`;

const startBat = `@echo off
echo 🚀 Starting Staff Attendance System...
npm install
npm run dev`;

// Write start scripts
fs.writeFileSync(path.join(__dirname, '..', 'start.sh'), startScript);
fs.writeFileSync(path.join(__dirname, '..', 'start.bat'), startBat);

// Make shell script executable
try {
    fs.chmodSync(path.join(__dirname, '..', 'start.sh'), 0o755);
} catch (e) {
    // Ignore chmod errors on Windows
}

console.log('✅ Local deployment setup complete!');
console.log('🚀 To start: npm run dev');
console.log('🌐 Access at: http://localhost:8080');
