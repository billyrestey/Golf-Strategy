import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import multer from 'multer';
import rateLimit from 'express-rate-limit';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs';

import authRoutes, { authenticateToken, optionalAuth } from './routes/auth.js';
import paymentRoutes from './routes/payments.js';
import { analyzeGolfGame } from './services/claude.js';
import { generateStrategyPDF, generatePracticePlanPDF } from './services/pdf.js';
import { lookupGHIN, getGHINScores, authenticateUser, getDetailedScores, getCourseDetails } from './services/ghin.js';
import { 
  saveAnalysis, 
  getAnalysesByUser, 
  getAnalysisById,
  getUserCredits,
  decrementCredits,
  saveRound,
  getRoundsByUser,
  getUserStats,
  updateUser,
  saveCourseStrategy,
  getCourseStrategiesByUser,
  getCourseStrategyById
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
const allowedOrigins = [
  'http://localhost:5173',
  'https://golf-strategy.vercel.app',
  'https://www.golfstrategy.app',
  'https://golfstrategy.app'
];

app.use(cors({
  origin: function(origin, callback) {
    // Allow requests with no origin (like mobile apps or curl)
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.includes(origin)) {
      callback(null, origin);
    } else {
      console.log('CORS blocked origin:', origin);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true
}));

// JSON parsing with size limit (but not for Stripe webhook)
app.use((req, res, next) => {
  if (req.originalUrl === '/api/payments/webhook') {
    next();
  } else {
    express.json({ limit: '10mb' })(req, res, next);
  }
});

// Configure multer for file uploads with security limits
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB per file
const MAX_TOTAL_SIZE = 50 * 1024 * 1024; // 50MB total
const MAX_FILES = 10;
const ALLOWED_MIMETYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];

const storage = multer.memoryStorage();
const upload = multer({ 
  storage,
  limits: { 
    fileSize: MAX_FILE_SIZE,
    files: MAX_FILES,
    fieldSize: MAX_FILE_SIZE
  },
  fileFilter: (req, file, cb) => {
    // Check mimetype
    if (ALLOWED_MIMETYPES.includes(file.mimetype) || file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error(`Invalid file type: ${file.mimetype}. Only images are allowed.`));
    }
  }
});

// Middleware to check total upload size
const checkTotalSize = (req, res, next) => {
  if (req.files && req.files.length > 0) {
    const totalSize = req.files.reduce((sum, file) => sum + file.size, 0);
    if (totalSize > MAX_TOTAL_SIZE) {
      return res.status(413).json({ 
        error: `Total upload size (${Math.round(totalSize / 1024 / 1024)}MB) exceeds limit (${MAX_TOTAL_SIZE / 1024 / 1024}MB)` 
      });
    }
  }
  next();
};

// Error handler for multer
const handleMulterError = (err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({ error: 'File too large. Maximum size is 10MB per file.' });
    }
    if (err.code === 'LIMIT_FILE_COUNT') {
      return res.status(413).json({ error: 'Too many files. Maximum is 10 files.' });
    }
    return res.status(400).json({ error: err.message });
  }
  if (err) {
    return res.status(400).json({ error: err.message });
  }
  next();
};

