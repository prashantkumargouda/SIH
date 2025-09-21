const mongoose = require('mongoose');

const sessionSchema = new mongoose.Schema({
  subject: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    trim: true
  },
  teacher: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  date: {
    type: Date,
    required: true
  },
  startTime: {
    type: String,
    required: true
  },
  endTime: {
    type: String,
    required: true
  },
  qrToken: {
    type: String,
    required: true,
    unique: true
  },
  isActive: {
    type: Boolean,
    default: true
  },
  expiresAt: {
    type: Date,
    required: true
  },
  location: {
    type: String,
    trim: true
  },
  maxStudents: {
    type: Number,
    default: 100
  },
  attendanceCount: {
    type: Number,
    default: 0
  }
}, {
  timestamps: true
});

// Index for efficient queries
sessionSchema.index({ qrToken: 1 });
sessionSchema.index({ teacher: 1, date: 1 });
sessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// Virtual for checking if session is expired
sessionSchema.virtual('isExpired').get(function() {
  return new Date() > this.expiresAt;
});

// Method to check if session is valid
sessionSchema.methods.isValid = function() {
  return this.isActive && !this.isExpired;
};

module.exports = mongoose.model('Session', sessionSchema);
