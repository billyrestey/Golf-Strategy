import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import multer from 'multer';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs';

import authRoutes, { authenticateToken, optionalAuth } from './routes/auth.js';
import paymentRoutes from './routes/payments.js';
import { analyzeGolfGame } from './services/claude.js';
import { generateStrategyPDF, generatePracticePlanPDF } from './services/pdf.js';
import { 
  saveAnalysis, 
  getAnalysesByUser, 
  getAnalysisById,
  getUserCredits,
  decrementCredits,
  saveRound,
  getRoundsByUser,
  getUserStats
} from './db/database.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Ensure data directory exists
const dataDir = join(__dirname, 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true
}));

// JSON parsing (but not for Stripe webhook)
app.use((req, res, next) => {
  if (req.originalUrl === '/api/payments/webhook') {
    next();
  } else {
    express.json({ limit: '50mb' })(req, res, next);
  }
});

// Configure multer for file uploads
const storage = multer.memoryStorage();
const upload = multer({ 
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'));
    }
  }
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/payments', paymentRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Main analysis endpoint
app.post('/api/analyze', authenticateToken, upload.array('scorecards', 10), async (req, res) => {
  try {
    const { name, handicap, homeCourse, missPattern, missDescription, strengths } = req.body;
    const userId = req.user.userId;

    // Check credits/subscription
    const userCredits = getUserCredits(userId);
    if (userCredits.subscription_status !== 'pro' && userCredits.credits <= 0) {
      return res.status(403).json({ 
        error: 'No credits remaining',
        needsUpgrade: true 
      });
    }

    // Parse strengths if it's a string
    const parsedStrengths = typeof strengths === 'string' ? JSON.parse(strengths) : strengths;
    
    // Convert uploaded files to base64
    const scorecardImages = req.files?.map(file => ({
      type: 'image',
      source: {
        type: 'base64',
        media_type: file.mimetype,
        data: file.buffer.toString('base64')
      }
    })) || [];

    // Validate required fields
    if (!name || !handicap || !homeCourse || !missPattern) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Call Claude for analysis
    const analysis = await analyzeGolfGame({
      name,
      handicap: parseFloat(handicap),
      homeCourse,
      missPattern,
      missDescription: missDescription || '',
      strengths: parsedStrengths || [],
      scorecardImages
    });

    // Save analysis to database
    const analysisId = saveAnalysis(userId, {
      name,
      handicap: parseFloat(handicap),
      homeCourse,
      missPattern,
      analysis
    });

    // Decrement credits if not pro
    if (userCredits.subscription_status !== 'pro') {
      decrementCredits(userId);
    }

    res.json({ 
      success: true, 
      analysis,
      analysisId,
      creditsRemaining: userCredits.subscription_status === 'pro' 
        ? 'unlimited' 
        : userCredits.credits - 1
    });

  } catch (error) {
    console.error('Analysis error:', error);
    res.status(500).json({ error: error.message || 'Analysis failed' });
  }
});

// Get user's past analyses
app.get('/api/analyses', authenticateToken, (req, res) => {
  try {
    const analyses = getAnalysesByUser(req.user.userId);
    res.json({ analyses });
  } catch (error) {
    console.error('Get analyses error:', error);
    res.status(500).json({ error: 'Failed to get analyses' });
  }
});

// Get specific analysis
app.get('/api/analyses/:id', authenticateToken, (req, res) => {
  try {
    const analysis = getAnalysisById(parseInt(req.params.id), req.user.userId);
    if (!analysis) {
      return res.status(404).json({ error: 'Analysis not found' });
    }
    res.json({ analysis });
  } catch (error) {
    console.error('Get analysis error:', error);
    res.status(500).json({ error: 'Failed to get analysis' });
  }
});

// Generate PDF for analysis
app.get('/api/analyses/:id/pdf', authenticateToken, async (req, res) => {
  try {
    const analysis = getAnalysisById(parseInt(req.params.id), req.user.userId);
    if (!analysis) {
      return res.status(404).json({ error: 'Analysis not found' });
    }

    const pdfType = req.query.type || 'strategy'; // 'strategy' or 'practice'
    
    const userData = {
      name: analysis.name,
      handicap: analysis.handicap,
      homeCourse: analysis.home_course,
      missPattern: analysis.miss_pattern
    };

    let pdfBuffer;
    let filename;

    if (pdfType === 'practice') {
      pdfBuffer = await generatePracticePlanPDF(analysis.analysis_json, userData);
      filename = `${userData.name.replace(/\s+/g, '_')}_Practice_Plan.pdf`;
    } else {
      pdfBuffer = await generateStrategyPDF(analysis.analysis_json, userData);
      filename = `${userData.name.replace(/\s+/g, '_')}_Strategy_Card.pdf`;
    }

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(pdfBuffer);

  } catch (error) {
    console.error('PDF generation error:', error);
    res.status(500).json({ error: 'Failed to generate PDF' });
  }
});

// Round tracking endpoints
app.post('/api/rounds', authenticateToken, (req, res) => {
  try {
    const roundId = saveRound(req.user.userId, req.body.analysisId, req.body);
    res.json({ success: true, roundId });
  } catch (error) {
    console.error('Save round error:', error);
    res.status(500).json({ error: 'Failed to save round' });
  }
});

app.get('/api/rounds', authenticateToken, (req, res) => {
  try {
    const rounds = getRoundsByUser(req.user.userId);
    res.json({ rounds });
  } catch (error) {
    console.error('Get rounds error:', error);
    res.status(500).json({ error: 'Failed to get rounds' });
  }
});

app.get('/api/stats', authenticateToken, (req, res) => {
  try {
    const stats = getUserStats(req.user.userId);
    res.json({ stats });
  } catch (error) {
    console.error('Get stats error:', error);
    res.status(500).json({ error: 'Failed to get stats' });
  }
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: err.message || 'Something went wrong' });
});

app.listen(PORT, () => {
  console.log(`🏌️ Fairway Strategy server running on port ${PORT}`);
});
