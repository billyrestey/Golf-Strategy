import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Ensure data directory exists BEFORE creating database
const dataDir = join(__dirname, '../data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const db = new Database(join(dataDir, 'fairway.db'));

// Initialize database tables
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    name TEXT,
    handicap REAL,
    target_handicap REAL,
    home_course TEXT,
    ghin_number TEXT,
    subscription_status TEXT DEFAULT 'free',
    subscription_id TEXT,
    credits INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS analyses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    name TEXT,
    handicap REAL,
    home_course TEXT,
    miss_pattern TEXT,
    analysis_json TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS rounds (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    analysis_id INTEGER,
    date DATE,
    course TEXT,
    total_score INTEGER,
    fairways_hit INTEGER,
    gir INTEGER,
    putts INTEGER,
    penalties INTEGER,
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (analysis_id) REFERENCES analyses(id)
  );

  CREATE TABLE IF NOT EXISTS course_strategies (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    course_name TEXT NOT NULL,
    tees TEXT,
    strategy_json TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
  CREATE INDEX IF NOT EXISTS idx_analyses_user ON analyses(user_id);
  CREATE INDEX IF NOT EXISTS idx_rounds_user ON rounds(user_id);
  CREATE INDEX IF NOT EXISTS idx_course_strategies_user ON course_strategies(user_id);
`);

// Migration: Add target_handicap column if it doesn't exist
try {
  const tableInfo = db.prepare("PRAGMA table_info(users)").all();
  const hasTargetHandicap = tableInfo.some(col => col.name === 'target_handicap');
  if (!hasTargetHandicap) {
    db.exec('ALTER TABLE users ADD COLUMN target_handicap REAL');
    console.log('Migration: Added target_handicap column to users table');
  } else {
    console.log('Migration: target_handicap column already exists');
  }
} catch (err) {
  // Ignore "duplicate column" errors - column already exists
  if (!err.message.includes('duplicate column')) {
    console.error('Migration error:', err);
  }
}

// User functions
export const createUser = (email, passwordHash, name = null) => {
  const stmt = db.prepare(`
    INSERT INTO users (email, password_hash, name) 
    VALUES (?, ?, ?)
  `);
  const result = stmt.run(email, passwordHash, name);
  return result.lastInsertRowid;
};

export const findUserByEmail = (email) => {
  const stmt = db.prepare('SELECT * FROM users WHERE email = ?');
  return stmt.get(email);
};

export const findUserById = (id) => {
  const stmt = db.prepare('SELECT * FROM users WHERE id = ?');
  return stmt.get(id);
};

export const updateUser = (id, updates) => {
  const fields = Object.keys(updates);
  const values = Object.values(updates);
  const setClause = fields.map(f => `${f} = ?`).join(', ');
  
  const stmt = db.prepare(`
    UPDATE users SET ${setClause}, updated_at = CURRENT_TIMESTAMP 
    WHERE id = ?
  `);
  return stmt.run(...values, id);
};

export const decrementCredits = (userId) => {
  const stmt = db.prepare(`
    UPDATE users SET credits = credits - 1, updated_at = CURRENT_TIMESTAMP 
    WHERE id = ? AND credits > 0
  `);
  return stmt.run(userId);
};

export const getUserCredits = (userId) => {
  const stmt = db.prepare('SELECT credits, subscription_status FROM users WHERE id = ?');
  return stmt.get(userId);
};

// Analysis functions
export const saveAnalysis = (userId, data) => {
  const stmt = db.prepare(`
    INSERT INTO analyses (user_id, name, handicap, home_course, miss_pattern, analysis_json)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  const result = stmt.run(
    userId,
    data.name,
    data.handicap,
    data.homeCourse,
    data.missPattern,
    JSON.stringify(data.analysis)
  );
  return result.lastInsertRowid;
};

export const getAnalysesByUser = (userId) => {
  const stmt = db.prepare(`
    SELECT id, name, handicap, home_course, miss_pattern, created_at 
    FROM analyses 
    WHERE user_id = ? 
    ORDER BY created_at DESC
  `);
  return stmt.all(userId);
};

export const getAnalysisById = (id, userId) => {
  const stmt = db.prepare(`
    SELECT * FROM analyses WHERE id = ? AND user_id = ?
  `);
  const row = stmt.get(id, userId);
  if (row) {
    row.analysis_json = JSON.parse(row.analysis_json);
  }
  return row;
};

// Round tracking functions
export const saveRound = (userId, analysisId, data) => {
  const stmt = db.prepare(`
    INSERT INTO rounds (user_id, analysis_id, date, course, total_score, fairways_hit, gir, putts, penalties, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const result = stmt.run(
    userId,
    analysisId,
    data.date,
    data.course,
    data.totalScore,
    data.fairwaysHit,
    data.gir,
    data.putts,
    data.penalties,
    data.notes
  );
  return result.lastInsertRowid;
};

export const getRoundsByUser = (userId, limit = 20) => {
  const stmt = db.prepare(`
    SELECT * FROM rounds 
    WHERE user_id = ? 
    ORDER BY date DESC 
    LIMIT ?
  `);
  return stmt.all(userId, limit);
};

export const getUserStats = (userId) => {
  const stmt = db.prepare(`
    SELECT 
      COUNT(*) as total_rounds,
      AVG(total_score) as avg_score,
      MIN(total_score) as best_score,
      AVG(fairways_hit) as avg_fairways,
      AVG(gir) as avg_gir,
      AVG(putts) as avg_putts,
      AVG(penalties) as avg_penalties
    FROM rounds 
    WHERE user_id = ?
  `);
  return stmt.get(userId);
};

// Course Strategy functions
export const saveCourseStrategy = (userId, data) => {
  const stmt = db.prepare(`
    INSERT INTO course_strategies (user_id, course_name, tees, strategy_json)
    VALUES (?, ?, ?, ?)
  `);
  const result = stmt.run(
    userId,
    data.courseName,
    data.tees || '',
    JSON.stringify(data.strategy)
  );
  return result.lastInsertRowid;
};

export const getCourseStrategiesByUser = (userId) => {
  const stmt = db.prepare(`
    SELECT id, course_name, tees, created_at 
    FROM course_strategies 
    WHERE user_id = ? 
    ORDER BY created_at DESC
  `);
  return stmt.all(userId);
};

export const getCourseStrategyById = (id, userId) => {
  const stmt = db.prepare(`
    SELECT * FROM course_strategies WHERE id = ? AND user_id = ?
  `);
  const row = stmt.get(id, userId);
  if (row && row.strategy_json) {
    row.strategy_json = JSON.parse(row.strategy_json);
  }
  return row;
};

export default db;
