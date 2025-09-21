const express = require('express');
const QRCode = require('qrcode');
const { v4: uuidv4 } = require('uuid');
const { body, validationResult } = require('express-validator');
const Session = require('../models/Session');
const Attendance = require('../models/Attendance');
const { auth, authorize } = require('../middleware/auth');

const router = express.Router();

// @route   POST /api/sessions
// @desc    Create a new session and generate QR code
// @access  Private (Teacher/Admin only)
router.post('/', auth, authorize('teacher', 'admin'), [
  body('subject').trim().isLength({ min: 1 }).withMessage('Subject is required'),
  body('date').isISO8601().withMessage('Valid date is required'),
  body('startTime').matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/).withMessage('Valid start time is required'),
  body('endTime').matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/).withMessage('Valid end time is required'),
  body('description').optional().trim(),
  body('location').optional().trim(),
  body('maxStudents').optional().isInt({ min: 1 }).withMessage('Max students must be a positive integer')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { subject, description, date, startTime, endTime, location, maxStudents = 100 } = req.body;

    // Validate time range
    const start = new Date(`${date}T${startTime}:00`);
    const end = new Date(`${date}T${endTime}:00`);
    
    if (start >= end) {
      return res.status(400).json({ message: 'End time must be after start time' });
    }

    // Check if session date is not in the past
    const sessionDate = new Date(date);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    if (sessionDate < today) {
      return res.status(400).json({ message: 'Cannot create session for past dates' });
    }

    // Generate unique QR token
    const qrToken = uuidv4();
    
    // Calculate expiry time (session end time + buffer)
    const expiryTime = new Date(end.getTime() + 30 * 60000); // 30 minutes after session ends

    // Create session
    const session = new Session({
      subject,
      description,
      teacher: req.user._id,
      date: sessionDate,
      startTime,
      endTime,
      qrToken,
      expiresAt: expiryTime,
      location,
      maxStudents
    });

    await session.save();

    // Generate QR code data
    const qrData = {
      sessionId: session._id,
      token: qrToken,
      subject,
      date: sessionDate.toISOString().split('T')[0],
      startTime,
      endTime
    };

    // Generate QR code as base64 image
    const qrCodeDataURL = await QRCode.toDataURL(JSON.stringify(qrData), {
      width: 300,
      margin: 2,
      color: {
        dark: '#000000',
        light: '#FFFFFF'
      }
    });

    res.status(201).json({
      message: 'Session created successfully',
      session: {
        id: session._id,
        subject: session.subject,
        description: session.description,
        date: session.date,
        startTime: session.startTime,
        endTime: session.endTime,
        location: session.location,
        maxStudents: session.maxStudents,
        qrToken: session.qrToken,
        expiresAt: session.expiresAt,
        isActive: session.isActive
      },
      qrCode: qrCodeDataURL
    });
  } catch (error) {
    console.error('Session creation error:', error);
    res.status(500).json({ message: 'Server error during session creation' });
  }
});

// @route   GET /api/sessions
// @desc    Get all sessions for a teacher
// @access  Private (Teacher/Admin only)
router.get('/', auth, authorize('teacher', 'admin'), async (req, res) => {
  try {
    const { page = 1, limit = 10, status = 'all' } = req.query;
    const skip = (page - 1) * limit;

    let query = { teacher: req.user._id };
    
    if (status === 'active') {
      query.isActive = true;
      query.expiresAt = { $gt: new Date() };
    } else if (status === 'expired') {
      query.expiresAt = { $lte: new Date() };
    }

    const sessions = await Session.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .populate('teacher', 'name email');

    const total = await Session.countDocuments(query);

    res.json({
      sessions,
      pagination: {
        current: parseInt(page),
        pages: Math.ceil(total / limit),
        total
      }
    });
  } catch (error) {
    console.error('Get sessions error:', error);
    res.status(500).json({ message: 'Server error while fetching sessions' });
  }
});

// @route   GET /api/sessions/:id
// @desc    Get session details with attendance
// @access  Private (Teacher/Admin only)
router.get('/:id', auth, authorize('teacher', 'admin'), async (req, res) => {
  try {
    const session = await Session.findById(req.params.id)
      .populate('teacher', 'name email');

    if (!session) {
      return res.status(404).json({ message: 'Session not found' });
    }

    // Check if teacher owns this session
    if (session.teacher._id.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Access denied' });
    }

    // Get attendance for this session
    const attendance = await Attendance.find({ session: session._id })
      .populate('student', 'name rollNumber email department year')
      .sort({ markedAt: -1 });

    res.json({
      session,
      attendance,
      attendanceStats: {
        total: attendance.length,
        present: attendance.filter(a => a.status === 'present').length,
        late: attendance.filter(a => a.status === 'late').length,
        absent: 0 // This would need to be calculated based on enrolled students
      }
    });
  } catch (error) {
    console.error('Get session error:', error);
    res.status(500).json({ message: 'Server error while fetching session' });
  }
});

