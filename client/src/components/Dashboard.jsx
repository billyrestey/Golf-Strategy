import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

export default function Dashboard({ onNewAnalysis, onViewAnalysis, onNewCourseStrategy, onViewCourseStrategy }) {
  const { user, token, refreshUser } = useAuth();
  const [analyses, setAnalyses] = useState([]);
  const [courseStrategies, setCourseStrategies] = useState([]);
  const [rounds, setRounds] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('overview');
  const [showRoundModal, setShowRoundModal] = useState(false);
  const [showGHINModal, setShowGHINModal] = useState(false);
  const [ghinNumber, setGhinNumber] = useState('');
  const [targetStrokeIndex, setTargetStrokeIndex] = useState('');
  const [ghinLoading, setGhinLoading] = useState(false);
  const [ghinError, setGhinError] = useState('');
  const [ghinData, setGhinData] = useState(null);
  const [refreshingHandicap, setRefreshingHandicap] = useState(false);
  const [roundForm, setRoundForm] = useState({
    date: new Date().toISOString().split('T')[0],
    course: '',
    totalScore: '',
    fairwaysHit: '',
    gir: '',
    putts: '',
    penalties: '',
    notes: ''
  });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [analysesRes, roundsRes, statsRes, courseRes] = await Promise.all([
        fetch(`${API_URL}/api/analyses`, {
          headers: { 'Authorization': `Bearer ${token}` }
        }),
        fetch(`${API_URL}/api/rounds`, {
          headers: { 'Authorization': `Bearer ${token}` }
        }),
        fetch(`${API_URL}/api/stats`, {
          headers: { 'Authorization': `Bearer ${token}` }
        }),
        fetch(`${API_URL}/api/course-strategies`, {
          headers: { 'Authorization': `Bearer ${token}` }
        }).catch(() => ({ ok: false })) // Handle if endpoint doesn't exist yet
      ]);

      if (analysesRes.ok) {
        const data = await analysesRes.json();
        setAnalyses(data.analyses || []);
      }
      if (roundsRes.ok) {
        const data = await roundsRes.json();
        setRounds(data.rounds || []);
      }
      if (statsRes.ok) {
        const data = await statsRes.json();
        setStats(data.stats);
      }
      if (courseRes.ok) {
        const data = await courseRes.json();
        setCourseStrategies(data.strategies || []);
      }
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  const submitRound = async (e) => {
    e.preventDefault();
    try {
      const response = await fetch(`${API_URL}/api/rounds`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          ...roundForm,
          totalScore: parseInt(roundForm.totalScore),
          fairwaysHit: roundForm.fairwaysHit ? parseInt(roundForm.fairwaysHit) : null,
          gir: roundForm.gir ? parseInt(roundForm.gir) : null,
          putts: roundForm.putts ? parseInt(roundForm.putts) : null,
          penalties: roundForm.penalties ? parseInt(roundForm.penalties) : null
        })
      });

      if (response.ok) {
        setShowRoundModal(false);
        setRoundForm({
          date: new Date().toISOString().split('T')[0],
          course: '',
          totalScore: '',
          fairwaysHit: '',
          gir: '',
          putts: '',
          penalties: '',
          notes: ''
        });
        fetchData();
      }
    } catch (error) {
      console.error('Error saving round:', error);
    }
  };

  // GHIN Functions
  const lookupGHIN = async () => {
    if (!ghinNumber.trim()) return;
    
    setGhinLoading(true);
    setGhinError('');
    
    try {
      const response = await fetch(`${API_URL}/api/ghin/${ghinNumber}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      const data = await response.json();
      
      if (data.success) {
        setGhinData(data.data);
      } else {
        setGhinError(data.error || 'GHIN number not found');
      }
    } catch (error) {
      setGhinError('Failed to lookup GHIN');
    } finally {
      setGhinLoading(false);
    }
  };

  const linkGHIN = async () => {
    setGhinLoading(true);
    
    try {
      const response = await fetch(`${API_URL}/api/ghin/link`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ ghinNumber })
      });
      
      const data = await response.json();
      
      if (data.success) {
        setShowGHINModal(false);
        setGhinNumber('');
        setGhinData(null);
        // Refresh user data to get updated handicap
        if (refreshUser) refreshUser();
      } else {
        setGhinError(data.error || 'Failed to link GHIN');
      }
    } catch (error) {
      setGhinError('Failed to link GHIN');
    } finally {
      setGhinLoading(false);
    }
  };

  const refreshHandicap = async () => {
    if (!user?.ghin_number) return;
    
    setRefreshingHandicap(true);
    
    try {
      const response = await fetch(`${API_URL}/api/ghin/refresh`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ ghinNumber: user.ghin_number })
      });
      
      const data = await response.json();
      
      if (data.success) {
        // Refresh user data
        if (refreshUser) refreshUser();
      }
    } catch (error) {
      console.error('Failed to refresh handicap:', error);
    } finally {
      setRefreshingHandicap(false);
    }
  };

  // Calculate progress toward goal
  const latestAnalysis = analyses[0];
  const currentHandicap = user?.handicap || latestAnalysis?.handicap || 15;
  const targetHandicap = user?.target_handicap || latestAnalysis?.analysis_json?.summary?.targetHandicap || Math.max(currentHandicap - 5, 0);
  const startingHandicap = currentHandicap + 5; // Assume started 3 strokes higher
  const progressPercent = Math.min(100, Math.max(0, 
    ((startingHandicap - currentHandicap) / (startingHandicap - targetHandicap)) * 100
  ));

  const formatDate = (dateStr) => {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  if (loading) {
    return (
      <div className="dashboard loading">
        <div className="loading-spinner"></div>
        <p>Loading your dashboard...</p>
      </div>
    );
  }

  return (
    <div className="dashboard">
      {/* Header */}
      <div className="dash-header">
        <div className="dash-welcome">
          <h1>Welcome back, {user?.name?.split(' ')[0] || 'Golfer'}!</h1>
          <p>Track your progress and keep improving</p>
        </div>
        <div className="dash-header-buttons">
          <button className="new-course-btn" onClick={onNewCourseStrategy}>
            + New Course Strategy
          </button>
          <button className="new-analysis-btn" onClick={onNewAnalysis}>
            + New Analysis
          </button>
        </div>
      </div>

      {/* Progress Card */}
      <div className="progress-card">
        <div className="progress-header">
          <div className="progress-title">
            <span className="progress-icon"></span>
            <h2>Stroke Index</h2>
            {user?.ghin_number && (
              <span className="ghin-badge">GHIN #{user.ghin_number}</span>
            )}
          </div>
          <div className="handicap-display">
            <span className="current-hcp">{currentHandicap.toFixed(1)}</span>
            <span className="hcp-arrow">→</span>
            <span className="target-hcp">{targetHandicap.toFixed(1)}</span>
          </div>
        </div>
        
        {/* Handicap Update Button */}
        <div className="ghin-actions">
          <button 
            className="link-ghin-btn"
            onClick={() => {
              setGhinNumber(user?.handicap?.toString() || '');
              setTargetStrokeIndex(user?.target_handicap?.toString() || '');
              setShowGHINModal(true);
            }}
          >
            ✏️ Update
          </button>
        </div>

        <div className="progress-bar-container">
          <div className="progress-bar-bg">
            <div 
              className="progress-bar-fill" 
              style={{ width: `${progressPercent}%` }}
            >
              <div className="progress-glow"></div>
            </div>
          </div>
          <div className="progress-labels">
            <span>Started: {startingHandicap.toFixed(1)}</span>
            <span className="progress-percent">{progressPercent.toFixed(0)}% there!</span>
            <span>Goal: {targetHandicap.toFixed(1)}</span>
          </div>
        </div>
        {latestAnalysis?.analysis_json?.summary?.keyInsight && (
          <div className="key-insight-mini">
            <strong>Key Focus:</strong> {latestAnalysis.analysis_json.summary.keyInsight}
          </div>
        )}
      </div>

      {/* Quick Stats */}
      {stats && stats.total_rounds > 0 && (
        <div className="quick-stats">
          <div className="stat-card">
            <div className="stat-value">{stats.total_rounds}</div>
            <div className="stat-label">Rounds Logged</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">{stats.avg_score?.toFixed(1) || '—'}</div>
            <div className="stat-label">Avg Score</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">{stats.best_score || '—'}</div>
            <div className="stat-label">Best Score</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">{stats.avg_putts?.toFixed(1) || '—'}</div>
            <div className="stat-label">Avg Putts</div>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="dash-tabs">
        <button 
          className={`tab ${activeTab === 'overview' ? 'active' : ''}`}
          onClick={() => setActiveTab('overview')}
        >
          Overview
        </button>
        <button 
          className={`tab ${activeTab === 'analyses' ? 'active' : ''}`}
          onClick={() => setActiveTab('analyses')}
        >
          Analyses ({analyses.length})
        </button>
        <button 
          className={`tab ${activeTab === 'courses' ? 'active' : ''}`}
          onClick={() => setActiveTab('courses')}
        >
          Courses ({courseStrategies.length})
        </button>
        <button 
          className={`tab ${activeTab === 'rounds' ? 'active' : ''}`}
          onClick={() => setActiveTab('rounds')}
        >
          Rounds ({rounds.length})
        </button>
      </div>

      {/* Tab Content */}
      <div className="tab-content">
        {activeTab === 'overview' && (
          <div className="overview-tab">
            {/* Recent Analysis */}
            {latestAnalysis ? (
              <div className="section">
                <h3>Latest Strategy</h3>
                <div className="analysis-card" onClick={() => onViewAnalysis(latestAnalysis.id)}>
                  <div className="analysis-info">
                    <div className="analysis-course">{latestAnalysis.home_course}</div>
                    <div className="analysis-date">{formatDate(latestAnalysis.created_at)}</div>
                    <div className="analysis-handicap">{latestAnalysis.handicap} stroke index</div>
                  </div>
                  <div className="analysis-action">
                    View Strategy →
                  </div>
                </div>
              </div>
            ) : (
              <div className="empty-state">
                <div className="empty-icon"></div>
                <h3>No analyses yet</h3>
                <p>Upload your scorecards to get your personalized strategy</p>
                <button className="primary-btn" onClick={onNewAnalysis}>
                  Create Your First Analysis
                </button>
              </div>
            )}

            {/* Quick Actions */}
            <div className="section">
              <h3>Quick Actions</h3>
              <div className="quick-actions">
                <button className="action-card" onClick={() => setShowRoundModal(true)}>
                  <span className="action-icon">📝</span>
                  <span className="action-label">Log Round</span>
                </button>
                <button className="action-card" onClick={onNewAnalysis}>
                  <span className="action-icon">🔍</span>
                  <span className="action-label">New Analysis</span>
                </button>
                <button className="action-card" onClick={() => setActiveTab('analyses')}>
                  <span className="action-icon">📋</span>
                  <span className="action-label">View Strategies</span>
                </button>
              </div>
            </div>

            {/* Practice Reminder */}
            {latestAnalysis?.analysis_json?.practicePlan && (
              <div className="section">
                <h3>This Week's Focus</h3>
                <div className="practice-reminder">
                  {latestAnalysis.analysis_json.practicePlan.weeklySchedule?.slice(0, 1).map((session, i) => (
                    <div key={i} className="practice-session-mini">
                      <div className="session-name">{session.session}</div>
                      <div className="session-duration">{session.duration}</div>
                      <div className="session-focus">{session.focus}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'analyses' && (
          <div className="analyses-tab">
            {analyses.length > 0 ? (
              <div className="analyses-list">
                {analyses.map((analysis) => (
                  <div 
                    key={analysis.id} 
                    className="analysis-card"
                    onClick={() => onViewAnalysis(analysis.id)}
                  >
                    <div className="analysis-info">
                      <div className="analysis-course">{analysis.home_course}</div>
                      <div className="analysis-meta">
                        <span>{formatDate(analysis.created_at)}</span>
                        <span>•</span>
                        <span>{analysis.handicap} stroke index</span>
                        <span>•</span>
                        <span className="miss-pattern">{analysis.miss_pattern}</span>
                      </div>
                    </div>
                    <div className="analysis-action">
                      View →
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="empty-state">
                <div className="empty-icon">📊</div>
                <h3>No analyses yet</h3>
                <p>Create your first analysis to get started</p>
                <button className="primary-btn" onClick={onNewAnalysis}>
                  Create Analysis
                </button>
              </div>
            )}
          </div>
        )}

        {activeTab === 'courses' && (
          <div className="courses-tab">
            {courseStrategies.length > 0 ? (
              <div className="courses-list">
                {courseStrategies.map((course) => (
                  <div 
                    key={course.id} 
                    className="course-card"
                    onClick={() => onViewCourseStrategy && onViewCourseStrategy(course.id)}
                  >
                    <div className="course-info">
                      <div className="course-name">{course.course_name}</div>
                      <div className="course-meta">
                        <span>{formatDate(course.created_at)}</span>
                        {course.tees && <><span>•</span><span>{course.tees}</span></>}
                      </div>
                    </div>
                    <div className="course-action">
                      View →
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="empty-state">
                <div className="empty-icon">🗺️</div>
                <h3>No course strategies yet</h3>
                <p>Generate a strategy for your next round</p>
                <button className="primary-btn" onClick={onNewCourseStrategy}>
                  New Course Strategy
                </button>
              </div>
            )}
          </div>
        )}

        {activeTab === 'rounds' && (
          <div className="rounds-tab">
            <div className="rounds-header">
              <h3>Round History</h3>
              <button className="add-round-btn" onClick={() => setShowRoundModal(true)}>
                + Log Round
              </button>
            </div>
            {rounds.length > 0 ? (
              <div className="rounds-list">
                {rounds.map((round) => (
                  <div key={round.id} className="round-card">
                    <div className="round-score">{round.total_score}</div>
                    <div className="round-info">
                      <div className="round-course">{round.course}</div>
                      <div className="round-date">{formatDate(round.date)}</div>
                    </div>
                    <div className="round-stats">
                      {round.fairways_hit && <span>FW: {round.fairways_hit}</span>}
                      {round.gir && <span>GIR: {round.gir}</span>}
                      {round.putts && <span>Putts: {round.putts}</span>}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="empty-state">
                <div className="empty-icon">🏌️</div>
                <h3>No rounds logged</h3>
                <p>Start tracking your progress by logging your rounds</p>
                <button className="primary-btn" onClick={() => setShowRoundModal(true)}>
                  Log Your First Round
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Log Round Modal */}
      {showRoundModal && (
        <div className="modal-overlay" onClick={() => setShowRoundModal(false)}>
          <div className="modal-content round-modal" onClick={e => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setShowRoundModal(false)}>×</button>
            <h2>Log Round</h2>
            <form onSubmit={submitRound}>
              <div className="form-row">
                <div className="form-group">
                  <label>Date</label>
                  <input
                    type="date"
                    value={roundForm.date}
                    onChange={e => setRoundForm(prev => ({ ...prev, date: e.target.value }))}
                    required
                  />
                </div>
                <div className="form-group">
                  <label>Score *</label>
                  <input
                    type="number"
                    value={roundForm.totalScore}
                    onChange={e => setRoundForm(prev => ({ ...prev, totalScore: e.target.value }))}
                    placeholder="85"
                    required
                  />
                </div>
              </div>
              
              <div className="form-group">
                <label>Course</label>
                <input
                  type="text"
                  value={roundForm.course}
                  onChange={e => setRoundForm(prev => ({ ...prev, course: e.target.value }))}
                  placeholder="Useless Bay G&CC"
                />
              </div>

              <div className="form-row four-col">
                <div className="form-group">
                  <label>Fairways</label>
                  <input
                    type="number"
                    value={roundForm.fairwaysHit}
                    onChange={e => setRoundForm(prev => ({ ...prev, fairwaysHit: e.target.value }))}
                    placeholder="7"
                  />
                </div>
                <div className="form-group">
                  <label>GIR</label>
                  <input
                    type="number"
                    value={roundForm.gir}
                    onChange={e => setRoundForm(prev => ({ ...prev, gir: e.target.value }))}
                    placeholder="5"
                  />
                </div>
                <div className="form-group">
                  <label>Putts</label>
                  <input
                    type="number"
                    value={roundForm.putts}
                    onChange={e => setRoundForm(prev => ({ ...prev, putts: e.target.value }))}
                    placeholder="32"
                  />
                </div>
                <div className="form-group">
                  <label>Penalties</label>
                  <input
                    type="number"
                    value={roundForm.penalties}
                    onChange={e => setRoundForm(prev => ({ ...prev, penalties: e.target.value }))}
                    placeholder="2"
                  />
                </div>
              </div>

              <div className="form-group">
                <label>Notes</label>
                <textarea
                  value={roundForm.notes}
                  onChange={e => setRoundForm(prev => ({ ...prev, notes: e.target.value }))}
                  placeholder="What went well? What to work on?"
                  rows={3}
                />
              </div>

              <button type="submit" className="submit-btn">Save Round</button>
            </form>
          </div>
        </div>
      )}

      {/* GHIN Link Modal - Supports both manual entry and GHIN login */}
      {showGHINModal && (
        <div className="modal-overlay" onClick={() => setShowGHINModal(false)}>
          <div className="modal-content ghin-modal" onClick={e => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setShowGHINModal(false)}>×</button>
            <h2>Update Stroke Index</h2>
            
            {/* If user already has GHIN connected, show sync option */}
            {user?.ghin_number && !ghinData?.showLogin ? (
              <>
                <div className="ghin-connected-banner">
                  <span className="ghin-connected-icon">✓</span>
                  <div className="ghin-connected-text">
                    <strong>GHIN Connected</strong>
                    <span>GHIN #{user.ghin_number}</span>
                  </div>
                  <button 
                    className="ghin-refresh-btn"
                    onClick={async () => {
                      setRefreshingHandicap(true);
                      setGhinError('');
                      try {
                        const response = await fetch(`${API_URL}/api/ghin/refresh`, {
                          method: 'POST',
                          headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${token}`
                          }
                        });
                        const data = await response.json();
                        if (response.ok && data.handicap) {
                          if (refreshUser) refreshUser();
                          setShowGHINModal(false);
                        } else {
                          // Token expired, need to re-login
                          setGhinData({ showLogin: true });
                        }
                      } catch (error) {
                        setGhinError('Failed to refresh. Try reconnecting.');
                        setGhinData({ showLogin: true });
                      } finally {
                        setRefreshingHandicap(false);
                      }
                    }}
                    disabled={refreshingHandicap}
                  >
                    {refreshingHandicap ? 'Syncing...' : '↻ Sync Now'}
                  </button>
                </div>
                
                <div className="form-row">
                  <div className="form-group">
                    <label>Current Stroke Index</label>
                    <input
                      type="number"
                      step="0.1"
                      value={ghinNumber || user?.handicap || ''}
                      onChange={e => setGhinNumber(e.target.value)}
                      placeholder="14.7"
                    />
                  </div>
                  <div className="form-group">
                    <label>Target Stroke Index</label>
                    <input
                      type="number"
                      step="0.1"
                      value={targetStrokeIndex || user?.target_handicap || ''}
                      onChange={e => setTargetStrokeIndex(e.target.value)}
                      placeholder="10.0"
                    />
                  </div>
                </div>
                
                {ghinError && (
                  <div className="ghin-error">{ghinError}</div>
                )}
                
                <button 
                  className="submit-btn"
                  onClick={async () => {
                    const newHandicap = ghinNumber || user?.handicap;
                    if (!newHandicap) return;
                    setGhinLoading(true);
                    try {
                      const response = await fetch(`${API_URL}/api/auth/profile`, {
                        method: 'PUT',
                        headers: {
                          'Content-Type': 'application/json',
                          'Authorization': `Bearer ${token}`
                        },
                        body: JSON.stringify({ 
                          handicap: parseFloat(newHandicap),
                          target_handicap: targetStrokeIndex ? parseFloat(targetStrokeIndex) : (user?.target_handicap || null)
                        })
                      });
                      if (response.ok) {
                        setShowGHINModal(false);
                        setGhinNumber('');
                        setTargetStrokeIndex('');
                        if (refreshUser) refreshUser();
                      } else {
                        setGhinError('Failed to update stroke index');
                      }
                    } catch (error) {
                      setGhinError('Failed to update stroke index');
                    } finally {
                      setGhinLoading(false);
                    }
                  }}
                  disabled={ghinLoading}
                >
                  {ghinLoading ? 'Saving...' : 'Update Stroke Index'}
                </button>
                
                <button 
                  className="link-btn disconnect-link"
                  onClick={() => setGhinData({ showLogin: true })}
                >
                  Reconnect different GHIN account
                </button>
              </>
            ) : !ghinData ? (
              <>
                {/* GHIN Connect Option - No GHIN connected yet */}
                <div className="ghin-connect-section">
                  <button 
                    className="ghin-connect-btn"
                    onClick={() => setGhinData({ showLogin: true })}
                  >
                    <span className="ghin-icon">⛳</span>
                    <span>Connect GHIN Account</span>
                    <span className="ghin-tag">Auto-sync</span>
                  </button>
                  <p className="ghin-connect-hint">Automatically sync your handicap from GHIN</p>
                </div>
                
                <div className="modal-divider">
                  <span>or enter manually</span>
                </div>
                
                <div className="form-row">
                  <div className="form-group">
                    <label>Current Stroke Index</label>
                    <input
                      type="number"
                      step="0.1"
                      value={ghinNumber || user?.handicap || ''}
                      onChange={e => setGhinNumber(e.target.value)}
                      placeholder="14.7"
                    />
                  </div>
                  <div className="form-group">
                    <label>Target Stroke Index</label>
                    <input
                      type="number"
                      step="0.1"
                      value={targetStrokeIndex || user?.target_handicap || ''}
                      onChange={e => setTargetStrokeIndex(e.target.value)}
                      placeholder="10.0"
                    />
                  </div>
                </div>
                
                {ghinError && (
                  <div className="ghin-error">{ghinError}</div>
                )}
                
                <button 
                  className="submit-btn"
                  onClick={async () => {
                    if (!ghinNumber.trim()) return;
                    setGhinLoading(true);
                    try {
                      const response = await fetch(`${API_URL}/api/auth/profile`, {
                        method: 'PUT',
                        headers: {
                          'Content-Type': 'application/json',
                          'Authorization': `Bearer ${token}`
                        },
                        body: JSON.stringify({ 
                          handicap: parseFloat(ghinNumber),
                          target_handicap: targetStrokeIndex ? parseFloat(targetStrokeIndex) : null
                        })
                      });
                      if (response.ok) {
                        setShowGHINModal(false);
                        setGhinNumber('');
                        setTargetStrokeIndex('');
                        if (refreshUser) refreshUser();
                      } else {
                        setGhinError('Failed to update stroke index');
                      }
                    } catch (error) {
                      setGhinError('Failed to update stroke index');
                    } finally {
                      setGhinLoading(false);
                    }
                  }}
                  disabled={ghinLoading || !ghinNumber.trim()}
                >
                  {ghinLoading ? 'Saving...' : 'Update Stroke Index'}
                </button>
              </>
            ) : ghinData.showLogin ? (
              <>
                {/* GHIN Login Form */}
                <p className="modal-description">
                  Enter your GHIN credentials to sync your handicap and recent scores.
                </p>
                
                <div className="form-group">
                  <label>GHIN Email or Number</label>
                  <input
                    type="text"
                    value={ghinData.email || ''}
                    onChange={e => setGhinData({ ...ghinData, email: e.target.value })}
                    placeholder="email@example.com or 1234567"
                  />
                </div>
                
                <div className="form-group">
                  <label>GHIN Password</label>
                  <input
                    type="password"
                    value={ghinData.password || ''}
                    onChange={e => setGhinData({ ...ghinData, password: e.target.value })}
                    placeholder="Your GHIN password"
                  />
                </div>
                
                {ghinError && (
                  <div className="ghin-error">{ghinError}</div>
                )}
                
                <button 
                  className="submit-btn ghin-submit"
                  onClick={async () => {
                    if (!ghinData.email || !ghinData.password) return;
                    setGhinLoading(true);
                    setGhinError('');
                    try {
                      const response = await fetch(`${API_URL}/api/ghin/connect`, {
                        method: 'POST',
                        headers: {
                          'Content-Type': 'application/json',
                          'Authorization': `Bearer ${token}`
                        },
                        body: JSON.stringify({ 
                          emailOrGhin: ghinData.email,
                          password: ghinData.password
                        })
                      });
                      const data = await response.json();
                      if (data.success) {
                        // Show success and update form with fetched data
                        setGhinData({ 
                          connected: true, 
                          golfer: data.golfer,
                          scores: data.scores 
                        });
                        // Update user profile with GHIN data
                        await fetch(`${API_URL}/api/auth/profile`, {
                          method: 'PUT',
                          headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${token}`
                          },
                          body: JSON.stringify({ 
                            handicap: data.golfer.handicapIndex,
                            ghin_number: data.golfer.ghinNumber,
                            name: data.golfer.playerName || `${data.golfer.firstName} ${data.golfer.lastName}`
                          })
                        });
                        if (refreshUser) refreshUser();
                      } else {
                        setGhinError(data.error || 'Failed to connect to GHIN');
                      }
                    } catch (error) {
                      setGhinError('Failed to connect to GHIN');
                    } finally {
                      setGhinLoading(false);
                    }
                  }}
                  disabled={ghinLoading || !ghinData.email || !ghinData.password}
                >
                  {ghinLoading ? 'Connecting...' : 'Connect & Sync'}
                </button>
                
                <button 
                  className="back-btn"
                  onClick={() => setGhinData(null)}
                >
                  ← Back to manual entry
                </button>
                
                <p className="ghin-privacy">
                  🔒 Your credentials are used only to fetch your data and are not stored.
                </p>
              </>
            ) : ghinData.connected ? (
              <>
                {/* GHIN Connected Success */}
                <div className="ghin-success">
                  <div className="success-icon">✓</div>
                  <h3>GHIN Connected!</h3>
                  <div className="ghin-profile">
                    <p className="golfer-name">{ghinData.golfer?.playerName || `${ghinData.golfer?.firstName} ${ghinData.golfer?.lastName}`}</p>
                    <p className="golfer-club">{ghinData.golfer?.club}</p>
                    <div className="handicap-display">
                      <span className="handicap-label">Handicap Index</span>
                      <span className="handicap-value">{ghinData.golfer?.handicapIndex}</span>
                    </div>
                  </div>
                  {ghinData.scores?.length > 0 && (
                    <p className="scores-imported">📊 {ghinData.scores.length} recent rounds imported</p>
                  )}
                </div>
                
                <div className="form-group">
                  <label>Target Stroke Index</label>
                  <input
                    type="number"
                    step="0.1"
                    value={targetStrokeIndex}
                    onChange={e => setTargetStrokeIndex(e.target.value)}
                    placeholder="10.0"
                  />
                </div>
                
                <button 
                  className="submit-btn"
                  onClick={async () => {
                    setGhinLoading(true);
                    try {
                      await fetch(`${API_URL}/api/auth/profile`, {
                        method: 'PUT',
                        headers: {
                          'Content-Type': 'application/json',
                          'Authorization': `Bearer ${token}`
                        },
                        body: JSON.stringify({ 
                          target_handicap: targetStrokeIndex ? parseFloat(targetStrokeIndex) : null
                        })
                      });
                      setShowGHINModal(false);
                      setGhinData(null);
                      setTargetStrokeIndex('');
                      if (refreshUser) refreshUser();
                    } catch (error) {
                      setGhinError('Failed to save target');
                    } finally {
                      setGhinLoading(false);
                    }
                  }}
                  disabled={ghinLoading}
                >
                  {ghinLoading ? 'Saving...' : 'Save & Close'}
                </button>
              </>
            ) : null}
          </div>
        </div>
      )}

      <style>{`
        .dashboard {
          max-width: 900px;
          margin: 0 auto;
          padding: 80px 24px 80px;
        }

        .dashboard.loading {
          min-height: 60vh;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
        }

        .loading-spinner {
          width: 48px;
          height: 48px;
          border: 4px solid rgba(124, 185, 124, 0.2);
          border-top-color: #7cb97c;
          border-radius: 50%;
          animation: spin 1s linear infinite;
          margin-bottom: 16px;
        }

        @keyframes spin {
          to { transform: rotate(360deg); }
        }

        /* Header */
        .dash-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          margin-bottom: 32px;
          flex-wrap: wrap;
          gap: 16px;
        }

        .dash-welcome h1 {
          font-family: 'Fraunces', Georgia, serif;
          font-size: 28px;
          margin-bottom: 4px;
        }

        .dash-welcome p {
          color: rgba(240, 244, 232, 0.6);
        }

        .dash-header-buttons {
          display: flex;
          gap: 12px;
          flex-wrap: wrap;
        }

        .new-course-btn {
          padding: 12px 20px;
          background: rgba(124, 185, 124, 0.15);
          color: #7cb97c;
          border: 1px solid rgba(124, 185, 124, 0.3);
          border-radius: 10px;
          font-weight: 600;
          font-size: 14px;
          cursor: pointer;
          font-family: inherit;
          transition: all 0.2s;
        }

        .new-course-btn:hover {
          background: rgba(124, 185, 124, 0.25);
          border-color: rgba(124, 185, 124, 0.5);
        }

        .new-analysis-btn {
          padding: 12px 24px;
          background: linear-gradient(135deg, #7cb97c, #5a9a5a);
          color: #0d1f0d;
          border: none;
          border-radius: 10px;
          font-weight: 600;
          font-size: 15px;
          cursor: pointer;
          font-family: inherit;
        }

        /* Progress Card */
        .progress-card {
          background: linear-gradient(135deg, rgba(124, 185, 124, 0.15), rgba(124, 185, 124, 0.05));
          border: 1px solid rgba(124, 185, 124, 0.3);
          border-radius: 16px;
          padding: 24px;
          margin-bottom: 24px;
        }

        .progress-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 20px;
          flex-wrap: wrap;
          gap: 12px;
        }

        .progress-title {
          display: flex;
          align-items: center;
          gap: 0px;
        }

        .progress-icon {
          font-size: 24px;
        }

        .progress-title h2 {
          font-size: 18px;
          font-weight: 600;
          margin: 0;
        }

        .handicap-display {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .current-hcp {
          font-family: 'Fraunces', Georgia, serif;
          font-size: 32px;
          font-weight: 700;
        }

        .hcp-arrow {
          color: rgba(240, 244, 232, 0.4);
          font-size: 20px;
        }

        .target-hcp {
          font-family: 'Fraunces', Georgia, serif;
          font-size: 32px;
          font-weight: 700;
          color: #7cb97c;
        }

        .progress-bar-container {
          margin-bottom: 16px;
        }

        .progress-bar-bg {
          height: 16px;
          background: rgba(0, 0, 0, 0.4);
          border-radius: 10px;
          overflow: visible;
          position: relative;
          border: 1px solid rgba(255, 255, 255, 0.05);
        }

        .progress-bar-fill {
          height: 100%;
          background: linear-gradient(90deg, 
            #3d6b3d 0%, 
            #5a9a5a 30%, 
            #7cb97c 60%, 
            #a8e6a8 85%,
            #d4ffd4 100%
          );
          border-radius: 10px;
          transition: width 0.6s ease;
          position: relative;
          min-width: 20px;
          box-shadow: 
            0 0 10px rgba(124, 185, 124, 0.4),
            0 0 20px rgba(124, 185, 124, 0.2);
        }

        .progress-glow {
          position: absolute;
          right: -2px;
          top: 50%;
          transform: translateY(-50%);
          width: 20px;
          height: 20px;
          background: radial-gradient(circle, 
            rgba(212, 255, 212, 1) 0%,
            rgba(168, 230, 168, 0.8) 30%,
            rgba(124, 185, 124, 0.4) 60%,
            transparent 100%
          );
          border-radius: 50%;
          filter: blur(2px);
          animation: pulse-glow 2s ease-in-out infinite;
        }

        @keyframes pulse-glow {
          0%, 100% {
            opacity: 1;
            transform: translateY(-50%) scale(1);
          }
          50% {
            opacity: 0.7;
            transform: translateY(-50%) scale(1.2);
          }
        }

        .progress-labels {
          display: flex;
          justify-content: space-between;
          margin-top: 10px;
          font-size: 12px;
          color: rgba(240, 244, 232, 0.5);
        }

        .progress-percent {
          color: #a8e6a8;
          font-weight: 600;
        }

        .key-insight-mini {
          background: rgba(0, 0, 0, 0.2);
          padding: 12px 16px;
          border-radius: 8px;
          font-size: 14px;
          line-height: 1.5;
        }

        .key-insight-mini strong {
          color: #7cb97c;
        }

        /* Quick Stats */
        .quick-stats {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 12px;
          margin-bottom: 24px;
        }

        .stat-card {
          background: rgba(255, 255, 255, 0.03);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 12px;
          padding: 16px;
          text-align: center;
        }

        .stat-value {
          font-family: 'Fraunces', Georgia, serif;
          font-size: 24px;
          font-weight: 700;
          color: #7cb97c;
        }

        .stat-label {
          font-size: 11px;
          text-transform: uppercase;
          letter-spacing: 1px;
          color: rgba(240, 244, 232, 0.5);
          margin-top: 4px;
        }

        /* Tabs */
        .dash-tabs {
          display: flex;
          gap: 8px;
          margin-bottom: 24px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.1);
          padding-bottom: 12px;
        }

        .tab {
          padding: 10px 20px;
          background: transparent;
          border: none;
          color: rgba(240, 244, 232, 0.5);
          font-size: 14px;
          font-weight: 500;
          cursor: pointer;
          border-radius: 8px;
          font-family: inherit;
          transition: all 0.2s;
        }

        .tab:hover {
          color: #fff;
          background: rgba(255, 255, 255, 0.05);
        }

        .tab.active {
          color: #0d1f0d;
          background: #7cb97c;
        }

        /* Sections */
        .section {
          margin-bottom: 32px;
        }

        .section h3 {
          font-size: 16px;
          font-weight: 600;
          margin-bottom: 16px;
          color: rgba(240, 244, 232, 0.8);
        }

        /* Analysis Cards */
        .analysis-card {
          background: rgba(255, 255, 255, 0.03);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 12px;
          padding: 20px;
          display: flex;
          justify-content: space-between;
          align-items: center;
          cursor: pointer;
          transition: all 0.2s;
          margin-bottom: 12px;
        }

        .analysis-card:hover {
          background: rgba(255, 255, 255, 0.06);
          border-color: rgba(124, 185, 124, 0.3);
        }

        .analysis-course {
          font-weight: 600;
          font-size: 16px;
          margin-bottom: 4px;
        }

        .analysis-meta, .analysis-date, .analysis-handicap {
          font-size: 13px;
          color: rgba(240, 244, 232, 0.5);
        }

        .analysis-meta {
          display: flex;
          gap: 8px;
          align-items: center;
        }

        .miss-pattern {
          background: rgba(124, 185, 124, 0.15);
          padding: 2px 8px;
          border-radius: 4px;
          font-size: 12px;
        }

        .analysis-action {
          color: #7cb97c;
          font-weight: 500;
          font-size: 14px;
        }

        /* Course Strategy Cards */
        .courses-list {
          display: flex;
          flex-direction: column;
        }

        .course-card {
          background: rgba(255, 255, 255, 0.03);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 12px;
          padding: 20px;
          display: flex;
          justify-content: space-between;
          align-items: center;
          cursor: pointer;
          transition: all 0.2s;
          margin-bottom: 12px;
        }

        .course-card:hover {
          background: rgba(255, 255, 255, 0.06);
          border-color: rgba(124, 185, 124, 0.3);
        }

        .course-name {
          font-weight: 600;
          font-size: 16px;
          margin-bottom: 4px;
        }

        .course-meta {
          font-size: 13px;
          color: rgba(240, 244, 232, 0.5);
          display: flex;
          gap: 8px;
          align-items: center;
        }

        .course-action {
          color: #7cb97c;
          font-weight: 500;
          font-size: 14px;
        }

        /* Quick Actions */
        .quick-actions {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 12px;
        }

        .action-card {
          background: rgba(255, 255, 255, 0.03);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 12px;
          padding: 24px 16px;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 8px;
          cursor: pointer;
          transition: all 0.2s;
          font-family: inherit;
          color: #fff;
        }

        .action-card:hover {
          background: rgba(255, 255, 255, 0.06);
          border-color: rgba(124, 185, 124, 0.3);
        }

        .action-icon {
          font-size: 28px;
        }

        .action-label {
          font-size: 13px;
          font-weight: 500;
        }

        /* Practice Reminder */
        .practice-reminder {
          background: rgba(255, 255, 255, 0.03);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 12px;
          padding: 20px;
        }

        .practice-session-mini .session-name {
          font-weight: 600;
          margin-bottom: 4px;
        }

        .practice-session-mini .session-duration {
          display: inline-block;
          background: rgba(124, 185, 124, 0.15);
          color: #7cb97c;
          padding: 2px 10px;
          border-radius: 12px;
          font-size: 12px;
          margin-bottom: 8px;
        }

        .practice-session-mini .session-focus {
          font-size: 14px;
          color: rgba(240, 244, 232, 0.6);
        }

        /* Rounds */
        .rounds-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 16px;
        }

        .rounds-header h3 {
          margin-bottom: 0;
        }

        .add-round-btn {
          padding: 8px 16px;
          background: rgba(124, 185, 124, 0.15);
          color: #7cb97c;
          border: 1px solid rgba(124, 185, 124, 0.3);
          border-radius: 8px;
          font-size: 13px;
          font-weight: 500;
          cursor: pointer;
          font-family: inherit;
        }

        .round-card {
          background: rgba(255, 255, 255, 0.03);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 12px;
          padding: 16px 20px;
          display: flex;
          align-items: center;
          gap: 20px;
          margin-bottom: 12px;
        }

        .round-score {
          font-family: 'Fraunces', Georgia, serif;
          font-size: 28px;
          font-weight: 700;
          color: #7cb97c;
          min-width: 60px;
        }

        .round-info {
          flex: 1;
        }

        .round-course {
          font-weight: 500;
          margin-bottom: 2px;
        }

        .round-date {
          font-size: 13px;
          color: rgba(240, 244, 232, 0.5);
        }

        .round-stats {
          display: flex;
          gap: 16px;
          font-size: 13px;
          color: rgba(240, 244, 232, 0.6);
        }

        /* Empty State */
        .empty-state {
          text-align: center;
          padding: 48px 24px;
        }

        .empty-icon {
          font-size: 48px;
          margin-bottom: 16px;
        }

        .empty-state h3 {
          font-size: 18px;
          margin-bottom: 8px;
          color: #fff;
        }

        .empty-state p {
          color: rgba(240, 244, 232, 0.5);
          margin-bottom: 24px;
        }

        .primary-btn {
          padding: 14px 28px;
          background: linear-gradient(135deg, #7cb97c, #5a9a5a);
          color: #0d1f0d;
          border: none;
          border-radius: 10px;
          font-weight: 600;
          font-size: 15px;
          cursor: pointer;
          font-family: inherit;
        }

        /* Modal */
        .modal-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0, 0, 0, 0.8);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000;
          padding: 20px;
        }

        .modal-content {
          background: linear-gradient(145deg, #1a3a1a, #0d1f0d);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 20px;
          padding: 32px;
          width: 100%;
          max-width: 480px;
          position: relative;
        }

        .modal-close {
          position: absolute;
          top: 16px;
          right: 16px;
          background: none;
          border: none;
          color: rgba(255, 255, 255, 0.5);
          font-size: 24px;
          cursor: pointer;
        }

        .modal-content h2 {
          font-family: 'Fraunces', Georgia, serif;
          font-size: 24px;
          margin-bottom: 24px;
        }

        .form-row {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 16px;
        }

        .form-row.four-col {
          grid-template-columns: repeat(4, 1fr);
        }

        .form-group {
          margin-bottom: 16px;
        }

        .form-group label {
          display: block;
          font-size: 12px;
          text-transform: uppercase;
          letter-spacing: 1px;
          color: rgba(240, 244, 232, 0.6);
          margin-bottom: 6px;
        }

        .form-group input,
        .form-group textarea {
          width: 100%;
          padding: 12px 14px;
          font-size: 15px;
          background: rgba(255, 255, 255, 0.08);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 8px;
          color: #fff;
          font-family: inherit;
        }

        .form-group input:focus,
        .form-group textarea:focus {
          outline: none;
          border-color: #7cb97c;
        }

        .submit-btn {
          width: 100%;
          padding: 14px;
          background: linear-gradient(135deg, #7cb97c, #5a9a5a);
          color: #0d1f0d;
          border: none;
          border-radius: 10px;
          font-weight: 600;
          font-size: 15px;
          cursor: pointer;
          font-family: inherit;
          margin-top: 8px;
        }

        .submit-btn:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        /* GHIN Styles */
        .ghin-badge {
          font-size: 11px;
          padding: 4px 10px;
          background: rgba(124, 185, 124, 0.15);
          color: #7cb97c;
          border-radius: 12px;
          margin-left: 8px;
        }

        .ghin-actions {
          margin-bottom: 16px;
        }

        .link-ghin-btn,
        .refresh-handicap-btn {
          padding: 8px 16px;
          font-size: 13px;
          background: rgba(124, 185, 124, 0.1);
          color: #7cb97c;
          border: 1px solid rgba(124, 185, 124, 0.3);
          border-radius: 8px;
          cursor: pointer;
          font-family: inherit;
          transition: all 0.2s;
        }

        .link-ghin-btn:hover,
        .refresh-handicap-btn:hover {
          background: rgba(124, 185, 124, 0.2);
        }

        .refresh-handicap-btn:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .modal-description {
          color: rgba(240, 244, 232, 0.6);
          margin-bottom: 24px;
          line-height: 1.5;
        }

        .ghin-error {
          background: rgba(220, 53, 69, 0.15);
          color: #ff6b6b;
          padding: 12px 16px;
          border-radius: 8px;
          margin-bottom: 16px;
          font-size: 14px;
        }

        .ghin-connect-section {
          margin-bottom: 20px;
        }

        .ghin-connect-btn {
          width: 100%;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 10px;
          padding: 16px;
          background: linear-gradient(135deg, rgba(124, 185, 124, 0.2), rgba(124, 185, 124, 0.1));
          border: 2px solid rgba(124, 185, 124, 0.4);
          border-radius: 10px;
          color: #fff;
          font-size: 16px;
          font-weight: 600;
          cursor: pointer;
          font-family: inherit;
          transition: all 0.2s ease;
        }

        .ghin-connect-btn:hover {
          background: linear-gradient(135deg, rgba(124, 185, 124, 0.3), rgba(124, 185, 124, 0.15));
          border-color: #7cb97c;
          transform: translateY(-2px);
        }

        .ghin-connect-btn .ghin-icon {
          font-size: 20px;
        }

        .ghin-connect-btn .ghin-tag {
          background: #7cb97c;
          color: #0d1f0d;
          font-size: 10px;
          padding: 3px 8px;
          border-radius: 10px;
          font-weight: 700;
          text-transform: uppercase;
        }

        .ghin-connected-banner {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 12px 16px;
          background: linear-gradient(135deg, rgba(124, 185, 124, 0.15), rgba(124, 185, 124, 0.05));
          border: 1px solid rgba(124, 185, 124, 0.3);
          border-radius: 10px;
          margin-bottom: 20px;
        }

        .ghin-connected-icon {
          width: 32px;
          height: 32px;
          background: #7cb97c;
          color: #0d1f0d;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 16px;
          font-weight: bold;
        }

        .ghin-connected-text {
          flex: 1;
          display: flex;
          flex-direction: column;
          gap: 2px;
        }

        .ghin-connected-text strong {
          font-size: 14px;
          color: #7cb97c;
        }

        .ghin-connected-text span {
          font-size: 12px;
          color: rgba(240, 244, 232, 0.5);
        }

        .ghin-refresh-btn {
          padding: 8px 14px;
          background: rgba(124, 185, 124, 0.2);
          border: 1px solid rgba(124, 185, 124, 0.4);
          border-radius: 6px;
          color: #7cb97c;
          font-size: 12px;
          font-weight: 600;
          cursor: pointer;
          font-family: inherit;
          transition: all 0.2s ease;
        }

        .ghin-refresh-btn:hover:not(:disabled) {
          background: rgba(124, 185, 124, 0.3);
        }

        .ghin-refresh-btn:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .disconnect-link {
          margin-top: 16px;
          font-size: 12px;
          color: rgba(240, 244, 232, 0.4);
        }

        .disconnect-link:hover {
          color: rgba(240, 244, 232, 0.7);
        }

        .ghin-connect-hint {
          text-align: center;
          font-size: 12px;
          color: rgba(240, 244, 232, 0.5);
          margin-top: 8px;
        }

        .modal-divider {
          display: flex;
          align-items: center;
          gap: 16px;
          margin: 20px 0;
        }

        .modal-divider::before,
        .modal-divider::after {
          content: '';
          flex: 1;
          height: 1px;
          background: rgba(255, 255, 255, 0.1);
        }

        .modal-divider span {
          font-size: 12px;
          color: rgba(240, 244, 232, 0.4);
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }

        .ghin-submit {
          background: linear-gradient(135deg, #7cb97c, #5a9a5a) !important;
        }

        .back-btn {
          width: 100%;
          padding: 12px;
          margin-top: 12px;
          background: transparent;
          border: none;
          color: rgba(240, 244, 232, 0.6);
          font-size: 14px;
          cursor: pointer;
          font-family: inherit;
        }

        .back-btn:hover {
          color: #fff;
        }

        .ghin-privacy {
          text-align: center;
          font-size: 12px;
          color: rgba(240, 244, 232, 0.5);
          margin-top: 16px;
        }

        .ghin-success {
          text-align: center;
          margin-bottom: 24px;
        }

        .ghin-success .success-icon {
          width: 60px;
          height: 60px;
          background: linear-gradient(135deg, #7cb97c, #5a9a5a);
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 32px;
          color: #0d1f0d;
          margin: 0 auto 16px;
        }

        .ghin-success h3 {
          font-size: 20px;
          margin-bottom: 16px;
        }

        .ghin-success .golfer-name {
          font-size: 18px;
          font-weight: 600;
          margin-bottom: 4px;
        }

        .ghin-success .golfer-club {
          color: rgba(240, 244, 232, 0.6);
          font-size: 14px;
          margin-bottom: 16px;
        }

        .ghin-success .handicap-display {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 4px;
        }

        .ghin-success .handicap-label {
          font-size: 12px;
          color: rgba(240, 244, 232, 0.5);
          text-transform: uppercase;
        }

        .ghin-success .handicap-value {
          font-family: 'Fraunces', Georgia, serif;
          font-size: 36px;
          font-weight: 700;
          color: #7cb97c;
        }

        .ghin-success .scores-imported {
          margin-top: 16px;
          font-size: 14px;
          color: #7cb97c;
        }

        .ghin-result {
          text-align: center;
        }

        .ghin-profile {
          background: rgba(0, 0, 0, 0.2);
          border-radius: 12px;
          padding: 24px;
          margin-bottom: 20px;
        }

        .ghin-name {
          font-size: 20px;
          font-weight: 600;
          margin-bottom: 4px;
        }

        .ghin-club {
          color: rgba(240, 244, 232, 0.6);
          font-size: 14px;
          margin-bottom: 16px;
        }

        .ghin-handicap-large {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 4px;
        }

        .ghin-handicap-large .handicap-value {
          font-family: 'Fraunces', Georgia, serif;
          font-size: 48px;
          font-weight: 700;
          color: #7cb97c;
        }

        .ghin-handicap-large .handicap-label {
          font-size: 12px;
          text-transform: uppercase;
          letter-spacing: 1px;
          color: rgba(240, 244, 232, 0.5);
        }

        .trend-indicator {
          font-size: 20px;
          margin-top: 8px;
        }

        .trend-indicator.down {
          color: #7cb97c;
        }

        .trend-indicator.up {
          color: #ff6b6b;
        }

        .ghin-actions-modal {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .cancel-btn {
          padding: 12px;
          background: transparent;
          color: rgba(240, 244, 232, 0.6);
          border: 1px solid rgba(255, 255, 255, 0.2);
          border-radius: 8px;
          cursor: pointer;
          font-family: inherit;
          font-size: 14px;
        }

        .cancel-btn:hover {
          color: #fff;
          border-color: rgba(255, 255, 255, 0.4);
        }

        .modal-hint {
          margin-top: 16px;
          padding-top: 16px;
          border-top: 1px solid rgba(255, 255, 255, 0.1);
          font-size: 13px;
          color: rgba(240, 244, 232, 0.5);
          text-align: center;
        }

        .modal-hint a {
          color: #7cb97c;
          text-decoration: none;
        }

        .modal-hint a:hover {
          text-decoration: underline;
        }

        @media (max-width: 640px) {
          .quick-stats {
            grid-template-columns: repeat(2, 1fr);
          }

          .quick-actions {
            grid-template-columns: 1fr;
          }

          .form-row.four-col {
            grid-template-columns: repeat(2, 1fr);
          }

          .round-stats {
            display: none;
          }

          /* Fix dashboard tabs on mobile - make them scroll horizontally */
          .dash-tabs {
            overflow-x: auto;
            flex-wrap: nowrap;
            -webkit-overflow-scrolling: touch;
            scrollbar-width: none;
            padding-bottom: 16px;
          }
          
          .dash-tabs::-webkit-scrollbar {
            display: none;
          }
          
          .tab {
            flex-shrink: 0;
            padding: 8px 14px;
            font-size: 13px;
            white-space: nowrap;
          }

          /* Fix first form row (Date & Score) on mobile */
          .form-row {
            grid-template-columns: 1fr 1fr;
            gap: 12px;
          }
        }
      `}</style>
    </div>
  );
}
