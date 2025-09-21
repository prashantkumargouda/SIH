const express = require('express');
const { body, validationResult } = require('express-validator');
const Session = require('../models/Session');
const Attendance = require('../models/Attendance');
const User = require('../models/User');
const { auth } = require('../middleware/auth');

const router = express.Router();

// @route   POST /api/attendance/scan-qr
// @desc    Scan QR code and mark attendance
// @access  Private (Student only)
router.post('/scan-qr', auth, [
  body('qrData').isObject().withMessage('QR data is required'),
  body('qrData.sessionId').isMongoId().withMessage('Valid session ID is required'),
  body('qrData.token').isString().withMessage('QR token is required'),
  body('method').optional().isIn(['qr_code', 'face_recognition']).withMessage('Invalid method'),
  body('faceConfidence').optional().isFloat({ min: 0, max: 1 }).withMessage('Face confidence must be between 0 and 1'),
  body('location').optional().isObject().withMessage('Location must be an object')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { qrData, method = 'qr_code', faceConfidence, location, deviceInfo } = req.body;
    const { sessionId, token } = qrData;

    // Find session by ID and token
    const session = await Session.findOne({
      _id: sessionId,
      qrToken: token,
      isActive: true
    });

    if (!session) {
      return res.status(400).json({ message: 'Invalid QR code or session not found' });
    }

    // Check if session is expired
    if (new Date() > session.expiresAt) {
      return res.status(400).json({ message: 'QR code has expired' });
    }

    // Check if session has started
    const now = new Date();
    const sessionStart = new Date(`${session.date.toISOString().split('T')[0]}T${session.startTime}:00`);
    
    if (now < sessionStart) {
      return res.status(400).json({ message: 'Session has not started yet' });
    }

    // Check if student has already marked attendance
    const existingAttendance = await Attendance.findOne({
      student: req.user._id,
      session: sessionId
    });

    if (existingAttendance) {
      return res.status(400).json({ 
        message: 'Attendance already marked for this session',
        attendance: existingAttendance
      });
    }

    // For face recognition method, check if student has face embedding
    if (method === 'face_recognition') {
      if (!req.user.faceEmbedding || req.user.faceEmbedding.length === 0) {
        return res.status(400).json({ 
          message: 'Face not registered. Please register your face first.' 
        });
      }

      if (!faceConfidence || faceConfidence < (process.env.FACE_RECOGNITION_THRESHOLD || 0.6)) {
        return res.status(400).json({ 
          message: 'Face recognition confidence too low. Please try again.' 
        });
      }
    }

    // Create attendance record
    const attendance = new Attendance({
      student: req.user._id,
      session: sessionId,
      method,
      faceConfidence,
      location,
      deviceInfo,
      isVerified: method === 'face_recognition' ? faceConfidence >= 0.8 : true
    });

    await attendance.save();

    // Update session attendance count
    await Session.findByIdAndUpdate(sessionId, {
      $inc: { attendanceCount: 1 }
    });

    // Populate session details for response
    await attendance.populate('session', 'subject date startTime endTime location');

    res.status(201).json({
      message: 'Attendance marked successfully',
      attendance: {
        id: attendance._id,
        status: attendance.status,
        markedAt: attendance.markedAt,
        method: attendance.method,
        isVerified: attendance.isVerified,
        session: {
          subject: attendance.session.subject,
          date: attendance.session.date,
          startTime: attendance.session.startTime,
          endTime: attendance.session.endTime,
          location: attendance.session.location
        }
      }
    });
  } catch (error) {
    console.error('Mark attendance error:', error);
    res.status(500).json({ message: 'Server error during attendance marking' });
  }
});

