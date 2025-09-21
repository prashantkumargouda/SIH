const express = require('express');
const XLSX = require('xlsx');
const createCsvWriter = require('csv-writer').createObjectCsvWriter;
const path = require('path');
const fs = require('fs');
const { auth, authorize } = require('../middleware/auth');
const Session = require('../models/Session');
const Attendance = require('../models/Attendance');
const User = require('../models/User');

const router = express.Router();

// @route   GET /api/export/session/:sessionId/csv
// @desc    Export session attendance as CSV
// @access  Private (Teacher/Admin only)
router.get('/session/:sessionId/csv', auth, async (req, res) => {
  try {
    const session = await Session.findById(req.params.sessionId);

    if (!session) {
      return res.status(404).json({ message: 'Session not found' });
    }

    // Check if user is teacher of this session or admin
    if (session.teacher.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Access denied' });
    }

    const attendance = await Attendance.find({ session: session._id })
      .populate('student', 'name rollNumber email department year')
      .sort({ markedAt: -1 });

    // Prepare CSV data
    const csvData = attendance.map(record => ({
      'Student Name': record.student.name,
      'Roll Number': record.student.rollNumber || '',
      'Email': record.student.email,
      'Department': record.student.department || '',
      'Year': record.student.year || '',
      'Status': record.status.charAt(0).toUpperCase() + record.status.slice(1),
      'Method': record.method.replace('_', ' ').toUpperCase(),
      'Marked At': new Date(record.markedAt).toLocaleString(),
      'Verified': record.isVerified ? 'Yes' : 'No'
    }));

    // Create CSV
    const csvWriter = createCsvWriter({
      path: `temp_attendance_${session._id}.csv`,
      header: [
        { id: 'Student Name', title: 'Student Name' },
        { id: 'Roll Number', title: 'Roll Number' },
        { id: 'Email', title: 'Email' },
        { id: 'Department', title: 'Department' },
        { id: 'Year', title: 'Year' },
        { id: 'Status', title: 'Status' },
        { id: 'Method', title: 'Method' },
        { id: 'Marked At', title: 'Marked At' },
        { id: 'Verified', title: 'Verified' }
      ]
    });

    await csvWriter.writeRecords(csvData);

    // Send file
    const filePath = path.join(process.cwd(), `temp_attendance_${session._id}.csv`);
    res.download(filePath, `attendance_${session.subject}_${session.date}.csv`, (err) => {
      if (err) {
        console.error('Error sending file:', err);
      }
      // Clean up temp file
      fs.unlink(filePath, (unlinkErr) => {
        if (unlinkErr) console.error('Error deleting temp file:', unlinkErr);
      });
    });

  } catch (error) {
    console.error('CSV export error:', error);
    res.status(500).json({ message: 'Server error during CSV export' });
  }
});

