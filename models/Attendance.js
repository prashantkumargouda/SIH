const mongoose = require('mongoose');

const attendanceSchema = new mongoose.Schema({
  student: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  session: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Session',
    required: true
  },
  status: {
    type: String,
    enum: ['present', 'absent', 'late'],
    default: 'present'
  },
  markedAt: {
    type: Date,
    default: Date.now
  },
  method: {
    type: String,
    enum: ['qr_code', 'face_recognition', 'manual'],
    required: true
  },
  location: {
    latitude: Number,
    longitude: Number,
    accuracy: Number
  },
  deviceInfo: {
    userAgent: String,
    platform: String
  },
  faceConfidence: {
    type: Number,
    min: 0,
    max: 1
  },
  isVerified: {
    type: Boolean,
    default: false
  },
  remarks: {
    type: String,
    trim: true
  }
}, {
  timestamps: true
});

// Compound index to prevent duplicate attendance
attendanceSchema.index({ student: 1, session: 1 }, { unique: true });

// Index for efficient queries
attendanceSchema.index({ session: 1, status: 1 });
attendanceSchema.index({ student: 1, markedAt: -1 });
attendanceSchema.index({ markedAt: -1 });

// Virtual for checking if attendance is late
attendanceSchema.virtual('isLate').get(function() {
  if (!this.session) return false;
  
  const sessionStart = new Date(this.session.date);
  const [hours, minutes] = this.session.startTime.split(':');
  sessionStart.setHours(parseInt(hours), parseInt(minutes), 0, 0);
  
  const lateThreshold = new Date(sessionStart.getTime() + 15 * 60000); // 15 minutes
  return this.markedAt > lateThreshold;
});

// Pre-save middleware to update status based on timing
attendanceSchema.pre('save', function(next) {
  if (this.isLate && this.status === 'present') {
    this.status = 'late';
  }
  next();
});

module.exports = mongoose.model('Attendance', attendanceSchema);