// Rate limiters
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // 100 requests per window
  message: { error: 'Too many requests. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

const analysisLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10, // 10 analyses per hour (generous for legitimate use, blocks abuse)
  message: { error: 'Analysis rate limit reached. Please try again in an hour.' },
  standardHeaders: true,
  legacyHeaders: false,
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20, // 20 auth attempts per 15 min
  message: { error: 'Too many login attempts. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Apply general rate limit to all routes
app.use(generalLimiter);

// Routes
app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/payments', paymentRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Main analysis endpoint - supports both preview and authenticated modes
app.post('/api/analyze', analysisLimiter, optionalAuth, upload.array('scorecards', 10), handleMulterError, checkTotalSize, async (req, res) => {
  try {
    const { name, handicap, homeCourse, missPattern, missDescription, strengths, preview, ghinScores } = req.body;
    const isPreview = preview === 'true';
    const userId = req.user?.userId;

    // If not preview mode, require auth and check credits
    if (!isPreview) {
      if (!userId) {
        return res.status(401).json({ error: 'Authentication required' });
      }
      
      const userCredits = getUserCredits(userId);
      if (userCredits.subscription_status !== 'pro' && userCredits.credits <= 0) {
        return res.status(403).json({ 
          error: 'No credits remaining',
          needsUpgrade: true 
        });
      }
    }

    // Parse strengths if it's a string
    const parsedStrengths = typeof strengths === 'string' ? JSON.parse(strengths) : strengths;
    
    // Parse GHIN scores if provided
    const parsedGhinScores = ghinScores ? (typeof ghinScores === 'string' ? JSON.parse(ghinScores) : ghinScores) : null;
    
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
      scorecardImages,
      ghinScores: parsedGhinScores
    });

    // Preview mode - just return analysis, don't save or charge
    if (isPreview) {
      return res.json({ 
        success: true, 
        analysis,
        preview: true
      });
    }

    // Full mode - save and charge credits
    const analysisId = saveAnalysis(userId, {
      name,
      handicap: parseFloat(handicap),
      homeCourse,
      missPattern,
      analysis
    });

    const userCredits = getUserCredits(userId);
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

// Save analysis after signup (for preview-to-full conversion)
app.post('/api/analyses/save', authenticateToken, async (req, res) => {
  try {
    const { name, handicap, homeCourse, missPattern, analysis } = req.body;
    const userId = req.user.userId;

    // Check credits
    const userCredits = getUserCredits(userId);
    if (userCredits.subscription_status !== 'pro' && userCredits.credits <= 0) {
      return res.status(403).json({ 
        error: 'No credits remaining',
        needsUpgrade: true 
      });
    }

    // Save analysis
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
      analysisId,
      creditsRemaining: userCredits.subscription_status === 'pro'
        ? 'unlimited'
        : userCredits.credits - 1
    });

  } catch (error) {
    console.error('Save analysis error:', error);
    res.status(500).json({ error: 'Failed to save analysis' });
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

// Public GHIN Lookup (no auth required - for signup flow)
// IMPORTANT: This must come BEFORE /api/ghin/:ghinNumber to avoid route conflict
app.get('/api/ghin/lookup/:ghinNumber', async (req, res) => {
  try {
    const { ghinNumber } = req.params;
    const result = await lookupGHIN(ghinNumber);
    
    if (result.success) {
      // Return limited info for public lookup
      res.json({
        success: true,
        golfer: {
          firstName: result.golfer.firstName,
          lastName: result.golfer.lastName,
          handicapIndex: result.golfer.handicapIndex,
          club: result.golfer.club,
          state: result.golfer.state
        }
      });
    } else {
      res.status(404).json(result);
    }
  } catch (error) {
    console.error('Public GHIN lookup error:', error);
    res.status(500).json({ error: 'Failed to lookup GHIN', requiresManualEntry: true });
  }
});

// GHIN Handicap Lookup (authenticated)
app.get('/api/ghin/:ghinNumber', authenticateToken, async (req, res) => {
  try {
    const { ghinNumber } = req.params;
    const result = await lookupGHIN(ghinNumber);
    
    if (result.success) {
      res.json(result);
    } else {
      res.status(404).json(result);
    }
  } catch (error) {
    console.error('GHIN lookup error:', error);
    res.status(500).json({ error: 'Failed to lookup GHIN' });
  }
});

// Link GHIN to user account and update handicap
app.post('/api/ghin/link', authenticateToken, async (req, res) => {
  try {
    const { ghinNumber } = req.body;
    const result = await lookupGHIN(ghinNumber);
    
    if (!result.success) {
      return res.status(404).json({ error: 'GHIN number not found' });
    }
    
    // Update user with GHIN number and current handicap
    updateUser(req.user.userId, {
      ghin_number: ghinNumber,
      handicap: result.data.handicapIndex,
      name: result.data.firstName + ' ' + result.data.lastName
    });
    
    res.json({
      success: true,
      ghin: result.data
    });
  } catch (error) {
    console.error('GHIN link error:', error);
    res.status(500).json({ error: 'Failed to link GHIN' });
  }
});

// Refresh handicap from GHIN
app.post('/api/ghin/refresh', authenticateToken, async (req, res) => {
  try {
    const { ghinNumber } = req.body;
    const result = await lookupGHIN(ghinNumber);
    
    if (!result.success) {
      return res.status(404).json({ error: 'Could not refresh handicap' });
    }
    
    // Update user's handicap
    updateUser(req.user.userId, {
      handicap: result.data.handicapIndex
    });
    
    res.json({
      success: true,
      handicapIndex: result.data.handicapIndex,
      trend: result.data.trend,
      lastRevision: result.data.lastRevision
    });
  } catch (error) {
    console.error('GHIN refresh error:', error);
    res.status(500).json({ error: 'Failed to refresh handicap' });
  }
});

// Get GHIN score history
app.get('/api/ghin/:ghinNumber/scores', authenticateToken, async (req, res) => {
  try {
    const { ghinNumber } = req.params;
    const result = await getGHINScores(ghinNumber);
    res.json(result);
  } catch (error) {
    console.error('GHIN scores error:', error);
    res.status(500).json({ error: 'Failed to get GHIN scores' });
  }
});

// Connect GHIN account with user credentials (for detailed score access)
// Uses optionalAuth so it works during signup flow before user is logged in
app.post('/api/ghin/connect', optionalAuth, async (req, res) => {
  try {
    const { emailOrGhin, password } = req.body;
    
    if (!emailOrGhin || !password) {
      return res.status(400).json({ error: 'GHIN email/number and password required' });
    }

    // Authenticate with GHIN using user's credentials
    const authResult = await authenticateUser(emailOrGhin, password);
    
    if (!authResult.success) {
      return res.status(401).json({ error: authResult.error });
    }

    // If user is logged in, update their profile with GHIN info
    if (req.user?.userId) {
      updateUser(req.user.userId, {
        ghin_number: authResult.golfer.ghinNumber,
        handicap: authResult.golfer.handicapIndex,
        name: `${authResult.golfer.firstName} ${authResult.golfer.lastName}`
      });
    }

    res.json({
      success: true,
      golfer: authResult.golfer,
      ghinToken: authResult.token // Client stores this for fetching scores
    });
  } catch (error) {
    console.error('GHIN connect error:', error);
    res.status(500).json({ error: 'Failed to connect GHIN account' });
  }
});

// Get detailed scores with hole-by-hole data using user's GHIN token
// Uses optionalAuth so it works during signup flow
app.post('/api/ghin/detailed-scores', optionalAuth, async (req, res) => {
  try {
    const { ghinNumber, ghinToken, limit } = req.body;
    
    if (!ghinNumber || !ghinToken) {
      return res.status(400).json({ error: 'GHIN number and token required' });
    }

    const result = await getDetailedScores(ghinNumber, ghinToken, limit || 20);
    
    if (result.success) {
      res.json(result);
    } else {
      res.status(400).json(result);
    }
  } catch (error) {
    console.error('GHIN detailed scores error:', error);
    res.status(500).json({ error: 'Failed to fetch detailed scores' });
  }
});

// Get course details (holes, pars, yardages)
app.post('/api/ghin/course-details', optionalAuth, async (req, res) => {
  try {
    const { courseId, ghinToken } = req.body;
    
    if (!courseId || !ghinToken) {
      return res.status(400).json({ error: 'Course ID and GHIN token required' });
    }

    const result = await getCourseDetails(courseId, ghinToken);
    
    if (result.success) {
      res.json(result);
    } else {
      res.status(400).json(result);
    }
  } catch (error) {
    console.error('Course details error:', error);
    res.status(500).json({ error: 'Failed to fetch course details' });
  }
});

// Course Strategy endpoint
app.post('/api/course-strategy', authenticateToken, upload.single('scorecard'), async (req, res) => {
  try {
    const { courseName, tees, notes, handicap, missPattern } = req.body;
    
    if (!courseName) {
      return res.status(400).json({ error: 'Course name is required' });
    }

    // Build the prompt for Claude
    let scorecardInfo = '';
    if (req.file) {
      // Convert image to base64
      const base64Image = req.file.buffer.toString('base64');
      const mimeType = req.file.mimetype;
      scorecardInfo = `\n\nI've also uploaded a scorecard image which shows the hole-by-hole details.`;
    }

    const prompt = `I'm about to play ${courseName}${tees ? ` from the ${tees}` : ''}.

My handicap is ${handicap || 15} and my typical miss is a ${missPattern || 'slice'}.

${notes ? `Additional notes: ${notes}` : ''}${scorecardInfo}

Please provide a course strategy for me. Research what you know about this course and give me:

1. A brief overview of the course (style, difficulty, notable features)
2. The 3-5 most important holes I should know about, with specific strategy for each
3. 4-5 general strategy tips for playing this course given my handicap and miss pattern
4. Realistic scoring targets (great round, solid round, what to stay under)
5. A pre-round checklist of things to remember

Format your response as JSON with this structure:
{
  "courseName": "Course Name",
  "tees": "Tees being played",
  "overview": "Course overview paragraph",
  "keyHoles": [
    {
      "number": 7,
      "par": 4,
      "yardage": "420",
      "strategy": "Strategy for this hole",
      "danger": "What to avoid"
    }
  ],
  "generalStrategy": [
    {
      "title": "Strategy Title",
      "description": "Detailed description"
    }
  ],
  "scoringTargets": {
    "great": 82,
    "solid": 88,
    "max": 95
  },
  "preRoundChecklist": [
    "Item 1",
    "Item 2"
  ]
}`;

    // Call Claude API
    const Anthropic = (await import('@anthropic-ai/sdk')).default;
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    const messageContent = [];
    
    // Add image if uploaded
    if (req.file) {
      messageContent.push({
        type: 'image',
        source: {
          type: 'base64',
          media_type: req.file.mimetype,
          data: req.file.buffer.toString('base64')
        }
      });
    }
    
    messageContent.push({
      type: 'text',
      text: prompt
    });

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4000,
      messages: [
        {
          role: 'user',
          content: messageContent
        }
      ]
    });

    // Parse the response
    const responseText = response.content[0].text;
    
    // Extract JSON from response
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('Failed to parse course strategy response');
    }
    
    const strategy = JSON.parse(jsonMatch[0]);

    // Save to database
    const strategyId = saveCourseStrategy(req.user.userId, {
      courseName: courseName,
      tees: tees,
      strategy: strategy
    });

    res.json({ success: true, strategy, strategyId });

  } catch (error) {
    console.error('Course strategy error:', error);
    res.status(500).json({ error: 'Failed to generate course strategy' });
  }
});

// Get all course strategies for user
app.get('/api/course-strategies', authenticateToken, (req, res) => {
  try {
    const strategies = getCourseStrategiesByUser(req.user.userId);
    res.json({ strategies });
  } catch (error) {
    console.error('Error fetching course strategies:', error);
    res.status(500).json({ error: 'Failed to fetch course strategies' });
  }
});

// Get single course strategy
app.get('/api/course-strategies/:id', authenticateToken, (req, res) => {
  try {
    const strategy = getCourseStrategyById(req.params.id, req.user.userId);
    if (!strategy) {
      return res.status(404).json({ error: 'Course strategy not found' });
    }
    res.json({ strategy });
  } catch (error) {
    console.error('Error fetching course strategy:', error);
    res.status(500).json({ error: 'Failed to fetch course strategy' });
  }
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: err.message || 'Something went wrong' });
});

app.listen(PORT, () => {
  console.log(`🏌️ Golf Strategy server running on port ${PORT}`);
});
