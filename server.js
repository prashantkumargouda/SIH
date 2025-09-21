const path = require('path'); 

require('dotenv').config({ path: __dirname + '/.env' });

require("dotenv").config(); 

console.log(process.env.windir); // prints your PORT from .env or system
console.log(process.env.NODE_ENV); // development / production etc.

console.log(process.env.color);

console.log("JWT_SECRET loaded:", process.env.JWT_SECRET ? "Yes" : "No");
console.log("All env keys:", Object.keys(process.env));

console.log('Loaded JWT_SECRET:', process.env.JWT_SECRET);

if (!process.env.JWT_SECRET) {
  console.error('JWT_SECRET is not defined! Check your .env file.');
  process.exit(1); // Stop the server because JWT can't work without a secret
}


const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const authRoutes = require('./routes/auth');
const sessionRoutes = require('./routes/sessions');
const attendanceRoutes = require('./routes/attendance');
const studentRoutes = require('./routes/students');
const faceRecognitionRoutes = require('./routes/faceRecognition');
const exportRoutes = require('./routes/export');

const app = express();
const PORT = process.env.PORT || 5000;

// Security middleware
app.use(helmet());
app.use(cors({
  origin: process.env.CLIENT_URL || 'http://localhost:3000',
  credentials: true
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100 // limit each IP to 100 requests per windowMs
});
app.use(limiter);

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/smart-attendance', {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
.then(() => console.log('MongoDB connected successfully'))
.catch(err => console.error('MongoDB connection error:', err));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/sessions', sessionRoutes);
app.use('/api/attendance', attendanceRoutes);
app.use('/api/students', studentRoutes);
app.use('/api/face-recognition', faceRecognitionRoutes);
app.use('/api/export', exportRoutes);

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', message: 'Smart Attendance System API is running' });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Global error handler:', err.stack);
  // Only handle errors that haven't been handled by route handlers
  if (!res.headersSent) {
    res.status(500).json({ 
      message: 'Something went wrong!', 
      error: process.env.NODE_ENV === 'production' ? 'Internal server error' : err.message 
    });
  }
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({ message: 'Route not found' });
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});