// @route   GET /api/attendance/my-attendance
// @desc    Get student's attendance records
// @access  Private (Student only)
router.get('/my-attendance', auth, async (req, res) => {
  try {
    const { page = 1, limit = 10, status, startDate, endDate } = req.query;
    const skip = (page - 1) * limit;

    let query = { student: req.user._id };

    // Filter by status
    if (status && ['present', 'absent', 'late'].includes(status)) {
      query.status = status;
    }

    // Filter by date range
    if (startDate || endDate) {
      query.markedAt = {};
      if (startDate) query.markedAt.$gte = new Date(startDate);
      if (endDate) query.markedAt.$lte = new Date(endDate);
    }

    const attendance = await Attendance.find(query)
      .populate('session', 'subject date startTime endTime location teacher')
      .populate('session.teacher', 'name')
      .sort({ markedAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Attendance.countDocuments(query);

    // Calculate attendance statistics
    const stats = await Attendance.aggregate([
      { $match: { student: req.user._id } },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 }
        }
      }
    ]);

    const attendanceStats = {
      present: 0,
      late: 0,
      absent: 0,
      total: 0
    };

    stats.forEach(stat => {
      attendanceStats[stat._id] = stat.count;
      attendanceStats.total += stat.count;
    });

    res.json({
      attendance,
      pagination: {
        current: parseInt(page),
        pages: Math.ceil(total / limit),
        total
      },
      stats: attendanceStats
    });
  } catch (error) {
    console.error('Get attendance error:', error);
    res.status(500).json({ message: 'Server error while fetching attendance' });
  }
});

// @route   GET /api/attendance/session/:sessionId
// @desc    Get attendance for a specific session
// @access  Private (Teacher/Admin only)
router.get('/session/:sessionId', auth, async (req, res) => {
  try {
    const session = await Session.findById(req.params.sessionId);

    if (!session) {
      return res.status(404).json({ message: 'Session not found' });
    }

    // Check if user is teacher of this session or admin
    if (session.teacher.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Access denied' });
    }

    const attendance = await Attendance.find({ session: req.params.sessionId })
      .populate('student', 'name rollNumber email department year')
      .sort({ markedAt: -1 });

    // Calculate statistics
    const stats = {
      total: attendance.length,
      present: attendance.filter(a => a.status === 'present').length,
      late: attendance.filter(a => a.status === 'late').length,
      absent: 0, // This would need to be calculated based on enrolled students
      qrCode: attendance.filter(a => a.method === 'qr_code').length,
      faceRecognition: attendance.filter(a => a.method === 'face_recognition').length
    };

    res.json({
      session: {
        id: session._id,
        subject: session.subject,
        date: session.date,
        startTime: session.startTime,
        endTime: session.endTime,
        location: session.location,
        maxStudents: session.maxStudents
      },
      attendance,
      stats
    });
  } catch (error) {
    console.error('Get session attendance error:', error);
    res.status(500).json({ message: 'Server error while fetching session attendance' });
  }
});

// @route   PUT /api/attendance/:id
// @desc    Update attendance record (Teacher/Admin only)
// @access  Private (Teacher/Admin only)
router.put('/:id', auth, [
  body('status').optional().isIn(['present', 'absent', 'late']).withMessage('Invalid status'),
  body('remarks').optional().trim()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const attendance = await Attendance.findById(req.params.id)
      .populate('session', 'teacher');

    if (!attendance) {
      return res.status(404).json({ message: 'Attendance record not found' });
    }

    // Check if user is teacher of this session or admin
    if (attendance.session.teacher.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Access denied' });
    }

    const { status, remarks } = req.body;
    const updateData = {};

    if (status) updateData.status = status;
    if (remarks !== undefined) updateData.remarks = remarks;

    const updatedAttendance = await Attendance.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true, runValidators: true }
    ).populate('student', 'name rollNumber email department year');

    res.json({
      message: 'Attendance updated successfully',
      attendance: updatedAttendance
    });
  } catch (error) {
    console.error('Update attendance error:', error);
    res.status(500).json({ message: 'Server error during attendance update' });
  }
});

// @route   DELETE /api/attendance/:id
// @desc    Delete attendance record (Teacher/Admin only)
// @access  Private (Teacher/Admin only)
router.delete('/:id', auth, async (req, res) => {
  try {
    const attendance = await Attendance.findById(req.params.id)
      .populate('session', 'teacher');

    if (!attendance) {
      return res.status(404).json({ message: 'Attendance record not found' });
    }

    // Check if user is teacher of this session or admin
    if (attendance.session.teacher.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Access denied' });
    }

    await Attendance.findByIdAndDelete(req.params.id);

    // Update session attendance count
    await Session.findByIdAndUpdate(attendance.session._id, {
      $inc: { attendanceCount: -1 }
    });

    res.json({ message: 'Attendance record deleted successfully' });
  } catch (error) {
    console.error('Delete attendance error:', error);
    res.status(500).json({ message: 'Server error during attendance deletion' });
  }
});

module.exports = router;
