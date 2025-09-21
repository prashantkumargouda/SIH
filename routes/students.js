const express = require('express');
const { body, validationResult } = require('express-validator');
const User = require('../models/User');
const Attendance = require('../models/Attendance');
const { auth, authorize } = require('../middleware/auth');

const router = express.Router();

// @route   GET /api/students
// @desc    Get all students (Teacher/Admin only)
// @access  Private (Teacher/Admin only)
router.get('/', auth, authorize('teacher', 'admin'), async (req, res) => {
  try {
    const { page = 1, limit = 10, search, department, year } = req.query;
    const skip = (page - 1) * limit;

    let query = { role: 'student', isActive: true };

    // Search by name, email, or roll number
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { rollNumber: { $regex: search, $options: 'i' } }
      ];
    }

    // Filter by department
    if (department) {
      query.department = { $regex: department, $options: 'i' };
    }

    // Filter by year
    if (year) {
      query.year = year;
    }

    const students = await User.find(query)
      .select('-password -faceEmbedding')
      .sort({ name: 1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await User.countDocuments(query);

    res.json({
      students,
      pagination: {
        current: parseInt(page),
        pages: Math.ceil(total / limit),
        total
      }
    });
  } catch (error) {
    console.error('Get students error:', error);
    res.status(500).json({ message: 'Server error while fetching students' });
  }
});

// @route   GET /api/students/:id
// @desc    Get student details with attendance summary
// @access  Private (Teacher/Admin only)
router.get('/:id', auth, authorize('teacher', 'admin'), async (req, res) => {
  try {
    const student = await User.findById(req.params.id)
      .select('-password -faceEmbedding');

    if (!student || student.role !== 'student') {
      return res.status(404).json({ message: 'Student not found' });
    }

    // Get attendance summary for the student
    const attendanceStats = await Attendance.aggregate([
      { $match: { student: student._id } },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 }
        }
      }
    ]);

    const stats = {
      present: 0,
      late: 0,
      absent: 0,
      total: 0
    };

    attendanceStats.forEach(stat => {
      stats[stat._id] = stat.count;
      stats.total += stat.count;
    });

    // Get recent attendance records
    const recentAttendance = await Attendance.find({ student: student._id })
      .populate('session', 'subject date startTime endTime')
      .sort({ markedAt: -1 })
      .limit(5);

    res.json({
      student,
      attendanceStats: stats,
      recentAttendance
    });
  } catch (error) {
    console.error('Get student error:', error);
    res.status(500).json({ message: 'Server error while fetching student details' });
  }
});

// @route   PUT /api/students/:id
// @desc    Update student information
// @access  Private (Teacher/Admin only)
router.put('/:id', auth, authorize('teacher', 'admin'), [
  body('name').optional().trim().isLength({ min: 2 }).withMessage('Name must be at least 2 characters'),
  body('email').optional().isEmail().normalizeEmail().withMessage('Please provide a valid email'),
  body('rollNumber').optional().trim().isLength({ min: 1 }).withMessage('Roll number cannot be empty'),
  body('department').optional().trim(),
  body('year').optional().trim(),
  body('isActive').optional().isBoolean().withMessage('isActive must be a boolean')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const student = await User.findById(req.params.id);

    if (!student || student.role !== 'student') {
      return res.status(404).json({ message: 'Student not found' });
    }

    const { name, email, rollNumber, department, year, isActive } = req.body;
    const updateData = {};

    if (name) updateData.name = name;
    if (email) updateData.email = email;
    if (rollNumber) updateData.rollNumber = rollNumber;
    if (department !== undefined) updateData.department = department;
    if (year !== undefined) updateData.year = year;
    if (isActive !== undefined) updateData.isActive = isActive;

    // Check if email is unique (if being updated)
    if (email && email !== student.email) {
      const existingUser = await User.findOne({ email, _id: { $ne: student._id } });
      if (existingUser) {
        return res.status(400).json({ message: 'Email already exists' });
      }
    }

    // Check if roll number is unique (if being updated)
    if (rollNumber && rollNumber !== student.rollNumber) {
      const existingRollNumber = await User.findOne({ rollNumber, _id: { $ne: student._id } });
      if (existingRollNumber) {
        return res.status(400).json({ message: 'Roll number already exists' });
      }
    }

    const updatedStudent = await User.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true, runValidators: true }
    ).select('-password -faceEmbedding');

    res.json({
      message: 'Student updated successfully',
      student: updatedStudent
    });
  } catch (error) {
    console.error('Update student error:', error);
    res.status(500).json({ message: 'Server error during student update' });
  }
});

