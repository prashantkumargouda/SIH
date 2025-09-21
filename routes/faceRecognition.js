const express = require('express');
const { body, validationResult } = require('express-validator');
const User = require('../models/User');
const { auth } = require('../middleware/auth');

const router = express.Router();

// @route   POST /api/face-recognition/register
// @desc    Register face embedding for a student
// @access  Private (Student only)
router.post('/register', auth, [
  body('faceEmbedding').isArray({ min: 128 }).withMessage('Face embedding must be an array with at least 128 values'),
  body('faceEmbedding.*').isNumeric().withMessage('All embedding values must be numbers')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { faceEmbedding } = req.body;

    // Validate embedding length (face-api.js typically uses 128-dimensional embeddings)
    if (faceEmbedding.length !== 128) {
      return res.status(400).json({ 
        message: 'Face embedding must be exactly 128 dimensions' 
      });
    }

    // Check if user is a student
    if (req.user.role !== 'student') {
      return res.status(403).json({ 
        message: 'Only students can register face embeddings' 
      });
    }

    // Update user with face embedding
    const user = await User.findByIdAndUpdate(
      req.user._id,
      { faceEmbedding },
      { new: true, runValidators: true }
    ).select('-password');

    res.json({
      message: 'Face registered successfully',
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        hasFaceEmbedding: user.faceEmbedding.length > 0
      }
    });
  } catch (error) {
    console.error('Face registration error:', error);
    res.status(500).json({ message: 'Server error during face registration' });
  }
});

// @route   POST /api/face-recognition/verify
// @desc    Verify face against registered embedding
// @access  Private (Student only)
router.post('/verify', auth, [
  body('faceEmbedding').isArray({ min: 128 }).withMessage('Face embedding must be an array with at least 128 values'),
  body('faceEmbedding.*').isNumeric().withMessage('All embedding values must be numbers'),
  body('threshold').optional().isFloat({ min: 0, max: 1 }).withMessage('Threshold must be between 0 and 1')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { faceEmbedding, threshold = 0.6 } = req.body;

    // Check if user has registered face
    if (!req.user.faceEmbedding || req.user.faceEmbedding.length === 0) {
      return res.status(400).json({ 
        message: 'No face registered. Please register your face first.' 
      });
    }

    // Calculate cosine similarity between embeddings
    const similarity = calculateCosineSimilarity(req.user.faceEmbedding, faceEmbedding);
    
    const isMatch = similarity >= threshold;
    const confidence = similarity;

    res.json({
      isMatch,
      confidence,
      threshold,
      message: isMatch 
        ? 'Face verification successful' 
        : 'Face verification failed. Please try again.'
    });
  } catch (error) {
    console.error('Face verification error:', error);
    res.status(500).json({ message: 'Server error during face verification' });
  }
});

// @route   GET /api/face-recognition/status
// @desc    Check if user has registered face
// @access  Private
router.get('/status', auth, async (req, res) => {
  try {
    const hasFaceEmbedding = req.user.faceEmbedding && req.user.faceEmbedding.length > 0;
    
    res.json({
      hasFaceEmbedding,
      message: hasFaceEmbedding 
        ? 'Face is registered' 
        : 'No face registered'
    });
  } catch (error) {
    console.error('Face status error:', error);
    res.status(500).json({ message: 'Server error while checking face status' });
  }
});

// @route   DELETE /api/face-recognition/remove
// @desc    Remove face embedding
// @access  Private (Student only)
router.delete('/remove', auth, async (req, res) => {
  try {
    // Check if user is a student
    if (req.user.role !== 'student') {
      return res.status(403).json({ 
        message: 'Only students can remove face embeddings' 
      });
    }

    // Remove face embedding
    const user = await User.findByIdAndUpdate(
      req.user._id,
      { faceEmbedding: [] },
      { new: true, runValidators: true }
    ).select('-password');

    res.json({
      message: 'Face embedding removed successfully',
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        hasFaceEmbedding: false
      }
    });
  } catch (error) {
    console.error('Face removal error:', error);
    res.status(500).json({ message: 'Server error during face removal' });
  }
});

// @route   POST /api/face-recognition/compare
// @desc    Compare two face embeddings (for testing purposes)
// @access  Private
router.post('/compare', auth, [
  body('embedding1').isArray({ min: 128 }).withMessage('First embedding must be an array with at least 128 values'),
  body('embedding2').isArray({ min: 128 }).withMessage('Second embedding must be an array with at least 128 values'),
  body('embedding1.*').isNumeric().withMessage('All first embedding values must be numbers'),
  body('embedding2.*').isNumeric().withMessage('All second embedding values must be numbers')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { embedding1, embedding2 } = req.body;

    if (embedding1.length !== 128 || embedding2.length !== 128) {
      return res.status(400).json({ 
        message: 'Both embeddings must be exactly 128 dimensions' 
      });
    }

    const similarity = calculateCosineSimilarity(embedding1, embedding2);
    
    res.json({
      similarity,
      isMatch: similarity >= 0.6,
      message: `Cosine similarity: ${similarity.toFixed(4)}`
    });
  } catch (error) {
    console.error('Face comparison error:', error);
    res.status(500).json({ message: 'Server error during face comparison' });
  }
});

// Helper function to calculate cosine similarity
function calculateCosineSimilarity(embedding1, embedding2) {
  if (embedding1.length !== embedding2.length) {
    throw new Error('Embeddings must have the same length');
  }

  let dotProduct = 0;
  let norm1 = 0;
  let norm2 = 0;

  for (let i = 0; i < embedding1.length; i++) {
    dotProduct += embedding1[i] * embedding2[i];
    norm1 += embedding1[i] * embedding1[i];
    norm2 += embedding2[i] * embedding2[i];
  }

  norm1 = Math.sqrt(norm1);
  norm2 = Math.sqrt(norm2);

  if (norm1 === 0 || norm2 === 0) {
    return 0;
  }

  return dotProduct / (norm1 * norm2);
}

module.exports = router;
