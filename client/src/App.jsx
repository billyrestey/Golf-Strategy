import React, { useState, useEffect } from 'react';
import { useAuth } from './context/AuthContext';
import AuthModal from './components/AuthModal';
import PricingModal from './components/PricingModal';
import Dashboard from './components/Dashboard';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

export default function App() {
  const { user, token, isAuthenticated, loading: authLoading, logout, canAnalyze, updateCredits } = useAuth();
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [showPricingModal, setShowPricingModal] = useState(false);
  const [authMode, setAuthMode] = useState('login');
  const [showPricingFlow, setShowPricingFlow] = useState(false); // Combined signup + pricing
  const [currentAnalysisId, setCurrentAnalysisId] = useState(null);
  const [view, setView] = useState('landing'); // 'landing', 'dashboard', 'analysis', 'results'
  
  const [step, setStep] = useState(1);
  const [formData, setFormData] = useState({
    name: '',
    handicap: '',
    targetHandicap: '',
    homeCourse: '',
    missPattern: '',
    missDescription: '',
    strengths: [],
    uploadedCards: []
  });
  const [analysis, setAnalysis] = useState(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analyzeStep, setAnalyzeStep] = useState(0);
  const [error, setError] = useState(null);

  const strengthOptions = [
    { id: 'driving', label: 'Driving Distance', icon: '🚀' },
    { id: 'irons', label: 'Iron Play', icon: '🎯' },
    { id: 'shortgame', label: 'Short Game', icon: '⛳' },
    { id: 'putting', label: 'Putting', icon: '🕳️' },
    { id: 'course_mgmt', label: 'Course Management', icon: '🧠' },
    { id: 'consistency', label: 'Consistency', icon: '📊' }
  ];

  const missPatterns = [
    { id: 'slice', label: 'Slice / Fade that runs away', description: 'Ball curves right (for righties)' },
    { id: 'hook', label: 'Hook / Draw that turns over', description: 'Ball curves left (for righties)' },
    { id: 'both', label: 'Two-way miss', description: 'Could go either direction' },
    { id: 'straight_short', label: 'Straight but short', description: 'Contact issues, not curve' }
  ];

  const handleFileUpload = (e) => {
    const files = Array.from(e.target.files);
    const newCards = files.map(file => ({
      name: file.name,
      file: file,
      preview: URL.createObjectURL(file)
    }));
    setFormData(prev => ({
      ...prev,
      uploadedCards: [...prev.uploadedCards, ...newCards].slice(0, 10)
    }));
  };

  const removeCard = (index) => {
    setFormData(prev => ({
      ...prev,
      uploadedCards: prev.uploadedCards.filter((_, i) => i !== index)
    }));
  };

  const toggleStrength = (id) => {
    setFormData(prev => ({
      ...prev,
      strengths: prev.strengths.includes(id)
        ? prev.strengths.filter(s => s !== id)
        : [...prev.strengths, id]
    }));
  };

  const [previewMode, setPreviewMode] = useState(false);
  const [pendingAnalysis, setPendingAnalysis] = useState(null);

  const analyzeGame = async () => {
    setIsAnalyzing(true);
    setError(null);
    setAnalyzeStep(0);
    
    // Determine if this is a preview (not logged in) or full analysis
    const isPreview = !isAuthenticated;
    
    try {
      // Create FormData for file upload
      const submitData = new FormData();
      submitData.append('name', formData.name);
      submitData.append('handicap', formData.handicap);
      submitData.append('homeCourse', formData.homeCourse);
      submitData.append('missPattern', formData.missPattern);
      submitData.append('missDescription', formData.missDescription);
      submitData.append('strengths', JSON.stringify(formData.strengths));
      submitData.append('preview', isPreview.toString());
      
      // Append scorecard files
      formData.uploadedCards.forEach((card, index) => {
        submitData.append('scorecards', card.file);
      });

      // Animate through steps
      const stepInterval = setInterval(() => {
        setAnalyzeStep(prev => Math.min(prev + 1, 3));
      }, 800);

      const headers = {};
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const response = await fetch(`${API_URL}/api/analyze`, {
        method: 'POST',
        headers,
        body: submitData
      });

      clearInterval(stepInterval);

      if (!response.ok) {
        const errorData = await response.json();
        if (errorData.needsUpgrade) {
          setShowPricingModal(true);
          throw new Error('No credits remaining. Please upgrade.');
        }
        throw new Error(errorData.error || 'Analysis failed');
      }

      const data = await response.json();
      
      if (data.success) {
        setAnalysis(data.analysis);
        
        if (isPreview) {
          // Store for later and show teaser
          setPreviewMode(true);
          setPendingAnalysis({
            analysis: data.analysis,
            formData: { ...formData }
          });
          setStep(5);
          setView('results');
        } else {
          // Full analysis - save and show
          setCurrentAnalysisId(data.analysisId);
          if (data.creditsRemaining !== 'unlimited') {
            updateCredits(data.creditsRemaining);
          }
          setPreviewMode(false);
          setStep(5);
          setView('results');
        }
      } else {
        throw new Error(data.error || 'Analysis failed');
      }
    } catch (err) {
      console.error('Analysis error:', err);
      setError(err.message);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const resetForm = () => {
    setStep(1);
    setAnalysis(null);
    setCurrentAnalysisId(null);
    setPreviewMode(false);
    setPendingAnalysis(null);
    setFormData({
      name: '',
      handicap: '',
      homeCourse: '',
      missPattern: '',
      missDescription: '',
      strengths: [],
      uploadedCards: []
    });
    setError(null);
    // Go to dashboard if logged in, otherwise landing
    setView(isAuthenticated ? 'dashboard' : 'landing');
  };

  // Unlock full analysis after signup/login
  const unlockAnalysis = async () => {
    if (!pendingAnalysis || !isAuthenticated) return;
    
    try {
      // Save the analysis to user's account
      const response = await fetch(`${API_URL}/api/analyses/save`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          name: pendingAnalysis.formData.name,
          handicap: pendingAnalysis.formData.handicap,
          homeCourse: pendingAnalysis.formData.homeCourse,
          missPattern: pendingAnalysis.formData.missPattern,
          analysis: pendingAnalysis.analysis
        })
      });

      if (response.ok) {
        const data = await response.json();
        setCurrentAnalysisId(data.analysisId);
        if (data.creditsRemaining !== 'unlimited') {
          updateCredits(data.creditsRemaining);
        }
      }
      
      // Reveal full analysis
      setPreviewMode(false);
      setPendingAnalysis(null);
    } catch (error) {
      console.error('Error saving analysis:', error);
      // Still show full analysis even if save fails
      setPreviewMode(false);
    }
  };

  // When user logs in while in preview mode, unlock the analysis
  useEffect(() => {
    if (isAuthenticated && previewMode && pendingAnalysis) {
      unlockAnalysis();
    }
  }, [isAuthenticated, previewMode]);

  // Start new analysis from dashboard
  const startNewAnalysis = () => {
    resetForm();
    setView('analysis');
    setStep(1);
  };

  // View a specific analysis from dashboard
  const viewAnalysis = async (analysisId) => {
    try {
      const response = await fetch(`${API_URL}/api/analyses/${analysisId}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        const data = await response.json();
        setAnalysis(data.analysis.analysis_json);
        setCurrentAnalysisId(analysisId);
        setFormData(prev => ({
          ...prev,
          name: data.analysis.name,
          handicap: data.analysis.handicap,
          homeCourse: data.analysis.home_course,
          missPattern: data.analysis.miss_pattern
        }));
        setView('results');
        setStep(5);
      }
    } catch (error) {
      console.error('Error loading analysis:', error);
    }
  };

  // Redirect to dashboard after login if user already has analyses
  useEffect(() => {
    if (isAuthenticated && view === 'landing') {
      setView('dashboard');
    }
  }, [isAuthenticated]);

  // PDF download function
  const downloadPDF = async (type = 'strategy') => {
    if (!currentAnalysisId) return;
    
    try {
      const response = await fetch(
        `${API_URL}/api/analyses/${currentAnalysisId}/pdf?type=${type}`,
        {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        }
      );
      
      if (!response.ok) throw new Error('Failed to generate PDF');
      
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = type === 'strategy' 
        ? `${formData.name}_Strategy_Card.pdf`
        : `${formData.name}_Practice_Plan.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('PDF download error:', error);
      alert('Failed to download PDF');
    }
  };

  // Render functions for each step
  const renderStep1 = () => (
    <div className="step-content">
      <div className="step-header">
        <span className="step-number">01</span>
        <h2>Let's start with the basics</h2>
        <p>Tell us about your game so we can build your strategy.</p>
      </div>
      
      <div className="form-group">
        <label>Your Name</label>
        <input
          type="text"
          value={formData.name}
          onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
          placeholder="e.g., Billy"
        />
      </div>
      
      <div className="form-row-half">
        <div className="form-group">
          <label>Current Stroke Index</label>
          <input
            type="number"
            step="0.1"
            value={formData.handicap}
            onChange={(e) => setFormData(prev => ({ ...prev, handicap: e.target.value }))}
            placeholder="e.g., 14.7"
          />
        </div>
        <div className="form-group">
          <label>Target Stroke Index</label>
          <input
            type="number"
            step="0.1"
            value={formData.targetHandicap}
            onChange={(e) => setFormData(prev => ({ ...prev, targetHandicap: e.target.value }))}
            placeholder="e.g., 10.0"
          />
        </div>
      </div>
      
      <div className="form-group">
        <label>Home Course</label>
        <input
          type="text"
          value={formData.homeCourse}
          onChange={(e) => setFormData(prev => ({ ...prev, homeCourse: e.target.value }))}
          placeholder="e.g., Useless Bay G&CC"
        />
      </div>
      
      <button 
        className="next-btn"
        onClick={() => setStep(2)}
        disabled={!formData.name || !formData.handicap || !formData.homeCourse}
      >
        Continue →
      </button>
    </div>
  );

  const renderStep2 = () => (
    <div className="step-content">
      <div className="step-header">
        <span className="step-number">02</span>
        <h2>What's your typical miss?</h2>
        <p>Be honest — this is the key to your strategy.</p>
      </div>
      
      <div className="miss-options">
        {missPatterns.map(pattern => (
          <div
            key={pattern.id}
            className={`miss-card ${formData.missPattern === pattern.id ? 'selected' : ''}`}
            onClick={() => setFormData(prev => ({ ...prev, missPattern: pattern.id }))}
          >
            <div className="miss-card-inner">
              <div className="miss-label">{pattern.label}</div>
              <div className="miss-desc">{pattern.description}</div>
            </div>
            <div className="check-mark">✓</div>
          </div>
        ))}
      </div>
      
      <div className="form-group" style={{ marginTop: '24px' }}>
        <label>Describe when it happens (optional)</label>
        <textarea
          value={formData.missDescription}
          onChange={(e) => setFormData(prev => ({ ...prev, missDescription: e.target.value }))}
          placeholder="e.g., When I swing hard and pull the handle, the face stays open..."
          rows={3}
        />
      </div>
      
      <div className="btn-group">
        <button className="back-btn" onClick={() => setStep(1)}>← Back</button>
        <button 
          className="next-btn"
          onClick={() => setStep(3)}
          disabled={!formData.missPattern}
        >
          Continue →
        </button>
      </div>
    </div>
  );

  const renderStep3 = () => (
    <div className="step-content">
      <div className="step-header">
        <span className="step-number">03</span>
        <h2>What are your strengths?</h2>
        <p>Select all that apply — we'll build strategy around these.</p>
      </div>
      
      <div className="strength-grid">
        {strengthOptions.map(strength => (
          <div
            key={strength.id}
            className={`strength-card ${formData.strengths.includes(strength.id) ? 'selected' : ''}`}
            onClick={() => toggleStrength(strength.id)}
          >
            <span className="strength-icon">{strength.icon}</span>
            <span className="strength-label">{strength.label}</span>
          </div>
        ))}
      </div>
      
      <div className="btn-group">
        <button className="back-btn" onClick={() => setStep(2)}>← Back</button>
        <button 
          className="next-btn"
          onClick={() => setStep(4)}
          disabled={formData.strengths.length === 0}
        >
          Continue →
        </button>
      </div>
    </div>
  );

  const renderStep4 = () => (
    <div className="step-content">
      <div className="step-header">
        <span className="step-number">04</span>
        <h2>Upload your scorecards</h2>
        <p>Screenshots from GHIN, Arccos, or any golf app. 5-10 recent rounds is ideal.</p>
      </div>
      
      <div className="upload-zone">
        <input
          type="file"
          accept="image/*"
          multiple
          onChange={handleFileUpload}
          id="scorecard-upload"
          className="upload-input"
        />
        <label htmlFor="scorecard-upload" className="upload-label">
          <div className="upload-icon">📸</div>
          <div className="upload-text">
            <strong>Drop scorecards here</strong>
            <span>or click to browse</span>
          </div>
        </label>
      </div>
      
      {formData.uploadedCards.length > 0 && (
        <div className="uploaded-cards">
          <div className="cards-header">
            <span>{formData.uploadedCards.length} scorecard{formData.uploadedCards.length !== 1 ? 's' : ''} uploaded</span>
          </div>
          <div className="cards-grid">
            {formData.uploadedCards.map((card, index) => (
              <div key={index} className="card-preview">
                <img src={card.preview} alt={`Scorecard ${index + 1}`} />
                <button 
                  className="remove-card"
                  onClick={() => removeCard(index)}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {error && (
        <div className="error-message">
          {error}
        </div>
      )}
      
      <div className="btn-group">
        <button className="back-btn" onClick={() => setStep(3)}>← Back</button>
        <button 
          className="next-btn analyze-btn"
          onClick={analyzeGame}
          disabled={isAnalyzing}
        >
          {isAnalyzing ? 'Analyzing...' : 
           formData.uploadedCards.length < 3 
            ? `Analyze (${formData.uploadedCards.length} cards)` 
            : 'Analyze My Game →'}
        </button>
      </div>
      
      {formData.uploadedCards.length < 3 && (
        <p className="skip-note">
          More scorecards = better analysis. <button className="skip-link" onClick={analyzeGame}>Continue anyway</button>
        </p>
      )}
    </div>
  );

  const renderAnalyzing = () => (
    <div className="analyzing-screen">
      <div className="analyzing-content">
        <div className="analyzing-spinner"></div>
        <h2>Analyzing your game...</h2>
        <div className="analyzing-steps">
          <div className={`analyzing-step ${analyzeStep >= 0 ? 'active' : ''}`}>
            {analyzeStep > 0 ? '✓' : '○'} Reading scorecards
          </div>
          <div className={`analyzing-step ${analyzeStep >= 1 ? 'active' : ''}`}>
            {analyzeStep > 1 ? '✓' : '○'} Identifying patterns
          </div>
          <div className={`analyzing-step ${analyzeStep >= 2 ? 'active' : ''}`}>
            {analyzeStep > 2 ? '✓' : '○'} Building strategy
          </div>
          <div className={`analyzing-step ${analyzeStep >= 3 ? 'active' : ''}`}>
            {analyzeStep > 3 ? '✓' : '○'} Creating practice plan
          </div>
        </div>
      </div>
    </div>
  );

  const renderResults = () => {
    if (!analysis) return null;

    // Preview mode - show teaser with blur
    if (previewMode) {
      return (
        <div className="results-container preview-mode">
          {/* Teaser Header - Always Visible */}
          <div className="teaser-header">
            <div className="teaser-badge">
              <span className="teaser-icon">🎯</span>
              <span className="teaser-text">Your Analysis is Ready</span>
            </div>
            <h1 className="teaser-headline">
              Improve Your Game by <span className="highlight">{analysis.summary?.potentialStrokeDrop || '3-5'} Strokes</span>
            </h1>
            <p className="teaser-subhead">
              {formData.name}, we've analyzed your scorecards and created a personalized strategy for {formData.homeCourse}.
            </p>
          </div>

          {/* Key Insight - Visible */}
          {analysis.summary?.keyInsight && (
            <div className="key-insight teaser-insight">
              <span className="insight-label">Your #1 Opportunity</span>
              <p>{analysis.summary.keyInsight}</p>
            </div>
          )}

          {/* Blurred Preview */}
          <div className="blurred-preview">
            <div className="blur-overlay">
              <div className="unlock-prompt">
                <h2>Unlock Your Full Strategy</h2>
                <p>Get your complete game plan including:</p>
                <ul className="unlock-features">
                  <li>✓ Hole-by-hole course strategy</li>
                  <li>✓ Personalized practice plan</li>
                  <li>✓ Mental game techniques</li>
                  <li>✓ Target stats to track</li>
                  <li>✓ 30-day improvement roadmap</li>
                </ul>
                <button 
                  className="unlock-btn"
                  onClick={() => { setAuthMode('register'); setShowPricingFlow(true); setShowAuthModal(true); }}
                >
                  Get Full Strategy
                </button>
                <p className="unlock-note">
                  Already have an account? <button className="link-btn" onClick={() => { setAuthMode('login'); setShowPricingFlow(true); setShowAuthModal(true); }}>Sign in</button>
                </p>
              </div>
            </div>
            
            {/* Blurred Content Preview */}
            <div className="blurred-content">
              <section className="results-section strategy-section">
                <div className="section-header">
                  <span className="section-icon">🗺️</span>
                  <h2>Course Strategy</h2>
                </div>
                <div className="light-system">
                  <div className="light-group red">
                    <div className="light-header">
                      <span className="light-indicator">🔴</span>
                      <strong>Red Light — Play Safe</strong>
                    </div>
                  </div>
                  <div className="light-group green">
                    <div className="light-header">
                      <span className="light-indicator">🟢</span>
                      <strong>Green Light — Attack</strong>
                    </div>
                  </div>
                </div>
              </section>
              
              <section className="results-section">
                <div className="section-header">
                  <span className="section-icon">🏋️</span>
                  <h2>Practice Plan</h2>
                </div>
              </section>

              <section className="results-section">
                <div className="section-header">
                  <span className="section-icon">📅</span>
                  <h2>30-Day Plan</h2>
                </div>
              </section>
            </div>
          </div>
        </div>
      );
    }

    // Full results view
    return (
      <div className="results-container">
        <div className="results-header">
          <div className="results-title">
            <h1>{formData.name}'s Game Plan</h1>
            <p>{formData.homeCourse} • {analysis.summary?.currentHandicap || formData.handicap} → {analysis.summary?.targetHandicap || '?'} Stroke Index</p>
          </div>
          <div className="potential-badge">
            <span className="potential-label">Drop</span>
            <span className="potential-value">{analysis.summary?.potentialStrokeDrop || '?'} strokes</span>
          </div>
        </div>

        {analysis.summary?.keyInsight && (
          <div className="key-insight">
            <span className="insight-label">Key Insight</span>
            <p>{analysis.summary.keyInsight}</p>
          </div>
        )}

        {/* Extracted Scores Summary */}
        {analysis.extractedScores?.rounds?.length > 0 && (
          <section className="results-section scores-section">
            <div className="section-header">
              <span className="section-icon">📋</span>
              <h2>Analyzed Rounds ({analysis.extractedScores.rounds.length})</h2>
            </div>
            <div className="rounds-summary">
              {analysis.extractedScores.rounds.map((round, i) => (
                <div key={i} className="round-chip">
                  <span className="round-score">{round.totalScore}</span>
                  <span className="round-date">{round.date || `Round ${i + 1}`}</span>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Course Strategy */}
        {analysis.courseStrategy && (
          <section className="results-section strategy-section">
            <div className="section-header">
              <span className="section-icon">🗺️</span>
              <h2>Course Strategy</h2>
            </div>
            
            {analysis.courseStrategy.overallApproach && (
              <p className="overall-approach">{analysis.courseStrategy.overallApproach}</p>
            )}
            
            <div className="light-system">
              {analysis.courseStrategy.redLightHoles?.length > 0 && (
                <div className="light-group red">
                  <div className="light-header">
                    <span className="light-indicator">🔴</span>
                    <strong>Red Light — Play Safe</strong>
                  </div>
                  <p>{Array.isArray(analysis.courseStrategy.redLightHoles) 
                    ? analysis.courseStrategy.redLightHoles.join(', ')
                    : analysis.courseStrategy.redLightHoles}</p>
                </div>
              )}
              
              {analysis.courseStrategy.yellowLightHoles?.length > 0 && (
                <div className="light-group yellow">
                  <div className="light-header">
                    <span className="light-indicator">🟡</span>
                    <strong>Yellow Light — Conditional</strong>
                  </div>
                  <p>{Array.isArray(analysis.courseStrategy.yellowLightHoles)
                    ? analysis.courseStrategy.yellowLightHoles.join(', ')
                    : analysis.courseStrategy.yellowLightHoles}</p>
                </div>
              )}
              
              {analysis.courseStrategy.greenLightHoles?.length > 0 && (
                <div className="light-group green">
                  <div className="light-header">
                    <span className="light-indicator">🟢</span>
                    <strong>Green Light — Attack</strong>
                  </div>
                  <p>{Array.isArray(analysis.courseStrategy.greenLightHoles)
                    ? analysis.courseStrategy.greenLightHoles.join(', ')
                    : analysis.courseStrategy.greenLightHoles}</p>
                </div>
              )}
            </div>
          </section>
        )}
        
        {/* Trouble Holes Section */}
        {analysis.troubleHoles?.length > 0 && (
          <section className="results-section trouble-section">
            <div className="section-header">
              <span className="section-icon">🔴</span>
              <h2>Trouble Holes — Play Smart</h2>
            </div>
            <div className="hole-cards">
              {analysis.troubleHoles.map((hole, i) => (
                <div key={i} className="hole-card trouble">
                  <div className="hole-type">{hole.type}</div>
                  {hole.specificHoles && (
                    <div className="specific-holes">Holes: {hole.specificHoles.join(', ')}</div>
                  )}
                  <div className="hole-problem">{hole.problem}</div>
                  <div className="hole-strategy">
                    <strong>Strategy:</strong> {hole.strategy}
                  </div>
                  {hole.clubRecommendation && (
                    <div className="club-rec">
                      <strong>Club:</strong> {hole.clubRecommendation}
                    </div>
                  )}
                  <div className="acceptable-score">
                    Target: <span>{hole.acceptableScore}</span>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}
        
        {/* Strength Holes Section */}
        {analysis.strengthHoles?.length > 0 && (
          <section className="results-section strength-section">
            <div className="section-header">
              <span className="section-icon">🟢</span>
              <h2>Strength Holes — Attack Here</h2>
            </div>
            <div className="hole-cards">
              {analysis.strengthHoles.map((hole, i) => (
                <div key={i} className="hole-card strength">
                  <div className="hole-type">{hole.type}</div>
                  {hole.specificHoles && (
                    <div className="specific-holes">Holes: {hole.specificHoles.join(', ')}</div>
                  )}
                  <div className="hole-opportunity">{hole.opportunity}</div>
                  <div className="hole-strategy">
                    <strong>Strategy:</strong> {hole.strategy}
                  </div>
                  {hole.targetScore && (
                    <div className="target-score">
                      Target: <span>{hole.targetScore}</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}
        
        {/* Practice Plan Section */}
        {analysis.practicePlan?.weeklySchedule?.length > 0 && (
          <section className="results-section practice-section">
            <div className="section-header">
              <span className="section-icon">🎯</span>
              <h2>Weekly Practice Plan</h2>
            </div>
            
            {analysis.practicePlan.weeklySchedule.map((session, i) => (
              <div key={i} className="practice-session">
                <div className="session-header">
                  <h3>{session.session}</h3>
                  <span className="session-duration">{session.duration}</span>
                </div>
                {session.focus && (
                  <p className="session-focus">{session.focus}</p>
                )}
                <div className="drills-list">
                  {session.drills?.map((drill, j) => (
                    <div key={j} className="drill-item">
                      <div className="drill-name">{drill.name}</div>
                      <div className="drill-desc">{drill.description}</div>
                      {drill.why && (
                        <div className="drill-why"><em>Why:</em> {drill.why}</div>
                      )}
                      <div className="drill-reps">{drill.reps}</div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </section>
        )}
        
        {/* Pre-Round Section */}
        {analysis.practicePlan?.preRoundRoutine?.length > 0 && (
          <section className="results-section preround-section">
            <div className="section-header">
              <span className="section-icon">☀️</span>
              <h2>Pre-Round Routine</h2>
            </div>
            <ol className="preround-list">
              {analysis.practicePlan.preRoundRoutine.map((item, i) => (
                <li key={i}>{item}</li>
              ))}
            </ol>
          </section>
        )}
        
        {/* Mental Game Section */}
        {analysis.mentalGame && (
          <section className="results-section mental-section">
            <div className="section-header">
              <span className="section-icon">🧠</span>
              <h2>Mental Game</h2>
            </div>
            
            {analysis.mentalGame.preShot && (
              <div className="mental-item">
                <strong>Pre-Shot Thought:</strong>
                <p>{analysis.mentalGame.preShot}</p>
              </div>
            )}
            
            {analysis.mentalGame.recovery && (
              <div className="mental-item">
                <strong>After a Bad Shot:</strong>
                <p>{analysis.mentalGame.recovery}</p>
              </div>
            )}
            
            {analysis.mentalGame.mantras?.length > 0 && (
              <div className="mantras">
                <strong>Mantras:</strong>
                {analysis.mentalGame.mantras.map((mantra, i) => (
                  <div key={i} className="mantra-item">"{mantra}"</div>
                ))}
              </div>
            )}
          </section>
        )}
        
        {/* Target Stats */}
        {analysis.targetStats && (
          <section className="results-section stats-section">
            <div className="section-header">
              <span className="section-icon">📊</span>
              <h2>Target Stats</h2>
            </div>
            <div className="stats-grid">
              {analysis.targetStats.fairwaysHit && (
                <div className="stat-item">
                  <div className="stat-value">{analysis.targetStats.fairwaysHit}</div>
                  <div className="stat-label">Fairways</div>
                </div>
              )}
              {analysis.targetStats.penaltiesPerRound && (
                <div className="stat-item">
                  <div className="stat-value">{analysis.targetStats.penaltiesPerRound}</div>
                  <div className="stat-label">Penalties</div>
                </div>
              )}
              {analysis.targetStats.gir && (
                <div className="stat-item">
                  <div className="stat-value">{analysis.targetStats.gir}</div>
                  <div className="stat-label">GIR</div>
                </div>
              )}
              {analysis.targetStats.upAndDown && (
                <div className="stat-item">
                  <div className="stat-value">{analysis.targetStats.upAndDown}</div>
                  <div className="stat-label">Up & Down</div>
                </div>
              )}
              {analysis.targetStats.puttsPerRound && (
                <div className="stat-item">
                  <div className="stat-value">{analysis.targetStats.puttsPerRound}</div>
                  <div className="stat-label">Putts/Round</div>
                </div>
              )}
            </div>
          </section>
        )}

        {/* 30-Day Plan */}
        {analysis.thirtyDayPlan?.length > 0 && (
          <section className="results-section plan-section">
            <div className="section-header">
              <span className="section-icon">📅</span>
              <h2>30-Day Plan</h2>
            </div>
            <div className="week-cards">
              {analysis.thirtyDayPlan.map((week, i) => (
                <div key={i} className="week-card">
                  <div className="week-number">Week {week.week}</div>
                  <div className="week-focus">{week.focus}</div>
                  {week.goals?.length > 0 && (
                    <ul className="week-goals">
                      {week.goals.map((goal, j) => (
                        <li key={j}>{goal}</li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}
        
        <div className="results-footer">
          <button className="restart-btn" onClick={resetForm}>
            Back to Dashboard
          </button>
          <button className="print-btn" onClick={() => downloadPDF('strategy')}>
            📄 View Strategy
          </button>
          <button className="print-btn secondary" onClick={() => downloadPDF('practice')}>
            📋 View Drills
          </button>
        </div>
      </div>
    );
  };

  // Show loading while checking auth
  if (authLoading) {
    return (
      <div className="golf-tool">
        <div className="loading-screen">
          <div className="analyzing-spinner"></div>
          <p>Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="golf-tool">
      {/* Auth Modal */}
      <AuthModal 
        isOpen={showAuthModal} 
        onClose={() => { setShowAuthModal(false); setShowPricingFlow(false); }}
        initialMode={authMode}
        defaultName={formData.name}
        showPricing={showPricingFlow}
      />
      
      {/* Pricing Modal */}
      <PricingModal
        isOpen={showPricingModal}
        onClose={() => setShowPricingModal(false)}
      />
      
      {/* User Header */}
      {isAuthenticated && view !== 'results' && !isAnalyzing && (
        <div className="user-header">
          <div className="user-info">
            <button className="logo-btn" onClick={() => setView('dashboard')}>
            ⛳ GolfStrategy
            </button>
          </div>
          <div className="user-actions">
            <span className="user-name">{user?.name || user?.email}</span>
            {user?.subscriptionStatus === 'pro' ? (
              <span className="user-badge pro">Pro</span>
            ) : (
              <span className="user-credits">{user?.credits} credit{user?.credits !== 1 ? 's' : ''}</span>
            )}
            {user?.subscriptionStatus !== 'pro' && (
              <button className="upgrade-btn" onClick={() => setShowPricingModal(true)}>
                Upgrade
              </button>
            )}
            <button className="logout-btn" onClick={() => { logout(); setView('landing'); }}>Sign Out</button>
          </div>
        </div>
      )}

      {/* Sign In Header for non-authenticated users on landing */}
      {!isAuthenticated && view === 'landing' && (
        <div className="user-header landing-header">
          <div className="user-info">
            <span className="logo-text">⛳ GolfStrategy</span>
          </div>
          <div className="user-actions">
            <button className="signin-btn" onClick={() => { setAuthMode('login'); setShowAuthModal(true); }}>
              Sign In
            </button>
          </div>
        </div>
      )}
      <style>{`
        * {
          box-sizing: border-box;
          margin: 0;
          padding: 0;
        }
        
        .golf-tool {
          font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif;
          min-height: 100vh;
          background: linear-gradient(145deg, #0d1f0d 0%, #1a3a1a 50%, #0f2810 100%);
          color: #f0f4e8;
          position: relative;
          overflow-x: hidden;
        }
        
        .golf-tool::before {
          content: '';
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: 
            radial-gradient(ellipse at 20% 20%, rgba(74, 144, 74, 0.1) 0%, transparent 50%),
            radial-gradient(ellipse at 80% 80%, rgba(34, 87, 34, 0.15) 0%, transparent 50%);
          pointer-events: none;
        }
        
        .progress-bar {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          height: 4px;
          background: rgba(255,255,255,0.1);
          z-index: 100;
        }
        
        .progress-fill {
          height: 100%;
          background: linear-gradient(90deg, #7cb97c, #a8d4a8);
          transition: width 0.4s ease;
        }
        
        .tool-header {
          padding: 80px 40px 20px;
          text-align: center;
          position: relative;
        }
        
        .logo {
          font-family: 'Playfair Display', 'Fraunces', Georgia, serif;
          font-size: 16px;
          letter-spacing: 1px;
          text-transform: uppercase;
          color: #7cb97c;
          margin-bottom: 8px;
        }
        
        .tool-title {
          font-family: 'Fraunces', Georgia, serif;
          font-size: 32px;
          font-weight: 600;
          color: #fff;
        }
        
        .step-content {
          max-width: 560px;
          margin: 0 auto;
          padding: 40px 24px 80px;
          position: relative;
        }
        
        .step-header {
          margin-bottom: 40px;
        }
        
        .step-number {
          font-family: 'Fraunces', Georgia, serif;
          font-size: 48px;
          font-weight: 700;
          color: rgba(124, 185, 124, 0.3);
          display: block;
          margin-bottom: -10px;
        }
        
        .step-header h2 {
          font-family: 'Fraunces', Georgia, serif;
          font-size: 28px;
          font-weight: 600;
          margin-bottom: 8px;
          color: #fff;
        }
        
        .step-header p {
          font-size: 16px;
          color: rgba(240, 244, 232, 0.7);
        }
        
        .form-group {
          margin-bottom: 24px;
        }
        
        .form-group label {
          display: block;
          font-size: 13px;
          font-weight: 500;
          text-transform: uppercase;
          letter-spacing: 1px;
          color: rgba(240, 244, 232, 0.6);
          margin-bottom: 8px;
        }
        
        .form-group input,
        .form-group textarea {
          width: 100%;
          padding: 16px 20px;
          font-size: 18px;
          font-family: inherit;
          background: rgba(255, 255, 255, 0.08);
          border: 2px solid rgba(255, 255, 255, 0.1);
          border-radius: 12px;
          color: #fff;
          transition: all 0.2s ease;
        }
        
        .form-group input:focus,
        .form-group textarea:focus {
          outline: none;
          border-color: #7cb97c;
          background: rgba(255, 255, 255, 0.12);
        }
        
        .form-group input::placeholder,
        .form-group textarea::placeholder {
          color: rgba(255, 255, 255, 0.3);
        }

        .form-row-half {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 16px;
        }

        @media (max-width: 500px) {
          .form-row-half {
            grid-template-columns: 1fr;
          }
        }
        
        .miss-options {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }
        
        .miss-card {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 20px 24px;
          background: rgba(255, 255, 255, 0.05);
          border: 2px solid rgba(255, 255, 255, 0.1);
          border-radius: 12px;
          cursor: pointer;
          transition: all 0.2s ease;
        }
        
        .miss-card:hover {
          background: rgba(255, 255, 255, 0.08);
          border-color: rgba(255, 255, 255, 0.2);
        }
        
        .miss-card.selected {
          background: rgba(124, 185, 124, 0.15);
          border-color: #7cb97c;
        }
        
        .miss-label {
          font-size: 17px;
          font-weight: 500;
          margin-bottom: 4px;
        }
        
        .miss-desc {
          font-size: 14px;
          color: rgba(240, 244, 232, 0.5);
        }
        
        .check-mark {
          width: 28px;
          height: 28px;
          border-radius: 50%;
          background: rgba(255, 255, 255, 0.1);
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 14px;
          opacity: 0;
          transition: all 0.2s ease;
        }
        
        .miss-card.selected .check-mark {
          opacity: 1;
          background: #7cb97c;
          color: #0d1f0d;
        }
        
        .strength-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 12px;
        }
        
        .strength-card {
          display: flex;
          flex-direction: column;
          align-items: center;
          padding: 24px 16px;
          background: rgba(255, 255, 255, 0.05);
          border: 2px solid rgba(255, 255, 255, 0.1);
          border-radius: 12px;
          cursor: pointer;
          transition: all 0.2s ease;
        }
        
        .strength-card:hover {
          background: rgba(255, 255, 255, 0.08);
        }
        
        .strength-card.selected {
          background: rgba(124, 185, 124, 0.15);
          border-color: #7cb97c;
        }
        
        .strength-icon {
          font-size: 32px;
          margin-bottom: 8px;
        }
        
        .strength-label {
          font-size: 14px;
          font-weight: 500;
          text-align: center;
        }
        
        .upload-zone {
          position: relative;
          margin-bottom: 24px;
        }
        
        .upload-input {
          position: absolute;
          width: 100%;
          height: 100%;
          opacity: 0;
          cursor: pointer;
        }
        
        .upload-label {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 48px 24px;
          background: rgba(255, 255, 255, 0.03);
          border: 2px dashed rgba(255, 255, 255, 0.2);
          border-radius: 16px;
          cursor: pointer;
          transition: all 0.2s ease;
        }
        
        .upload-zone:hover .upload-label {
          background: rgba(255, 255, 255, 0.06);
          border-color: #7cb97c;
        }
        
        .upload-icon {
          font-size: 48px;
          margin-bottom: 16px;
        }
        
        .upload-text {
          text-align: center;
        }
        
        .upload-text strong {
          display: block;
          font-size: 16px;
          margin-bottom: 4px;
        }
        
        .upload-text span {
          font-size: 14px;
          color: rgba(240, 244, 232, 0.5);
        }
        
        .uploaded-cards {
          margin-bottom: 24px;
        }
        
        .cards-header {
          font-size: 14px;
          color: #7cb97c;
          margin-bottom: 12px;
        }
        
        .cards-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 12px;
        }
        
        .card-preview {
          position: relative;
          aspect-ratio: 3/4;
          border-radius: 8px;
          overflow: hidden;
          background: rgba(0,0,0,0.3);
        }
        
        .card-preview img {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }
        
        .remove-card {
          position: absolute;
          top: 4px;
          right: 4px;
          width: 24px;
          height: 24px;
          border-radius: 50%;
          background: rgba(0,0,0,0.7);
          border: none;
          color: #fff;
          font-size: 16px;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        
        .error-message {
          background: rgba(196, 69, 54, 0.2);
          border: 1px solid rgba(196, 69, 54, 0.5);
          color: #ff9b8a;
          padding: 12px 16px;
          border-radius: 8px;
          margin-bottom: 16px;
          font-size: 14px;
        }
        
        .btn-group {
          display: flex;
          gap: 12px;
          margin-top: 32px;
        }
        
        .next-btn, .back-btn {
          padding: 16px 32px;
          font-size: 16px;
          font-weight: 600;
          font-family: inherit;
          border: none;
          border-radius: 12px;
          cursor: pointer;
          transition: all 0.2s ease;
        }
        
        .next-btn {
          flex: 1;
          background: linear-gradient(135deg, #7cb97c, #5a9a5a);
          color: #0d1f0d;
        }
        
        .next-btn:hover:not(:disabled) {
          transform: translateY(-2px);
          box-shadow: 0 8px 24px rgba(124, 185, 124, 0.3);
        }
        
        .next-btn:disabled {
          opacity: 0.4;
          cursor: not-allowed;
        }
        
        .back-btn {
          background: rgba(255, 255, 255, 0.1);
          color: #fff;
        }
        
        .back-btn:hover {
          background: rgba(255, 255, 255, 0.15);
        }
        
        .skip-note {
          text-align: center;
          margin-top: 24px;
          font-size: 14px;
          color: rgba(240, 244, 232, 0.5);
        }
        
        .skip-link {
          background: none;
          border: none;
          color: #7cb97c;
          text-decoration: underline;
          cursor: pointer;
          font-size: 14px;
          font-family: inherit;
        }
        
        .analyzing-screen {
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 40px;
        }
        
        .analyzing-content {
          text-align: center;
        }
        
        .analyzing-spinner {
          width: 64px;
          height: 64px;
          border: 4px solid rgba(124, 185, 124, 0.2);
          border-top-color: #7cb97c;
          border-radius: 50%;
          margin: 0 auto 24px;
          animation: spin 1s linear infinite;
        }
        
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
        
        .analyzing-content h2 {
          font-family: 'Fraunces', Georgia, serif;
          font-size: 24px;
          margin-bottom: 32px;
        }
        
        .analyzing-steps {
          display: flex;
          flex-direction: column;
          gap: 12px;
          text-align: left;
          max-width: 200px;
          margin: 0 auto;
        }
        
        .analyzing-step {
          font-size: 14px;
          color: rgba(240, 244, 232, 0.4);
          transition: all 0.3s ease;
        }
        
        .analyzing-step.active {
          color: #7cb97c;
        }
        
        /* Results */
        .results-container {
          padding: 40px 24px 80px;
          position: relative;
        }

        /* Preview/Teaser Mode Styles */
        .preview-mode {
          padding-top: 80px;
        }

        .teaser-header {
          max-width: 700px;
          margin: 0 auto 40px;
          text-align: center;
        }

        .teaser-badge {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          background: rgba(124, 185, 124, 0.15);
          border: 1px solid rgba(124, 185, 124, 0.3);
          padding: 8px 16px;
          border-radius: 20px;
          margin-bottom: 24px;
        }

        .teaser-icon {
          font-size: 18px;
        }

        .teaser-text {
          font-size: 14px;
          font-weight: 500;
          color: #7cb97c;
        }

        .teaser-headline {
          font-family: 'Fraunces', Georgia, serif;
          font-size: 42px;
          font-weight: 600;
          line-height: 1.2;
          margin-bottom: 16px;
        }

        .teaser-headline .highlight {
          color: #7cb97c;
        }

        .teaser-subhead {
          font-size: 18px;
          color: rgba(240, 244, 232, 0.7);
          line-height: 1.5;
        }

        .teaser-insight {
          max-width: 700px;
          margin: 0 auto 40px;
          background: linear-gradient(135deg, rgba(124, 185, 124, 0.15), rgba(124, 185, 124, 0.05));
          border: 1px solid rgba(124, 185, 124, 0.3);
          padding: 24px 28px;
        }

        .blurred-preview {
          position: relative;
          max-width: 900px;
          margin: 0 auto;
        }

        .blur-overlay {
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: linear-gradient(180deg, rgba(13, 31, 13, 0.5) 0%, rgba(13, 31, 13, 0.98) 60%);
          z-index: 10;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 16px;
        }

        .unlock-prompt {
          text-align: center;
          padding: 40px;
        }

        .unlock-prompt h2 {
          font-family: 'Fraunces', Georgia, serif;
          font-size: 28px;
          margin-bottom: 12px;
        }

        .unlock-prompt > p {
          color: rgba(240, 244, 232, 0.7);
          margin-bottom: 20px;
        }

        .unlock-features {
          list-style: none;
          text-align: left;
          display: inline-block;
          margin-bottom: 28px;
        }

        .unlock-features li {
          padding: 8px 0;
          font-size: 15px;
          color: rgba(240, 244, 232, 0.9);
        }

        .unlock-btn {
          display: block;
          width: 100%;
          padding: 16px 32px;
          font-size: 17px;
          font-weight: 600;
          background: linear-gradient(135deg, #7cb97c, #5a9a5a);
          color: #0d1f0d;
          border: none;
          border-radius: 12px;
          cursor: pointer;
          font-family: inherit;
          margin-bottom: 16px;
        }

        .unlock-btn:hover {
          transform: translateY(-2px);
          box-shadow: 0 8px 24px rgba(124, 185, 124, 0.3);
        }

        .unlock-note {
          font-size: 14px;
          color: rgba(240, 244, 232, 0.5);
        }

        .link-btn {
          background: none;
          border: none;
          color: #7cb97c;
          font-size: 14px;
          cursor: pointer;
          text-decoration: underline;
          font-family: inherit;
        }

        .blurred-content {
          filter: blur(8px);
          opacity: 0.5;
          pointer-events: none;
          min-height: 400px;
        }

        .blurred-content .results-section {
          margin-bottom: 24px;
          background: rgba(255, 255, 255, 0.03);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 16px;
          padding: 24px;
        }
        
        .results-header {
          max-width: 900px;
          margin: 0 auto 32px;
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          flex-wrap: wrap;
          gap: 24px;
        }
        
        .results-title h1 {
          font-family: 'Fraunces', Georgia, serif;
          font-size: 42px;
          font-weight: 800;
          margin-bottom: 8px;
        }
        
        .results-title p {
          font-size: 16px;
          color: rgba(240, 244, 232, 0.6);
        }
        
        .potential-badge {
          background: linear-gradient(135deg, rgba(124, 185, 124, 0.2), rgba(124, 185, 124, 0.1));
          border: 1px solid rgba(124, 185, 124, 0.3);
          border-radius: 12px;
          padding: 16px 24px;
          text-align: center;
        }
        
        .potential-label {
          display: block;
          font-size: 12px;
          text-transform: uppercase;
          letter-spacing: 1px;
          color: #7cb97c;
          margin-bottom: 4px;
        }
        
        .potential-value {
          font-family: 'Fraunces', Georgia, serif;
          font-size: 28px;
          font-weight: 700;
          color: #fff;
        }
        
        .key-insight {
          max-width: 900px;
          margin: 0 auto 32px;
          background: rgba(124, 185, 124, 0.1);
          border: 1px solid rgba(124, 185, 124, 0.2);
          border-radius: 12px;
          padding: 20px 24px;
        }
        
        .insight-label {
          font-size: 11px;
          text-transform: uppercase;
          letter-spacing: 1px;
          color: #7cb97c;
          display: block;
          margin-bottom: 8px;
        }
        
        .key-insight p {
          font-size: 18px;
          line-height: 1.5;
        }
        
        .results-grid {
          max-width: 900px;
          margin: 0 auto;
          display: grid;
          gap: 24px;
        }
        
        .results-section {
          background: rgba(255, 255, 255, 0.03);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 16px;
          padding: 24px;
        }
        
        .section-header {
          display: flex;
          align-items: center;
          gap: 12px;
          margin-bottom: 20px;
        }
        
        .section-icon {
          font-size: 24px;
        }
        
        .section-header h2 {
          font-family: 'Fraunces', Georgia, serif;
          font-size: 20px;
          font-weight: 600;
        }
        
        .rounds-summary {
          display: flex;
          flex-wrap: wrap;
          gap: 12px;
        }
        
        .round-chip {
          background: rgba(0, 0, 0, 0.2);
          border-radius: 8px;
          padding: 12px 16px;
          text-align: center;
        }
        
        .round-score {
          display: block;
          font-size: 24px;
          font-weight: 700;
          color: #7cb97c;
        }
        
        .round-date {
          font-size: 12px;
          color: rgba(240, 244, 232, 0.5);
        }
        
        .overall-approach {
          font-size: 16px;
          line-height: 1.6;
          color: rgba(240, 244, 232, 0.8);
          margin-bottom: 20px;
          font-style: italic;
        }
        
        .light-system {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }
        
        .light-group {
          padding: 16px;
          border-radius: 8px;
          background: rgba(0, 0, 0, 0.2);
        }
        
        .light-header {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-bottom: 8px;
        }
        
        .light-group p {
          font-size: 14px;
          color: rgba(240, 244, 232, 0.7);
        }
        
        .hole-cards {
          display: grid;
          gap: 16px;
        }
        
        .hole-card {
          background: rgba(0, 0, 0, 0.2);
          border-radius: 12px;
          padding: 20px;
          border-left: 4px solid;
        }
        
        .hole-card.trouble {
          border-color: #c44536;
        }
        
        .hole-card.strength {
          border-color: #7cb97c;
        }
        
        .hole-type {
          font-weight: 600;
          font-size: 16px;
          margin-bottom: 4px;
        }
        
        .specific-holes {
          font-size: 13px;
          color: #7cb97c;
          margin-bottom: 8px;
        }
        
        .hole-problem,
        .hole-opportunity {
          font-size: 14px;
          color: rgba(240, 244, 232, 0.7);
          margin-bottom: 12px;
        }
        
        .hole-strategy,
        .club-rec {
          font-size: 14px;
          line-height: 1.5;
          margin-bottom: 8px;
        }
        
        .acceptable-score,
        .target-score {
          margin-top: 12px;
          font-size: 13px;
          color: rgba(240, 244, 232, 0.5);
        }
        
        .acceptable-score span,
        .target-score span {
          color: #7cb97c;
          font-weight: 600;
        }
        
        .practice-session {
          background: rgba(0, 0, 0, 0.2);
          border-radius: 12px;
          padding: 20px;
          margin-bottom: 16px;
        }
        
        .practice-session:last-child {
          margin-bottom: 0;
        }
        
        .session-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 8px;
        }
        
        .session-header h3 {
          font-size: 16px;
          font-weight: 600;
        }
        
        .session-duration {
          font-size: 13px;
          color: #7cb97c;
          background: rgba(124, 185, 124, 0.15);
          padding: 4px 12px;
          border-radius: 20px;
        }
        
        .session-focus {
          font-size: 14px;
          color: rgba(240, 244, 232, 0.6);
          margin-bottom: 16px;
        }
        
        .drills-list {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }
        
        .drill-item {
          padding: 12px 16px;
          background: rgba(255, 255, 255, 0.03);
          border-radius: 8px;
        }
        
        .drill-name {
          font-weight: 500;
          margin-bottom: 4px;
        }
        
        .drill-desc {
          font-size: 14px;
          color: rgba(240, 244, 232, 0.7);
          margin-bottom: 4px;
        }
        
        .drill-why {
          font-size: 13px;
          color: rgba(240, 244, 232, 0.5);
          margin-bottom: 8px;
        }
        
        .drill-reps {
          font-size: 12px;
          color: #7cb97c;
        }
        
        .preround-list {
          list-style: none;
          counter-reset: preround;
        }
        
        .preround-list li {
          counter-increment: preround;
          padding: 12px 16px 12px 48px;
          position: relative;
          font-size: 15px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.05);
        }
        
        .preround-list li:last-child {
          border-bottom: none;
        }
        
        .preround-list li::before {
          content: counter(preround);
          position: absolute;
          left: 16px;
          width: 24px;
          height: 24px;
          background: rgba(124, 185, 124, 0.2);
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 12px;
          font-weight: 600;
          color: #7cb97c;
        }
        
        .mental-item {
          margin-bottom: 16px;
        }
        
        .mental-item strong {
          display: block;
          font-size: 13px;
          color: rgba(240, 244, 232, 0.5);
          margin-bottom: 4px;
        }
        
        .mental-item p {
          font-size: 15px;
        }
        
        .mantras {
          margin-top: 16px;
        }
        
        .mantras > strong {
          display: block;
          font-size: 13px;
          color: rgba(240, 244, 232, 0.5);
          margin-bottom: 12px;
        }
        
        .mantra-item {
          padding: 12px 16px;
          background: rgba(0, 0, 0, 0.2);
          border-radius: 8px;
          font-style: italic;
          font-size: 15px;
          border-left: 3px solid #7cb97c;
          margin-bottom: 8px;
        }
        
        .stats-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(100px, 1fr));
          gap: 16px;
        }
        
        .stat-item {
          text-align: center;
          padding: 20px 12px;
          background: rgba(0, 0, 0, 0.2);
          border-radius: 12px;
        }
        
        .stat-value {
          font-family: 'Fraunces', Georgia, serif;
          font-size: 24px;
          font-weight: 700;
          color: #7cb97c;
          margin-bottom: 4px;
        }
        
        .stat-label {
          font-size: 12px;
          text-transform: uppercase;
          letter-spacing: 1px;
          color: rgba(240, 244, 232, 0.5);
        }
        
        .week-cards {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
          gap: 16px;
        }
        
        .week-card {
          background: rgba(0, 0, 0, 0.2);
          border-radius: 12px;
          padding: 20px;
        }
        
        .week-number {
          font-size: 12px;
          text-transform: uppercase;
          letter-spacing: 1px;
          color: #7cb97c;
          margin-bottom: 8px;
        }
        
        .week-focus {
          font-weight: 600;
          margin-bottom: 12px;
        }
        
        .week-goals {
          list-style: none;
          font-size: 14px;
          color: rgba(240, 244, 232, 0.7);
        }
        
        .week-goals li {
          padding: 4px 0;
          padding-left: 16px;
          position: relative;
        }
        
        .week-goals li::before {
          content: '•';
          position: absolute;
          left: 0;
          color: #7cb97c;
        }
        
        .results-footer {
          max-width: 900px;
          margin: 40px auto 0;
          display: flex;
          gap: 16px;
          justify-content: center;
        }
        
        .restart-btn, .print-btn {
          padding: 14px 28px;
          font-size: 15px;
          font-weight: 600;
          font-family: inherit;
          border: none;
          border-radius: 10px;
          cursor: pointer;
          transition: all 0.2s ease;
        }
        
        .restart-btn {
          background: rgba(255, 255, 255, 0.1);
          color: #fff;
        }
        
        .print-btn {
          background: linear-gradient(135deg, #7cb97c, #5a9a5a);
          color: #0d1f0d;
        }
        
        .print-btn.secondary {
          background: rgba(255, 255, 255, 0.1);
          color: #fff;
        }
        
        .loading-screen {
          min-height: 100vh;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
        }
        
        .logo-btn {
          background: none;
          border: none;
          color: #7cb97c;
          font-size: 18px;
          font-weight: 600;
          cursor: pointer;
          font-family: 'Playfair Display', 'Fraunces', Georgia, serif;
          padding: 0;
          letter-spacing: -0.5px;
        }
        
        .logo-btn:hover {
          color: #a8d4a8;
        }

        .logo-text {
          font-weight: 600;
          font-size: 18px;
          color: #7cb97c;
          font-family: 'Playfair Display', 'Fraunces', Georgia, serif;
          letter-spacing: -0.5px;
        }

        .landing-header {
          background: transparent;
          border-bottom: none;
        }

        .signin-btn {
          padding: 10px 24px;
          font-size: 14px;
          font-weight: 600;
          background: linear-gradient(135deg, #7cb97c, #5a9a5a);
          color: #0d1f0d;
          border: none;
          border-radius: 8px;
          cursor: pointer;
          font-family: inherit;
        }

        .signin-btn:hover {
          opacity: 0.9;
        }

        .user-header {
          position: fixed;
          top: 0;
          right: 0;
          left: 0;
          padding: 12px 24px;
          display: flex;
          justify-content: space-between;
          align-items: center;
          background: rgba(13, 31, 13, 0.9);
          backdrop-filter: blur(10px);
          border-bottom: 1px solid rgba(255, 255, 255, 0.1);
          z-index: 50;
        }
        
        .user-info {
          display: flex;
          align-items: center;
          gap: 12px;
        }
        
        .user-name {
          font-weight: 500;
        }
        
        .user-badge {
          font-size: 11px;
          padding: 4px 10px;
          border-radius: 20px;
          text-transform: uppercase;
          letter-spacing: 1px;
        }
        
        .user-badge.pro {
          background: linear-gradient(135deg, #7cb97c, #5a9a5a);
          color: #0d1f0d;
        }
        
        .user-credits {
          font-size: 13px;
          color: rgba(240, 244, 232, 0.6);
        }
        
        .user-actions {
          display: flex;
          align-items: center;
          gap: 12px;
        }
        
        .upgrade-btn {
          padding: 8px 16px;
          font-size: 13px;
          font-weight: 600;
          background: linear-gradient(135deg, #7cb97c, #5a9a5a);
          color: #0d1f0d;
          border: none;
          border-radius: 6px;
          cursor: pointer;
          font-family: inherit;
        }
        
        .logout-btn {
          padding: 8px 16px;
          font-size: 13px;
          background: transparent;
          color: rgba(240, 244, 232, 0.6);
          border: 1px solid rgba(255, 255, 255, 0.2);
          border-radius: 6px;
          cursor: pointer;
          font-family: inherit;
        }
        
        .logout-btn:hover {
          color: #fff;
          border-color: rgba(255, 255, 255, 0.4);
        }

        .dashboard-spacer {
          height: 60px;
        }
        
        @media (max-width: 640px) {
          .cards-grid {
            grid-template-columns: repeat(3, 1fr);
          }
          
          .results-header {
            flex-direction: column;
          }
          
          .stats-grid {
            grid-template-columns: repeat(2, 1fr);
          }
        }
        
        @media print {
          .golf-tool {
            background: white;
            color: black;
          }
          
          .results-footer {
            display: none;
          }
        }
      `}</style>
      
      {/* Dashboard View */}
      {view === 'dashboard' && isAuthenticated && (
        <Dashboard 
          onNewAnalysis={startNewAnalysis}
          onViewAnalysis={viewAnalysis}
        />
      )}

      {/* Landing / Analysis Flow */}
      {(view === 'landing' || view === 'analysis') && (
        <>
          {step < 5 && !isAnalyzing && (
            <>
              <div className="progress-bar">
                <div className="progress-fill" style={{ width: `${(step / 4) * 100}%` }} />
              </div>
              
              <header className="tool-header">
                <div className="logo">Golf Strategy</div>
                <h1 className="tool-title">Improve Your Golf Game</h1>
              </header>
            </>
          )}
          
          {isAnalyzing ? renderAnalyzing() : (
            <>
              {step === 1 && renderStep1()}
              {step === 2 && renderStep2()}
              {step === 3 && renderStep3()}
              {step === 4 && renderStep4()}
            </>
          )}
        </>
      )}

      {/* Results View */}
      {(view === 'results' || step === 5) && analysis && renderResults()}
    </div>
  );
}
