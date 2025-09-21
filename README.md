# Smart Attendance System

A comprehensive full-stack web application for managing attendance using QR codes and face recognition technology. Built with React, Node.js, Express, and MongoDB.

## Features

### 🎯 Core Functionality
- **QR Code Attendance**: Teachers generate unique QR codes for each session, students scan to mark attendance
- **Face Recognition**: Students can register their face and use it for secure attendance marking
- **Real-time Tracking**: Live attendance monitoring and statistics
- **Mobile Responsive**: Works seamlessly on desktop and mobile devices

### 👨‍🏫 Teacher Features
- Create and manage class sessions
- Generate unique QR codes for each session
- View real-time attendance statistics
- Export attendance reports to CSV/Excel
- Student management and monitoring
- Session analytics and insights

### 👨‍🎓 Student Features
- Scan QR codes to mark attendance
- Register face for biometric attendance
- View personal attendance history
- Track attendance statistics
- Mobile-friendly interface

### 🔒 Security Features
- JWT-based authentication
- QR code expiration after session ends
- Face recognition verification
- Secure session management
- Role-based access control

## Technology Stack

### Backend
- **Node.js** with Express.js
- **MongoDB** with Mongoose ODM
- **JWT** for authentication
- **QR Code** generation and validation
- **Face Recognition** with face-api.js
- **CSV/Excel** export functionality

### Frontend
- **React 18** with TypeScript
- **Tailwind CSS** for styling
- **React Router** for navigation
- **Axios** for API calls
- **face-api.js** for face recognition
- **QR Code Scanner** for attendance marking

## Installation & Setup

### Prerequisites
- Node.js (v14 or higher)
- MongoDB (v4.4 or higher)
- npm or yarn

### Backend Setup

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd smart-attendance-system
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Environment Configuration**
   ```bash
   cp env.example .env
   ```
   
   Update the `.env` file with your configuration:
   ```env
   NODE_ENV=development
   PORT=5000
   MONGODB_URI=mongodb://localhost:27017/smart-attendance
   JWT_SECRET=your-super-secret-jwt-key-here
   CLIENT_URL=http://localhost:3000
   QR_CODE_EXPIRY_MINUTES=60
   FACE_RECOGNITION_THRESHOLD=0.6
   ```

4. **Start the backend server**
   ```bash
   npm run dev
   ```

### Frontend Setup

1. **Navigate to client directory**
   ```bash
   cd client
   ```

2. **Install dependencies**
   ```bash
   npm install --legacy-peer-deps
   ```

3. **Start the development server**
   ```bash
   npm start
   ```

4. **Access the application**
   - Frontend: http://localhost:3000
   - Backend API: http://localhost:5000

## API Endpoints

### Authentication
- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - User login
- `GET /api/auth/me` - Get current user
- `PUT /api/auth/profile` - Update user profile

### Sessions (Teacher)
- `POST /api/sessions` - Create new session
- `GET /api/sessions` - Get all sessions
- `GET /api/sessions/:id` - Get session details
- `PUT /api/sessions/:id` - Update session
- `DELETE /api/sessions/:id` - Delete session
- `POST /api/sessions/:id/regenerate-qr` - Regenerate QR code

### Attendance
- `POST /api/attendance/scan-qr` - Mark attendance via QR scan
- `GET /api/attendance/my-attendance` - Get student attendance
- `GET /api/attendance/session/:sessionId` - Get session attendance
- `PUT /api/attendance/:id` - Update attendance record
- `DELETE /api/attendance/:id` - Delete attendance record

### Face Recognition
- `POST /api/face-recognition/register` - Register face embedding
- `POST /api/face-recognition/verify` - Verify face
- `GET /api/face-recognition/status` - Check face registration status
- `DELETE /api/face-recognition/remove` - Remove face embedding

### Students
- `GET /api/students` - Get all students
- `GET /api/students/:id` - Get student details
- `PUT /api/students/:id` - Update student
- `DELETE /api/students/:id` - Deactivate student
- `GET /api/students/:id/attendance` - Get student attendance
- `POST /api/students/bulk-import` - Bulk import students

## Usage Guide

### For Teachers

1. **Register/Login**: Create an account with teacher role
2. **Create Session**: 
   - Go to Teacher Dashboard
   - Click "Create New Session"
   - Fill in session details (subject, date, time, location)
   - Generate QR code for the session
3. **Display QR Code**: Show the generated QR code to students
4. **Monitor Attendance**: View real-time attendance statistics
5. **Export Reports**: Download attendance data as CSV/Excel

### For Students

1. **Register/Login**: Create an account with student role
2. **Register Face** (Optional):
   - Go to Face Registration page
   - Follow instructions to capture face
   - Face will be used for secure attendance marking
3. **Mark Attendance**:
   - Go to Scan QR page
   - Scan the QR code displayed by teacher
   - Choose QR-only or Face + QR verification
4. **View Records**: Check your attendance history and statistics

## Face Recognition Setup

The application uses face-api.js for face recognition. The models need to be placed in the `public/models` directory:

1. Download face-api.js models from: https://github.com/justadudewhohacks/face-api.js/tree/master/weights
2. Place the following files in `client/public/models/`:
   - `tiny_face_detector_model-weights_manifest.json`
   - `tiny_face_detector_model-shard1`
   - `face_landmark_68_model-weights_manifest.json`
   - `face_landmark_68_model-shard1`
   - `face_recognition_model-weights_manifest.json`
   - `face_recognition_model-shard1`
   - `face_recognition_model-shard2`
   - `face_expression_model-weights_manifest.json`
   - `face_expression_model-shard1`

## Security Considerations

- QR codes expire automatically after session ends
- Face recognition uses secure embedding comparison
- JWT tokens have expiration times
- All API endpoints are protected with authentication
- Input validation and sanitization on all endpoints
- Rate limiting to prevent abuse

## Deployment

### Backend Deployment
1. Set up MongoDB Atlas or local MongoDB instance
2. Configure environment variables for production
3. Deploy to platforms like Heroku, AWS, or DigitalOcean

### Frontend Deployment
1. Build the React app: `npm run build`
2. Deploy to platforms like Netlify, Vercel, or AWS S3

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Support

For support and questions, please open an issue in the repository or contact the development team.

## Future Enhancements

- [ ] Real-time notifications
- [ ] Advanced analytics dashboard
- [ ] Integration with learning management systems
- [ ] Mobile app development
- [ ] Offline support
- [ ] Multi-language support
- [ ] Advanced reporting features
- [ ] Integration with calendar systems
