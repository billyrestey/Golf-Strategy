import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { createUser, findUserByEmail, findUserById, findUserByGhin, updateUser } from '../db/database.js';
import { authenticateUser } from '../services/ghin.js';

const router = express.Router();

// Register with GHIN - authenticate with GHIN and create/login account
router.post('/register-with-ghin', async (req, res) => {
  try {
    const { ghinEmailOrNumber, ghinPassword } = req.body;

    if (!ghinEmailOrNumber || !ghinPassword) {
      return res.status(400).json({ error: 'GHIN credentials required' });
    }

    // Authenticate with GHIN
    const ghinResult = await authenticateUser(ghinEmailOrNumber, ghinPassword);
    
    if (!ghinResult.success) {
      return res.status(401).json({ error: ghinResult.error || 'Invalid GHIN credentials' });
    }

    const golfer = ghinResult.golfer;
    const ghinToken = ghinResult.token;
    
    // Check if user already exists with this GHIN number
    let user = findUserByGhin(golfer.ghinNumber);
    let isNewUser = false;
    
    if (!user) {
      // Check by email
      user = findUserByEmail(golfer.email);
    }
    
    if (user) {
      // Existing user - update their GHIN info and log them in
      updateUser(user.id, {
        ghin_number: golfer.ghinNumber,
        handicap: golfer.handicapIndex,
        name: `${golfer.firstName} ${golfer.lastName}`
      });
    } else {
      // New user - create account with random password (they'll use GHIN to login)
      isNewUser = true;
      const randomPassword = Math.random().toString(36).slice(-12) + Math.random().toString(36).slice(-12);
      const salt = await bcrypt.genSalt(10);
      const passwordHash = await bcrypt.hash(randomPassword, salt);
      
      const userId = createUser(
        golfer.email || `ghin_${golfer.ghinNumber}@golfstrategy.app`,
        passwordHash,
        `${golfer.firstName} ${golfer.lastName}`
      );
      
      // Update with GHIN info
      updateUser(userId, {
        ghin_number: golfer.ghinNumber,
        handicap: golfer.handicapIndex
      });
      
      user = findUserById(userId);
    }

    // Generate JWT token
    const token = jwt.sign(
      { userId: user.id, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: '30d' }
    );

    res.json({
      success: true,
      isNewUser,
      token,
      ghinToken, // For fetching detailed scores
      golfer,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        handicap: user.handicap,
        ghinNumber: golfer.ghinNumber,
        credits: user.credits,
        subscriptionStatus: user.subscription_status
      }
    });

  } catch (error) {
    console.error('GHIN registration error:', error);
    res.status(500).json({ error: 'Failed to register with GHIN' });
  }
});

// Register
router.post('/register', async (req, res) => {
  try {
    const { email, password, name } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required' });
    }

    // Check if user exists
    const existingUser = findUserByEmail(email);
    if (existingUser) {
      return res.status(400).json({ error: 'Email already registered' });
    }

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    // Create user
    const userId = createUser(email, passwordHash, name);

    // Generate token
    const token = jwt.sign(
      { userId, email },
      process.env.JWT_SECRET,
      { expiresIn: '30d' }
    );

    res.status(201).json({
      success: true,
      token,
      user: {
        id: userId,
        email,
        name,
        credits: 1,
        subscriptionStatus: 'free'
      }
    });

  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Registration failed' });
  }
});

// Login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required' });
    }

    // Find user
    const user = findUserByEmail(email);
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Check password
    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Generate token
    const token = jwt.sign(
      { userId: user.id, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: '30d' }
    );

    res.json({
      success: true,
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        handicap: user.handicap,
        target_handicap: user.target_handicap,
        homeCourse: user.home_course,
        credits: user.credits,
        subscriptionStatus: user.subscription_status
      }
    });

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

// Get current user
router.get('/me', authenticateToken, (req, res) => {
  try {
    const user = findUserById(req.user.userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({
      id: user.id,
      email: user.email,
      name: user.name,
      handicap: user.handicap,
      target_handicap: user.target_handicap,
      homeCourse: user.home_course,
      credits: user.credits,
      subscriptionStatus: user.subscription_status
    });

  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ error: 'Failed to get user' });
  }
});

// Update profile
router.put('/profile', authenticateToken, (req, res) => {
  try {
    const { name, handicap, target_handicap, homeCourse } = req.body;
    
    const updates = {};
    if (name !== undefined) updates.name = name;
    if (handicap !== undefined) updates.handicap = handicap;
    if (target_handicap !== undefined) updates.target_handicap = target_handicap;
    if (homeCourse !== undefined) updates.home_course = homeCourse;

    updateUser(req.user.userId, updates);

    res.json({ success: true });

  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

// Middleware to authenticate JWT token
export function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

  if (!token) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    return res.status(403).json({ error: 'Invalid or expired token' });
  }
}

// Optional auth - attaches user if token present, but doesn't require it
export function optionalAuth(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (token) {
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      req.user = decoded;
    } catch (error) {
      // Token invalid, but we continue without user
    }
  }
  next();
}

export default router;