// @route   GET /api/export/session/:sessionId/excel
// @desc    Export session attendance as Excel
// @access  Private (Teacher/Admin only)
router.get('/session/:sessionId/excel', auth, async (req, res) => {
  try {
    const session = await Session.findById(req.params.sessionId);

    if (!session) {
      return res.status(404).json({ message: 'Session not found' });
    }

    // Check if user is teacher of this session or admin
    if (session.teacher.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Access denied' });
    }

    const attendance = await Attendance.find({ session: session._id })
      .populate('student', 'name rollNumber email department year')
      .sort({ markedAt: -1 });

    // Prepare Excel data
    const excelData = attendance.map(record => ({
      'Student Name': record.student.name,
      'Roll Number': record.student.rollNumber || '',
      'Email': record.student.email,
      'Department': record.student.department || '',
      'Year': record.student.year || '',
      'Status': record.status.charAt(0).toUpperCase() + record.status.slice(1),
      'Method': record.method.replace('_', ' ').toUpperCase(),
      'Marked At': new Date(record.markedAt).toLocaleString(),
      'Verified': record.isVerified ? 'Yes' : 'No'
    }));

    // Create workbook
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(excelData);

    // Add session info as header
    const sessionInfo = [
      [`Session: ${session.subject}`],
      [`Date: ${new Date(session.date).toLocaleDateString()}`],
      [`Time: ${session.startTime} - ${session.endTime}`],
      [`Location: ${session.location || 'Not specified'}`],
      [`Total Attendance: ${attendance.length}`],
      ['']
    ];

    XLSX.utils.sheet_add_aoa(ws, sessionInfo, { origin: 'A1' });
    XLSX.utils.sheet_add_aoa(ws, [['Student Name', 'Roll Number', 'Email', 'Department', 'Year', 'Status', 'Method', 'Marked At', 'Verified']], { origin: 'A7' });
    XLSX.utils.sheet_add_json(ws, excelData, { origin: 'A8', skipHeader: true });

    // Set column widths
    ws['!cols'] = [
      { wch: 20 }, // Student Name
      { wch: 15 }, // Roll Number
      { wch: 25 }, // Email
      { wch: 15 }, // Department
      { wch: 10 }, // Year
      { wch: 10 }, // Status
      { wch: 15 }, // Method
      { wch: 20 }, // Marked At
      { wch: 10 }  // Verified
    ];

    XLSX.utils.book_append_sheet(wb, ws, 'Attendance');

    // Generate buffer
    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

    // Set headers
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=attendance_${session.subject}_${session.date}.xlsx`);

    res.send(buffer);

  } catch (error) {
    console.error('Excel export error:', error);
    res.status(500).json({ message: 'Server error during Excel export' });
  }
});

// @route   GET /api/export/student/:studentId/csv
// @desc    Export student attendance as CSV
// @access  Private (Teacher/Admin only)
router.get('/student/:studentId/csv', auth, authorize('teacher', 'admin'), async (req, res) => {
  try {
    const student = await User.findById(req.params.studentId);

    if (!student || student.role !== 'student') {
      return res.status(404).json({ message: 'Student not found' });
    }

    const { startDate, endDate } = req.query;
    let query = { student: student._id };

    if (startDate || endDate) {
      query.markedAt = {};
      if (startDate) query.markedAt.$gte = new Date(startDate);
      if (endDate) query.markedAt.$lte = new Date(endDate);
    }

    const attendance = await Attendance.find(query)
      .populate('session', 'subject date startTime endTime location teacher')
      .populate('session.teacher', 'name')
      .sort({ markedAt: -1 });

    // Prepare CSV data
    const csvData = attendance.map(record => ({
      'Subject': record.session.subject,
      'Date': new Date(record.session.date).toLocaleDateString(),
      'Time': `${record.session.startTime} - ${record.session.endTime}`,
      'Location': record.session.location || '',
      'Teacher': record.session.teacher.name,
      'Status': record.status.charAt(0).toUpperCase() + record.status.slice(1),
      'Method': record.method.replace('_', ' ').toUpperCase(),
      'Marked At': new Date(record.markedAt).toLocaleString(),
      'Verified': record.isVerified ? 'Yes' : 'No'
    }));

    // Create CSV
    const csvWriter = createCsvWriter({
      path: `temp_student_attendance_${student._id}.csv`,
      header: [
        { id: 'Subject', title: 'Subject' },
        { id: 'Date', title: 'Date' },
        { id: 'Time', title: 'Time' },
        { id: 'Location', title: 'Location' },
        { id: 'Teacher', title: 'Teacher' },
        { id: 'Status', title: 'Status' },
        { id: 'Method', title: 'Method' },
        { id: 'Marked At', title: 'Marked At' },
        { id: 'Verified', title: 'Verified' }
      ]
    });

    await csvWriter.writeRecords(csvData);

    // Send file
    const filePath = path.join(process.cwd(), `temp_student_attendance_${student._id}.csv`);
    res.download(filePath, `attendance_${student.name}_${student.rollNumber || 'student'}.csv`, (err) => {
      if (err) {
        console.error('Error sending file:', err);
      }
      // Clean up temp file
      fs.unlink(filePath, (unlinkErr) => {
        if (unlinkErr) console.error('Error deleting temp file:', unlinkErr);
      });
    });

  } catch (error) {
    console.error('Student CSV export error:', error);
    res.status(500).json({ message: 'Server error during CSV export' });
  }
});

// @route   GET /api/export/overview/csv
// @desc    Export overview attendance as CSV
// @access  Private (Teacher/Admin only)
router.get('/overview/csv', auth, authorize('teacher', 'admin'), async (req, res) => {
  try {
    const { startDate, endDate, teacherId } = req.query;
    
    let query = {};
    
    // Filter by teacher if specified
    if (teacherId) {
      query.teacher = teacherId;
    } else if (req.user.role === 'teacher') {
      query.teacher = req.user._id;
    }

    // Filter by date range
    if (startDate || endDate) {
      query.date = {};
      if (startDate) query.date.$gte = new Date(startDate);
      if (endDate) query.date.$lte = new Date(endDate);
    }

    const sessions = await Session.find(query)
      .populate('teacher', 'name email')
      .sort({ date: -1 });

    // Get attendance for each session
    const sessionIds = sessions.map(session => session._id);
    const attendance = await Attendance.find({ session: { $in: sessionIds } })
      .populate('student', 'name rollNumber email department year')
      .populate('session', 'subject date startTime endTime location');

    // Group attendance by session
    const attendanceBySession = {};
    attendance.forEach(record => {
      const sessionId = record.session._id.toString();
      if (!attendanceBySession[sessionId]) {
        attendanceBySession[sessionId] = [];
      }
      attendanceBySession[sessionId].push(record);
    });

    // Prepare CSV data
    const csvData = [];
    sessions.forEach(session => {
      const sessionAttendance = attendanceBySession[session._id.toString()] || [];
      
      if (sessionAttendance.length === 0) {
        csvData.push({
          'Session': session.subject,
          'Date': new Date(session.date).toLocaleDateString(),
          'Time': `${session.startTime} - ${session.endTime}`,
          'Teacher': session.teacher.name,
          'Location': session.location || '',
          'Student Name': 'No attendance',
          'Roll Number': '',
          'Status': '',
          'Method': '',
          'Marked At': ''
        });
      } else {
        sessionAttendance.forEach(record => {
          csvData.push({
            'Session': session.subject,
            'Date': new Date(session.date).toLocaleDateString(),
            'Time': `${session.startTime} - ${session.endTime}`,
            'Teacher': session.teacher.name,
            'Location': session.location || '',
            'Student Name': record.student.name,
            'Roll Number': record.student.rollNumber || '',
            'Status': record.status.charAt(0).toUpperCase() + record.status.slice(1),
            'Method': record.method.replace('_', ' ').toUpperCase(),
            'Marked At': new Date(record.markedAt).toLocaleString()
          });
        });
      }
    });

    // Create CSV
    const csvWriter = createCsvWriter({
      path: `temp_overview_attendance.csv`,
      header: [
        { id: 'Session', title: 'Session' },
        { id: 'Date', title: 'Date' },
        { id: 'Time', title: 'Time' },
        { id: 'Teacher', title: 'Teacher' },
        { id: 'Location', title: 'Location' },
        { id: 'Student Name', title: 'Student Name' },
        { id: 'Roll Number', title: 'Roll Number' },
        { id: 'Status', title: 'Status' },
        { id: 'Method', title: 'Method' },
        { id: 'Marked At', title: 'Marked At' }
      ]
    });

    await csvWriter.writeRecords(csvData);

    // Send file
    const filePath = path.join(process.cwd(), 'temp_overview_attendance.csv');
    res.download(filePath, 'attendance_overview.csv', (err) => {
      if (err) {
        console.error('Error sending file:', err);
      }
      // Clean up temp file
      fs.unlink(filePath, (unlinkErr) => {
        if (unlinkErr) console.error('Error deleting temp file:', unlinkErr);
      });
    });

  } catch (error) {
    console.error('Overview CSV export error:', error);
    res.status(500).json({ message: 'Server error during CSV export' });
  }
});

module.exports = router;