// @route   DELETE /api/students/:id
// @desc    Deactivate student account
// @access  Private (Admin only)
router.delete('/:id', auth, authorize('admin'), async (req, res) => {
  try {
    const student = await User.findById(req.params.id);

    if (!student || student.role !== 'student') {
      return res.status(404).json({ message: 'Student not found' });
    }

    // Deactivate student instead of deleting
    await User.findByIdAndUpdate(req.params.id, { isActive: false });

    res.json({ message: 'Student account deactivated successfully' });
  } catch (error) {
    console.error('Deactivate student error:', error);
    res.status(500).json({ message: 'Server error during student deactivation' });
  }
});

// @route   GET /api/students/:id/attendance
// @desc    Get detailed attendance records for a student
// @access  Private (Teacher/Admin only)
router.get('/:id/attendance', auth, authorize('teacher', 'admin'), async (req, res) => {
  try {
    const { page = 1, limit = 10, startDate, endDate, status } = req.query;
    const skip = (page - 1) * limit;

    const student = await User.findById(req.params.id);

    if (!student || student.role !== 'student') {
      return res.status(404).json({ message: 'Student not found' });
    }

    let query = { student: student._id };

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
      { $match: { student: student._id } },
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
      student: {
        id: student._id,
        name: student.name,
        rollNumber: student.rollNumber,
        email: student.email,
        department: student.department,
        year: student.year
      },
      attendance,
      pagination: {
        current: parseInt(page),
        pages: Math.ceil(total / limit),
        total
      },
      stats: attendanceStats
    });
  } catch (error) {
    console.error('Get student attendance error:', error);
    res.status(500).json({ message: 'Server error while fetching student attendance' });
  }
});

// @route   POST /api/students/bulk-import
// @desc    Import multiple students from CSV data
// @access  Private (Admin only)
router.post('/bulk-import', auth, authorize('admin'), [
  body('students').isArray().withMessage('Students must be an array'),
  body('students.*.name').trim().isLength({ min: 2 }).withMessage('Name is required'),
  body('students.*.email').isEmail().normalizeEmail().withMessage('Valid email is required'),
  body('students.*.rollNumber').trim().isLength({ min: 1 }).withMessage('Roll number is required'),
  body('students.*.department').optional().trim(),
  body('students.*.year').optional().trim()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { students } = req.body;
    const results = {
      successful: [],
      failed: []
    };

    for (const studentData of students) {
      try {
        // Check if student already exists
        const existingStudent = await User.findOne({
          $or: [
            { email: studentData.email },
            { rollNumber: studentData.rollNumber }
          ]
        });

        if (existingStudent) {
          results.failed.push({
            ...studentData,
            error: 'Student already exists with this email or roll number'
          });
          continue;
        }

        // Create new student
        const student = new User({
          name: studentData.name,
          email: studentData.email,
          password: 'defaultPassword123', // Students will need to change this
          role: 'student',
          rollNumber: studentData.rollNumber,
          department: studentData.department,
          year: studentData.year
        });

        await student.save();
        results.successful.push({
          id: student._id,
          name: student.name,
          email: student.email,
          rollNumber: student.rollNumber
        });
      } catch (error) {
        results.failed.push({
          ...studentData,
          error: error.message
        });
      }
    }

    res.json({
      message: `Import completed. ${results.successful.length} successful, ${results.failed.length} failed.`,
      results
    });
  } catch (error) {
    console.error('Bulk import error:', error);
    res.status(500).json({ message: 'Server error during bulk import' });
  }
});

module.exports = router;