// @route   PUT /api/sessions/:id
// @desc    Update session
// @access  Private (Teacher/Admin only)
router.put('/:id', auth, authorize('teacher', 'admin'), [
  body('subject').optional().trim().isLength({ min: 1 }).withMessage('Subject cannot be empty'),
  body('description').optional().trim(),
  body('location').optional().trim(),
  body('maxStudents').optional().isInt({ min: 1 }).withMessage('Max students must be a positive integer')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const session = await Session.findById(req.params.id);

    if (!session) {
      return res.status(404).json({ message: 'Session not found' });
    }

    // Check if teacher owns this session
    if (session.teacher.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Access denied' });
    }

    // Check if session has already started
    const now = new Date();
    const sessionStart = new Date(`${session.date.toISOString().split('T')[0]}T${session.startTime}:00`);
    
    if (now >= sessionStart) {
      return res.status(400).json({ message: 'Cannot modify session that has already started' });
    }

    const { subject, description, location, maxStudents } = req.body;
    const updateData = {};

    if (subject) updateData.subject = subject;
    if (description !== undefined) updateData.description = description;
    if (location !== undefined) updateData.location = location;
    if (maxStudents) updateData.maxStudents = maxStudents;

    const updatedSession = await Session.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true, runValidators: true }
    );

    res.json({
      message: 'Session updated successfully',
      session: updatedSession
    });
  } catch (error) {
    console.error('Update session error:', error);
    res.status(500).json({ message: 'Server error during session update' });
  }
});

// @route   DELETE /api/sessions/:id
// @desc    Delete session
// @access  Private (Teacher/Admin only)
router.delete('/:id', auth, authorize('teacher', 'admin'), async (req, res) => {
  try {
    const session = await Session.findById(req.params.id);

    if (!session) {
      return res.status(404).json({ message: 'Session not found' });
    }

    // Check if teacher owns this session
    if (session.teacher.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Access denied' });
    }

    // Check if session has already started
    const now = new Date();
    const sessionStart = new Date(`${session.date.toISOString().split('T')[0]}T${session.startTime}:00`);
    
    if (now >= sessionStart) {
      return res.status(400).json({ message: 'Cannot delete session that has already started' });
    }

    // Delete associated attendance records
    await Attendance.deleteMany({ session: session._id });
    
    // Delete session
    await Session.findByIdAndDelete(req.params.id);

    res.json({ message: 'Session deleted successfully' });
  } catch (error) {
    console.error('Delete session error:', error);
    res.status(500).json({ message: 'Server error during session deletion' });
  }
});

// @route   POST /api/sessions/:id/regenerate-qr
// @desc    Regenerate QR code for session
// @access  Private (Teacher/Admin only)
router.post('/:id/regenerate-qr', auth, authorize('teacher', 'admin'), async (req, res) => {
  try {
    const session = await Session.findById(req.params.id);

    if (!session) {
      return res.status(404).json({ message: 'Session not found' });
    }

    // Check if teacher owns this session
    if (session.teacher.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Access denied' });
    }

    // Generate new QR token
    const newQrToken = uuidv4();
    
    // Update session with new token
    session.qrToken = newQrToken;
    await session.save();

    // Generate new QR code
    const qrData = {
      sessionId: session._id,
      token: newQrToken,
      subject: session.subject,
      date: session.date.toISOString().split('T')[0],
      startTime: session.startTime,
      endTime: session.endTime
    };

    const qrCodeDataURL = await QRCode.toDataURL(JSON.stringify(qrData), {
      width: 300,
      margin: 2,
      color: {
        dark: '#000000',
        light: '#FFFFFF'
      }
    });

    res.json({
      message: 'QR code regenerated successfully',
      qrToken: newQrToken,
      qrCode: qrCodeDataURL
    });
  } catch (error) {
    console.error('Regenerate QR error:', error);
    res.status(500).json({ message: 'Server error during QR regeneration' });
  }
});

module.exports = router;
