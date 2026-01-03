import React, { useState, useEffect } from 'react';
import { useAuth } from './context/AuthContext';
import AuthModal from './components/AuthModal';
import PricingModal from './components/PricingModal';
import Dashboard from './components/Dashboard';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

export default function App() {
  const { user, token, isAuthenticated, loading: authLoading, logout, canAnalyze, updateCredits, refreshUser } = useAuth();
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [showPricingModal, setShowPricingModal] = useState(false);
  const [authMode, setAuthMode] = useState('login');
  const [showPricingFlow, setShowPricingFlow] = useState(false); // Combined signup + pricing
  const [currentAnalysisId, setCurrentAnalysisId] = useState(null);
  const [view, setView] = useState('landing'); // 'landing', 'dashboard', 'analysis', 'results', 'courseStrategy'
  
  // Course Strategy state
  const [showCourseModal, setShowCourseModal] = useState(false);
  const [courseStrategyData, setCourseStrategyData] = useState(null);
  const [courseForm, setCourseForm] = useState({
    courseName: '',
    tees: '',
    notes: '',
    scorecardImage: null
  });
  const [isGeneratingCourse, setIsGeneratingCourse] = useState(false);
  
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
  
  // GHIN connection state
  const [ghinConnected, setGhinConnected] = useState(false);
  const [ghinToken, setGhinToken] = useState(null);
  const [ghinScores, setGhinScores] = useState(null);
  const [isConnectingGhin, setIsConnectingGhin] = useState(false);
  const [showGhinModal, setShowGhinModal] = useState(false);
  const [ghinCredentials, setGhinCredentials] = useState({ emailOrGhin: '', password: '' });

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

  // Handle Stripe payment success redirect
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const paymentStatus = urlParams.get('payment');
    
    if (paymentStatus === 'success' && isAuthenticated) {
      // Clean up URL
      window.history.replaceState({}, '', window.location.pathname);
      
      // Refresh user data to get updated subscription
      if (refreshUser) refreshUser();
      
      // Try to restore pending analysis from localStorage
      const savedPending = localStorage.getItem('pendingAnalysis');
      const restoredPending = savedPending ? JSON.parse(savedPending) : pendingAnalysis;
      
      // If there's a pending analysis, show it
      if (restoredPending) {
        setAnalysis(restoredPending.analysis);
        setPreviewMode(false);
        setStep(5);
        setView('results');
        setPendingAnalysis(null);
        localStorage.removeItem('pendingAnalysis');
        setShowAuthModal(false);
      } else {
        // Otherwise just go to dashboard
        setView('dashboard');
      }
    }
  }, [isAuthenticated]);

  // File upload limits
  const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB per file
  const MAX_TOTAL_SIZE = 50 * 1024 * 1024; // 50MB total
  const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];

  const handleFileUpload = (e) => {
    const files = Array.from(e.target.files);
    const validFiles = [];
    const errors = [];

    // Calculate current total size
    const currentTotalSize = formData.uploadedCards.reduce((sum, card) => sum + (card.file?.size || 0), 0);
    let newTotalSize = currentTotalSize;

    for (const file of files) {
      // Check file type
      if (!ALLOWED_TYPES.includes(file.type) && !file.name.toLowerCase().match(/\.(heic|heif)$/)) {
        errors.push(`${file.name}: Invalid file type. Please upload images only.`);
        continue;
      }

      // Check individual file size
      if (file.size > MAX_FILE_SIZE) {
        errors.push(`${file.name}: File too large (max 10MB per file)`);
        continue;
      }

      // Check total size
      if (newTotalSize + file.size > MAX_TOTAL_SIZE) {
        errors.push(`${file.name}: Would exceed total upload limit (50MB)`);
        continue;
      }

      newTotalSize += file.size;
      validFiles.push({
        name: file.name,
        file: file,
        size: file.size,
        preview: URL.createObjectURL(file)
      });
    }

    if (errors.length > 0) {
      setError(errors.join('\n'));
      // Clear error after 5 seconds
      setTimeout(() => setError(null), 5000);
    }

    if (validFiles.length > 0) {
      setFormData(prev => ({
        ...prev,
        uploadedCards: [...prev.uploadedCards, ...validFiles].slice(0, 10)
      }));
    }
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

  // Connect to GHIN and fetch scores
  const connectGhin = async () => {
    if (!ghinCredentials.emailOrGhin || !ghinCredentials.password) {
      setError('Please enter your GHIN email/number and password');
      return;
    }

    setIsConnectingGhin(true);
    setError(null);

    try {
      // First authenticate with GHIN
      const connectResponse = await fetch(`${API_URL}/api/ghin/connect`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          emailOrGhin: ghinCredentials.emailOrGhin,
          password: ghinCredentials.password
        })
      });

      const connectData = await connectResponse.json();

      if (!connectResponse.ok) {
        throw new Error(connectData.error || 'Failed to connect to GHIN');
      }

      // Store token and golfer info
      setGhinToken(connectData.ghinToken);
      
      // Update form with golfer info
      setFormData(prev => ({
        ...prev,
        name: connectData.golfer.fullName || `${connectData.golfer.firstName} ${connectData.golfer.lastName}`,
        handicap: connectData.golfer.handicapIndex?.toString() || prev.handicap
      }));

      // Now fetch detailed scores
      const scoresResponse = await fetch(`${API_URL}/api/ghin/detailed-scores`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          ghinNumber: connectData.golfer.ghinNumber,
          ghinToken: connectData.ghinToken,
          limit: 20
        })
      });

      const scoresData = await scoresResponse.json();

      if (scoresData.success) {
        setGhinScores(scoresData);
        setGhinConnected(true);
        setShowGhinModal(false);
        
        // Auto-detect home course from most played course
        if (scoresData.scores?.length > 0) {
          const courseCounts = {};
          scoresData.scores.forEach(s => {
            courseCounts[s.courseName] = (courseCounts[s.courseName] || 0) + 1;
          });
          const topCourse = Object.entries(courseCounts).sort((a, b) => b[1] - a[1])[0];
          if (topCourse && !formData.homeCourse) {
            setFormData(prev => ({ ...prev, homeCourse: topCourse[0] }));
          }
        }
      }

    } catch (err) {
      setError(err.message);
    } finally {
      setIsConnectingGhin(false);
    }
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
      
      // Include GHIN scores if connected
      if (ghinConnected && ghinScores?.scores) {
        submitData.append('ghinScores', JSON.stringify(ghinScores.scores));
      }
      
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
          const pending = {
            analysis: data.analysis,
            formData: { ...formData }
          };
          setPendingAnalysis(pending);
          // Also save to localStorage in case of Stripe redirect
          localStorage.setItem('pendingAnalysis', JSON.stringify(pending));
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

  // Unlock full analysis - ONLY called after explicit payment/trial code
  const unlockAnalysis = async () => {
    if (!pendingAnalysis || !isAuthenticated || !user) return;
    
    try {
      // Save the analysis to user's account (consumes 1 credit if not pro)
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
      
      // Reveal full analysis and close modals
      setPreviewMode(false);
      setPendingAnalysis(null);
      setShowAuthModal(false);
      setShowPricingFlow(false);
    } catch (error) {
      console.error('Error saving analysis:', error);
      // Don't unlock on error - keep preview mode
    }
  };

  // NO auto-unlock effect - user must always go through payment flow
  // This effect only handles cleanup/edge cases
  useEffect(() => {
    // If user is authenticated but in preview mode, ensure auth modal stays open for payment
    if (isAuthenticated && previewMode && pendingAnalysis && !showAuthModal) {
      // User somehow closed modal while in preview - reopen it
      setShowPricingFlow(true);
      setShowAuthModal(true);
    }
  }, [isAuthenticated, previewMode, pendingAnalysis, showAuthModal]);

  // Handle payment success redirect from Stripe
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const paymentStatus = urlParams.get('payment');
    
    if (paymentStatus === 'success' && isAuthenticated) {
      // Clear the URL param
      window.history.replaceState({}, '', window.location.pathname);
      
      // Refresh user data to get updated credits/subscription
      if (refreshUser) {
        refreshUser();
      }
      
      // If we have a pending analysis, unlock it
      if (pendingAnalysis) {
        unlockAnalysis();
      } else {
        // No pending analysis - go to dashboard
        setView('dashboard');
      }
    }
  }, [isAuthenticated, pendingAnalysis]);

  // Start new analysis from dashboard
  const startNewAnalysis = () => {
    resetForm();
    setView('analysis');
    setStep(1);
  };

  // Open course strategy modal
  const openCourseStrategy = () => {
    setCourseForm({
      courseName: '',
      tees: '',
      notes: '',
      scorecardImage: null
    });
    setCourseStrategyData(null);
    setShowCourseModal(true);
  };

  // Generate course strategy
  const generateCourseStrategy = async () => {
    if (!courseForm.courseName.trim()) return;
    
    setIsGeneratingCourse(true);
    
    try {
      const formDataToSend = new FormData();
      formDataToSend.append('courseName', courseForm.courseName);
      formDataToSend.append('tees', courseForm.tees);
      formDataToSend.append('notes', courseForm.notes);
      formDataToSend.append('handicap', user?.handicap || 15);
      formDataToSend.append('missPattern', formData.missPattern || 'slice');
      
      if (courseForm.scorecardImage) {
        formDataToSend.append('scorecard', courseForm.scorecardImage);
      }

      const response = await fetch(`${API_URL}/api/course-strategy`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        },
        body: formDataToSend
      });

      if (response.ok) {
        const data = await response.json();
        setCourseStrategyData(data.strategy);
        setShowCourseModal(false);
        setView('courseStrategy');
      } else {
        const errorData = await response.json();
        alert(errorData.error || 'Failed to generate course strategy');
      }
    } catch (error) {
      console.error('Course strategy error:', error);
      alert('Failed to generate course strategy');
    } finally {
      setIsGeneratingCourse(false);
    }
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

  // View a specific course strategy from dashboard
  const viewCourseStrategy = async (strategyId) => {
    try {
      const response = await fetch(`${API_URL}/api/course-strategies/${strategyId}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        const data = await response.json();
        setCourseStrategyData(data.strategy.strategy_json);
        setView('courseStrategy');
      }
    } catch (error) {
      console.error('Error loading course strategy:', error);
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
          placeholder="e.g., Bobby Berger"
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
            placeholder="e.g., 15"
          />
        </div>
        <div className="form-group">
          <label>Target Stroke Index</label>
          <input
            type="number"
            step="0.1"
            value={formData.targetHandicap}
            onChange={(e) => setFormData(prev => ({ ...prev, targetHandicap: e.target.value }))}
            placeholder="e.g., 10"
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
        <h2>Add your scores</h2>
        <p>Connect GHIN for automatic import, or upload scorecard screenshots.</p>
      </div>
      
      {/* GHIN Connection Option */}
      {!ghinConnected ? (
        <div className="ghin-connect-section">
          <div className="ghin-coming-soon">
            <span className="ghin-icon">⛳</span>
            <div className="ghin-btn-text">
              <strong>GHIN Auto-Import</strong>
              <span>Coming soon! For now, upload scorecard screenshots below.</span>
            </div>
          </div>
          
          <p className="ghin-tip">
            💡 <strong>Tip:</strong> Hole-by-hole scorecards work best!
          </p>
        </div>
      ) : (
        <div className="ghin-connected-section">
          <div className="ghin-success">
            <span className="success-icon">✓</span>
            <div className="success-text">
              <strong>GHIN Connected!</strong>
              <span>{ghinScores?.scores?.length || 0} rounds imported • {ghinScores?.scoresWithHoleData || 0} with hole-by-hole data</span>
            </div>
          </div>
          
          {ghinScores?.scores?.length > 0 && (
            <div className="imported-rounds">
              <div className="rounds-preview">
                {ghinScores.scores.slice(0, 5).map((score, i) => (
                  <div key={i} className="round-chip imported">
                    <span className="round-score">{score.totalScore}</span>
                    <span className="round-course">{score.courseName?.substring(0, 20)}</span>
                    {score.holeScores && <span className="hole-badge">18H</span>}
                  </div>
                ))}
                {ghinScores.scores.length > 5 && (
                  <div className="round-chip more">+{ghinScores.scores.length - 5} more</div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
      
      {/* Manual Upload Option */}
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
            <strong>{ghinConnected ? 'Add more scorecards (optional)' : 'Drop scorecards here'}</strong>
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
           (ghinConnected || formData.uploadedCards.length >= 3)
            ? 'Analyze My Game →' 
            : `Analyze (${formData.uploadedCards.length} cards)`}
        </button>
      </div>
      
      {!ghinConnected && formData.uploadedCards.length < 3 && (
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
              {(analysis.courseStrategy.redLightHoles?.holes?.length > 0 || 
                (Array.isArray(analysis.courseStrategy.redLightHoles) && analysis.courseStrategy.redLightHoles.length > 0)) && (
                <div className="light-group red">
                  <div className="light-header">
                    <span className="light-indicator">🔴</span>
                    <strong>Red Light — Play Safe</strong>
                  </div>
                  <p className="light-holes">
                    {analysis.courseStrategy.redLightHoles?.holes 
                      ? (Array.isArray(analysis.courseStrategy.redLightHoles.holes) 
                          ? analysis.courseStrategy.redLightHoles.holes.join(', ')
                          : analysis.courseStrategy.redLightHoles.holes)
                      : (Array.isArray(analysis.courseStrategy.redLightHoles) 
                          ? analysis.courseStrategy.redLightHoles.join(', ')
                          : analysis.courseStrategy.redLightHoles)}
                  </p>
                  {analysis.courseStrategy.redLightHoles?.strategy && (
                    <p className="light-strategy">{analysis.courseStrategy.redLightHoles.strategy}</p>
                  )}
                </div>
              )}
              
              {(analysis.courseStrategy.yellowLightHoles?.holes?.length > 0 || 
                (Array.isArray(analysis.courseStrategy.yellowLightHoles) && analysis.courseStrategy.yellowLightHoles.length > 0)) && (
                <div className="light-group yellow">
                  <div className="light-header">
                    <span className="light-indicator">🟡</span>
                    <strong>Yellow Light — Conditional</strong>
                  </div>
                  <p className="light-holes">
                    {analysis.courseStrategy.yellowLightHoles?.holes 
                      ? (Array.isArray(analysis.courseStrategy.yellowLightHoles.holes) 
                          ? analysis.courseStrategy.yellowLightHoles.holes.join(', ')
                          : analysis.courseStrategy.yellowLightHoles.holes)
                      : (Array.isArray(analysis.courseStrategy.yellowLightHoles) 
                          ? analysis.courseStrategy.yellowLightHoles.join(', ')
                          : analysis.courseStrategy.yellowLightHoles)}
                  </p>
                  {analysis.courseStrategy.yellowLightHoles?.strategy && (
                    <p className="light-strategy">{analysis.courseStrategy.yellowLightHoles.strategy}</p>
                  )}
                </div>
              )}
              
              {(analysis.courseStrategy.greenLightHoles?.holes?.length > 0 || 
                (Array.isArray(analysis.courseStrategy.greenLightHoles) && analysis.courseStrategy.greenLightHoles.length > 0)) && (
                <div className="light-group green">
                  <div className="light-header">
                    <span className="light-indicator">🟢</span>
                    <strong>Green Light — Attack</strong>
                  </div>
                  <p className="light-holes">
                    {analysis.courseStrategy.greenLightHoles?.holes 
                      ? (Array.isArray(analysis.courseStrategy.greenLightHoles.holes) 
                          ? analysis.courseStrategy.greenLightHoles.holes.join(', ')
                          : analysis.courseStrategy.greenLightHoles.holes)
                      : (Array.isArray(analysis.courseStrategy.greenLightHoles) 
                          ? analysis.courseStrategy.greenLightHoles.join(', ')
                          : analysis.courseStrategy.greenLightHoles)}
                  </p>
                  {analysis.courseStrategy.greenLightHoles?.strategy && (
                    <p className="light-strategy">{analysis.courseStrategy.greenLightHoles.strategy}</p>
                  )}
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
                    <div className="target-label">Target:</div>
                    <div className="target-value">{hole.acceptableScore}</div>
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
                      <div className="target-label">Target:</div>
                      <div className="target-value">{hole.targetScore}</div>
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
        requirePayment={previewMode && pendingAnalysis !== null}
        onUnlock={unlockAnalysis}
        onGhinConnected={async ({ ghinToken: newGhinToken, golfer }) => {
          // User signed up with GHIN - fetch their scores
          setGhinToken(newGhinToken);
          setFormData(prev => ({
            ...prev,
            name: `${golfer.firstName} ${golfer.lastName}`,
            handicap: golfer.handicapIndex?.toString() || prev.handicap
          }));
          
          // Fetch detailed scores
          try {
            const scoresResponse = await fetch(`${API_URL}/api/ghin/detailed-scores`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
              },
              body: JSON.stringify({
                ghinNumber: golfer.ghinNumber,
                ghinToken: newGhinToken,
                limit: 20
              })
            });
            const scoresData = await scoresResponse.json();
            if (scoresData.success) {
              setGhinScores(scoresData);
              setGhinConnected(true);
              
              // Auto-detect home course
              if (scoresData.scores?.length > 0) {
                const courseCounts = {};
                scoresData.scores.forEach(s => {
                  courseCounts[s.courseName] = (courseCounts[s.courseName] || 0) + 1;
                });
                const topCourse = Object.entries(courseCounts).sort((a, b) => b[1] - a[1])[0];
                if (topCourse && !formData.homeCourse) {
                  setFormData(prev => ({ ...prev, homeCourse: topCourse[0] }));
                }
              }
            }
          } catch (err) {
            console.error('Failed to fetch GHIN scores:', err);
          }
        }}
      />
      
      {/* GHIN Connect Modal (separate from auth flow) */}
      {showGhinModal && (
        <div className="modal-overlay" onClick={() => setShowGhinModal(false)}>
          <div className="modal-content ghin-modal" onClick={e => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setShowGhinModal(false)}>×</button>
            
            <h2>⛳ Connect GHIN Account</h2>
            <p className="modal-subtitle">
              Import your recent rounds automatically, including hole-by-hole scores when available.
            </p>

            {error && <div className="auth-error">{error}</div>}

            <div className="form-group">
              <label>GHIN Email or Number</label>
              <input
                type="text"
                value={ghinCredentials.emailOrGhin}
                onChange={e => setGhinCredentials(prev => ({ ...prev, emailOrGhin: e.target.value }))}
                placeholder="email@example.com or 1234567"
              />
            </div>

            <div className="form-group">
              <label>GHIN Password</label>
              <input
                type="password"
                value={ghinCredentials.password}
                onChange={e => setGhinCredentials(prev => ({ ...prev, password: e.target.value }))}
                placeholder="Your GHIN password"
              />
            </div>

            <button 
              className="ghin-submit-btn"
              onClick={connectGhin}
              disabled={isConnectingGhin}
            >
              {isConnectingGhin ? 'Connecting...' : 'Connect & Import Scores'}
            </button>

            <p className="ghin-note">
              🔒 Your credentials are used only to fetch your scores and are not stored.
            </p>
          </div>
        </div>
      )}
      
      {/* Pricing Modal */}
      <PricingModal
        isOpen={showPricingModal}
        onClose={() => setShowPricingModal(false)}
      />

      {/* Course Strategy Modal */}
      {showCourseModal && (
        <div className="modal-overlay" onClick={() => setShowCourseModal(false)}>
          <div className="modal-content course-modal" onClick={e => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setShowCourseModal(false)}>×</button>
            
            <h2>+Course Strategy</h2>
            <p className="modal-subtitle">
              Get a game plan for a course you're about to play
            </p>

            <div className="form-group">
              <label>Course Name *</label>
              <input
                type="text"
                value={courseForm.courseName}
                onChange={e => setCourseForm(prev => ({ ...prev, courseName: e.target.value }))}
                placeholder="e.g., Pebble Beach Golf Links"
              />
            </div>

            <div className="form-group">
              <label>Which Tees?</label>
              <input
                type="text"
                value={courseForm.tees}
                onChange={e => setCourseForm(prev => ({ ...prev, tees: e.target.value }))}
                placeholder="e.g., Blue tees (6,500 yards)"
              />
            </div>

            <div className="form-group">
              <label>Anything specific you want to know?</label>
              <textarea
                value={courseForm.notes}
                onChange={e => setCourseForm(prev => ({ ...prev, notes: e.target.value }))}
                placeholder="e.g., Playing in a tournament, nervous about the water holes, wind expected..."
                rows={3}
              />
            </div>

            <div className="form-group">
              <label>Upload Scorecard (optional)</label>
              <p className="form-hint">Upload an image of the scorecard for hole-by-hole yardages</p>
              <input
                type="file"
                accept="image/*"
                onChange={e => setCourseForm(prev => ({ ...prev, scorecardImage: e.target.files[0] }))}
                className="file-input"
              />
              {courseForm.scorecardImage && (
                <p className="file-name">📎 {courseForm.scorecardImage.name}</p>
              )}
            </div>

            <button 
              className="generate-btn"
              onClick={generateCourseStrategy}
              disabled={!courseForm.courseName.trim() || isGeneratingCourse}
            >
              {isGeneratingCourse ? (
                <>
                  <span className="btn-spinner"></span>
                  Generating Strategy...
                </>
              ) : (
                'Generate Course Strategy'
              )}
            </button>
          </div>
        </div>
      )}
      
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
          padding: 130px 40px 20px;
          text-align: center;
          position: relative;
        }
        
        .logo {
          font-family: 'DM Sans', sans-serif;
          font-size: 13px;
          font-weight: 500;
          letter-spacing: 3px;
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

        /* GHIN Connect Styles */
        .ghin-connect-section {
          margin-bottom: 24px;
        }

        .ghin-coming-soon {
          display: flex;
          align-items: center;
          gap: 16px;
          padding: 20px 24px;
          background: rgba(255, 255, 255, 0.03);
          border: 2px solid rgba(255, 255, 255, 0.1);
          border-radius: 16px;
          margin-bottom: 12px;
        }

        .ghin-coming-soon .ghin-icon {
          font-size: 28px;
          opacity: 0.5;
        }

        .ghin-coming-soon .ghin-btn-text strong {
          display: block;
          font-size: 14px;
          color: rgba(240, 244, 232, 0.5);
          margin-bottom: 4px;
        }

        .ghin-coming-soon .ghin-btn-text span {
          font-size: 13px;
          color: rgba(240, 244, 232, 0.4);
        }

        .ghin-tip {
          background: rgba(124, 185, 124, 0.1);
          border-left: 3px solid #7cb97c;
          padding: 12px 16px;
          text-align: center;
          border-radius: 0 8px 8px 0;
          font-size: 13px;
          color: rgba(240, 244, 232, 0.8);
          margin-bottom: 20px;
          margin-top: 20px;
        }

        .ghin-tip strong {
          color: #7cb97c;
        }

        .ghin-connect-btn {
          width: 100%;
          display: flex;
          align-items: center;
          gap: 16px;
          padding: 20px 24px;
          background: linear-gradient(135deg, rgba(124, 185, 124, 0.15), rgba(124, 185, 124, 0.05));
          border: 2px solid rgba(124, 185, 124, 0.3);
          border-radius: 16px;
          cursor: pointer;
          transition: all 0.2s ease;
          text-align: left;
          font-family: inherit;
          color: inherit;
        }

        .ghin-connect-btn:hover {
          background: linear-gradient(135deg, rgba(124, 185, 124, 0.25), rgba(124, 185, 124, 0.1));
          border-color: #7cb97c;
          transform: translateY(-2px);
        }

        .ghin-icon {
          font-size: 32px;
        }

        .ghin-btn-text {
          flex: 1;
        }

        .ghin-btn-text strong {
          display: block;
          font-size: 16px;
          margin-bottom: 4px;
        }

        .ghin-btn-text span {
          font-size: 13px;
          color: rgba(240, 244, 232, 0.6);
        }

        .ghin-arrow {
          font-size: 20px;
          color: #7cb97c;
        }

        .or-divider {
          display: flex;
          align-items: center;
          gap: 16px;
          margin: 24px 0;
        }

        .or-divider::before,
        .or-divider::after {
          content: '';
          flex: 1;
          height: 1px;
          background: rgba(255, 255, 255, 0.1);
        }

        .or-divider span {
          font-size: 13px;
          color: rgba(240, 244, 232, 0.4);
          text-transform: uppercase;
          letter-spacing: 1px;
        }

        .ghin-connected-section {
          margin-bottom: 24px;
        }

        .ghin-success {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 16px 20px;
          background: rgba(124, 185, 124, 0.1);
          border: 1px solid rgba(124, 185, 124, 0.3);
          border-radius: 12px;
          margin-bottom: 16px;
        }

        .success-icon {
          width: 32px;
          height: 32px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: #7cb97c;
          color: #0d1f0d;
          border-radius: 50%;
          font-weight: bold;
        }

        .success-text strong {
          display: block;
          color: #7cb97c;
          margin-bottom: 2px;
        }

        .success-text span {
          font-size: 13px;
          color: rgba(240, 244, 232, 0.6);
        }

        .imported-rounds {
          margin-top: 12px;
        }

        .rounds-preview {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
        }

        .round-chip.imported {
          background: rgba(124, 185, 124, 0.1);
          border: 1px solid rgba(124, 185, 124, 0.2);
          padding: 8px 12px;
          border-radius: 8px;
          font-size: 12px;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 4px;
        }

        .round-chip.imported .round-score {
          font-size: 18px;
          font-weight: 600;
          color: #7cb97c;
        }

        .round-chip.imported .round-course {
          font-size: 10px;
          color: rgba(240, 244, 232, 0.5);
        }

        .hole-badge {
          background: #7cb97c;
          color: #0d1f0d;
          font-size: 9px;
          padding: 2px 6px;
          border-radius: 4px;
          font-weight: 600;
        }

        .round-chip.more {
          background: rgba(255, 255, 255, 0.05);
          color: rgba(240, 244, 232, 0.5);
          font-size: 12px;
          padding: 8px 12px;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        /* Modal Overlay Styles */
        .modal-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0, 0, 0, 0.85);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000;
          padding: 20px;
          overflow-y: auto;
        }

        .modal-content {
          background: linear-gradient(145deg, #1a3a1a, #0d1f0d);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 20px;
          padding: 40px;
          width: 100%;
          position: relative;
        }

        .modal-close {
          position: absolute;
          top: 16px;
          right: 16px;
          width: 32px;
          height: 32px;
          background: rgba(255, 255, 255, 0.1);
          border: none;
          border-radius: 50%;
          color: rgba(255, 255, 255, 0.6);
          font-size: 20px;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .modal-close:hover {
          background: rgba(255, 255, 255, 0.2);
          color: #fff;
        }

        .modal-subtitle {
          color: rgba(240, 244, 232, 0.7);
          margin-bottom: 24px;
        }

        .auth-error {
          background: rgba(220, 53, 69, 0.2);
          border: 1px solid rgba(220, 53, 69, 0.5);
          color: #ff6b6b;
          padding: 12px 16px;
          border-radius: 8px;
          margin-bottom: 16px;
          font-size: 14px;
        }

        .form-group {
          margin-bottom: 16px;
        }

        .form-group label {
          display: block;
          font-size: 12px;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          color: rgba(240, 244, 232, 0.6);
          margin-bottom: 6px;
        }

        .modal-content input {
          width: 100%;
          padding: 14px 16px;
          font-size: 16px;
          background: rgba(255, 255, 255, 0.08);
          border: 2px solid rgba(255, 255, 255, 0.1);
          border-radius: 10px;
          color: #fff;
          font-family: inherit;
        }

        .modal-content input:focus {
          outline: none;
          border-color: #7cb97c;
        }

        .ghin-modal {
          max-width: 420px;
        }

        .ghin-submit-btn {
          width: 100%;
          padding: 16px;
          background: linear-gradient(135deg, #7cb97c, #5a9a5a);
          color: #0d1f0d;
          border: none;
          border-radius: 12px;
          font-size: 16px;
          font-weight: 600;
          cursor: pointer;
          font-family: inherit;
          margin-top: 8px;
        }

        .ghin-submit-btn:hover {
          transform: translateY(-2px);
        }

        .ghin-submit-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
          transform: none;
        }

        .ghin-note {
          margin-top: 16px;
          font-size: 12px;
          color: rgba(240, 244, 232, 0.5);
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
          padding: 28px;
          margin-bottom: 16px;
        }
        
        .results-section + .results-section {
          margin-top: 8px;
        }
        
        .section-header {
          display: flex;
          align-items: center;
          gap: 12px;
          margin-bottom: 24px;
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
          gap: 16px;
          margin-top: 8px;
        }
        
        .light-group {
          padding: 20px;
          border-radius: 12px;
          background: rgba(0, 0, 0, 0.25);
        }
        
        .light-header {
          display: flex;
          align-items: center;
          gap: 10px;
          margin-bottom: 12px;
        }
        
        .light-group p {
          font-size: 14px;
          color: rgba(240, 244, 232, 0.7);
        }

        .light-holes {
          font-weight: 600;
          font-size: 15px;
          color: rgba(240, 244, 232, 0.9) !important;
          margin-bottom: 8px;
        }

        .light-strategy {
          font-size: 13px !important;
          line-height: 1.6;
          color: rgba(240, 244, 232, 0.65) !important;
          margin-top: 8px;
          padding-top: 12px;
          border-top: 1px solid rgba(255, 255, 255, 0.1);
        }
        
        .hole-cards {
          display: grid;
          gap: 20px;
        }
        
        .hole-card {
          background: rgba(0, 0, 0, 0.2);
          border-radius: 12px;
          padding: 24px;
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
          margin-bottom: 6px;
        }
        
        .specific-holes {
          font-size: 13px;
          color: #7cb97c;
          margin-bottom: 12px;
        }
        
        .hole-problem,
        .hole-opportunity {
          font-size: 14px;
          color: rgba(240, 244, 232, 0.7);
          margin-bottom: 14px;
          line-height: 1.5;
        }
        
        .hole-strategy,
        .club-rec {
          font-size: 14px;
          line-height: 1.5;
          margin-bottom: 10px;
        }
        
        .acceptable-score,
        .target-score {
          margin-top: 16px;
          padding-top: 12px;
          border-top: 1px solid rgba(255, 255, 255, 0.1);
        }
        
        .acceptable-score .target-label,
        .target-score .target-label {
          font-size: 12px;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          color: rgba(240, 244, 232, 0.5);
          margin-bottom: 4px;
        }
        
        .acceptable-score .target-value,
        .target-score .target-value {
          font-family: 'Fraunces', Georgia, serif;
          font-size: 20px;
          font-weight: 600;
        }
        
        .acceptable-score .target-value {
          color: #d4a017;
        }
        
        .target-score .target-value {
          color: #7cb97c;
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
          font-size: 16px;
          font-weight: 600;
          cursor: pointer;
          font-family: 'DM Sans', sans-serif;
          padding: 0;
          white-space: nowrap;
        }
        
        .logo-btn:hover {
          color: #a8d4a8;
        }

        .logo-text {
          font-weight: 600;
          font-size: 16px;
          color: #7cb97c;
          font-family: 'DM Sans', sans-serif;
          white-space: nowrap;
        }

        .logo-link {
          font-family: 'DM Sans', sans-serif;
          font-size: 15px;
          font-weight: 600;
          color: #7cb97c;
          margin-bottom: 12px;
          background: none;
          border: none;
          cursor: pointer;
          display: block;
        }

        .logo-link:hover {
          color: #a8d4a8;
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

        /* Mobile nav adjustments */
        @media (max-width: 768px) {
          .user-header {
            padding: 10px 16px;
          }

          .user-info {
            gap: 8px;
          }

          .logo-btn, .logo-text {
            font-size: 15px;
          }

          .user-name {
            display: none;
          }

          .user-actions {
            gap: 8px;
          }

          .user-credits {
            font-size: 12px;
          }

          .upgrade-btn {
            padding: 6px 12px;
            font-size: 12px;
          }

          .logout-btn {
            padding: 6px 10px;
            font-size: 11px;
          }
        }

        @media (max-width: 480px) {
          .user-header {
            padding: 8px 12px;
          }

          .logo-btn, .logo-text {
            font-size: 14px;
          }

          .user-credits {
            display: none;
          }

          .upgrade-btn {
            padding: 6px 10px;
            font-size: 11px;
          }

          .logout-btn {
            padding: 6px 8px;
            font-size: 10px;
          }
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
          /* Base print setup */
          body, html, #root {
            background: white !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }

          .golf-tool {
            background: white !important;
            color: black !important;
            padding: 0 !important;
          }
          
          /* Hide navigation elements */
          .user-header,
          .results-footer,
          .results-nav,
          .back-btn,
          .download-btn,
          .action-btn {
            display: none !important;
          }

          /* Main results container */
          .results-view {
            padding: 40px !important;
            max-width: 100% !important;
          }

          /* Results header - clean centered title */
          .results-header {
            text-align: center !important;
            margin-bottom: 40px !important;
            padding-bottom: 20px !important;
            border-bottom: 2px solid #2d5a2d !important;
          }

          .results-header h1 {
            color: #1a3a1a !important;
            font-size: 28px !important;
          }

          .results-header p {
            color: #666 !important;
            font-size: 14px !important;
          }

          /* Sections - clean and spacious */
          .results-section {
            background: white !important;
            border: none !important;
            padding: 24px 0 !important;
            margin-bottom: 24px !important;
            page-break-inside: avoid;
            border-bottom: 1px solid #eee !important;
          }

          .section-header h2 {
            color: #1a3a1a !important;
            font-size: 16px !important;
          }

          .section-icon {
            display: none !important;
          }

          /* Light system (traffic light) */
          .light-system {
            display: grid !important;
            grid-template-columns: 1fr 1fr 1fr !important;
            gap: 16px !important;
          }

          .light-group {
            background: #f8f9f7 !important;
            padding: 16px !important;
            border-radius: 8px !important;
            border: 1px solid #e0e0e0 !important;
          }

          .light-group.red {
            border-left: 3px solid #c44 !important;
          }

          .light-group.yellow {
            border-left: 3px solid #f0ad4e !important;
          }

          .light-group.green {
            border-left: 3px solid #2d5a2d !important;
          }

          .light-header strong {
            color: #333 !important;
            font-size: 13px !important;
          }

          .light-indicator {
            font-size: 12px !important;
          }

          .light-holes {
            color: #333 !important;
            font-size: 12px !important;
          }

          .light-strategy {
            color: #666 !important;
            font-size: 11px !important;
            border-top-color: #eee !important;
          }

          /* Hole cards */
          .hole-cards {
            display: grid !important;
            gap: 12px !important;
          }

          .hole-card {
            background: #f8f9f7 !important;
            border: 1px solid #e0e0e0 !important;
            padding: 12px 16px !important;
            border-radius: 4px !important;
          }

          .hole-card.trouble {
            border-left: 3px solid #c44 !important;
          }

          .hole-card.strength {
            border-left: 3px solid #2d5a2d !important;
          }

          .hole-type {
            color: #333 !important;
            font-size: 13px !important;
          }

          .hole-problem, .hole-opportunity {
            color: #666 !important;
            font-size: 12px !important;
          }

          .hole-strategy-text, .hole-target {
            color: #333 !important;
            font-size: 11px !important;
          }

          /* Practice cards */
          .practice-cards,
          .drill-cards {
            display: grid !important;
            gap: 12px !important;
          }

          .practice-card,
          .drill-card {
            background: #f8f9f7 !important;
            border: 1px solid #e0e0e0 !important;
            padding: 12px 16px !important;
            border-radius: 4px !important;
          }

          .practice-title,
          .drill-name {
            color: #2d5a2d !important;
            font-size: 13px !important;
          }

          .practice-duration,
          .drill-reps {
            color: #666 !important;
            font-size: 11px !important;
          }

          /* Mental game */
          .mental-card {
            background: #f0f7f0 !important;
            border-left: 3px solid #2d5a2d !important;
            padding: 12px 16px !important;
          }

          .mental-label {
            color: #2d5a2d !important;
            font-size: 11px !important;
          }

          .mental-content {
            color: #333 !important;
            font-size: 13px !important;
          }

          /* Stats grid */
          .stats-grid {
            display: grid !important;
            grid-template-columns: repeat(3, 1fr) !important;
            gap: 12px !important;
          }

          .stat-item {
            background: #f8f9f7 !important;
            border: 1px solid #e0e0e0 !important;
            padding: 12px !important;
            text-align: center !important;
          }

          .stat-label {
            color: #666 !important;
            font-size: 10px !important;
          }

          .stat-value {
            color: #1a3a1a !important;
            font-size: 18px !important;
          }

          /* Page breaks for 2-page layout */
          .results-section:nth-child(5) {
            page-break-before: always;
          }
        }

        /* Course Strategy Modal */
        .course-modal {
          max-width: 500px;
        }

        .course-modal .form-group {
          margin-bottom: 20px;
        }

        .course-modal label {
          display: block;
          font-size: 13px;
          font-weight: 500;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          color: rgba(240, 244, 232, 0.7);
          margin-bottom: 8px;
        }

        .course-modal input,
        .course-modal textarea {
          width: 100%;
          padding: 14px 16px;
          font-size: 16px;
          background: rgba(255, 255, 255, 0.08);
          border: 2px solid rgba(255, 255, 255, 0.1);
          border-radius: 10px;
          color: #fff;
          font-family: inherit;
        }

        .course-modal input:focus,
        .course-modal textarea:focus {
          outline: none;
          border-color: #7cb97c;
        }

        .form-hint {
          font-size: 12px;
          color: rgba(240, 244, 232, 0.5);
          margin-bottom: 8px;
        }

        .file-input {
          padding: 12px !important;
          cursor: pointer;
        }

        .file-name {
          font-size: 13px;
          color: #7cb97c;
          margin-top: 8px;
        }

        .generate-btn {
          width: 100%;
          padding: 16px;
          font-size: 16px;
          font-weight: 600;
          background: linear-gradient(135deg, #7cb97c, #5a9a5a);
          color: #0d1f0d;
          border: none;
          border-radius: 12px;
          cursor: pointer;
          font-family: inherit;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
        }

        .generate-btn:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .btn-spinner {
          width: 18px;
          height: 18px;
          border: 2px solid rgba(0, 0, 0, 0.2);
          border-top-color: #0d1f0d;
          border-radius: 50%;
          animation: spin 0.8s linear infinite;
        }

        /* Course Strategy View */
        .course-strategy-view {
          max-width: 900px;
          margin: 0 auto;
          padding: 20px;
          padding-top: 80px; /* Account for fixed header */
        }

        .course-strategy-view .results-nav {
          display: flex;
          align-items: center;
          gap: 16px;
          margin-bottom: 24px;
          padding-bottom: 16px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.1);
        }

        .course-strategy-view .nav-logo {
          color: rgba(240, 244, 232, 0.5);
          font-size: 14px;
        }

        .course-strategy-content {
          padding: 20px 0;
        }

        .course-header {
          text-align: center;
          margin-bottom: 32px;
        }

        .course-header h1 {
          font-family: 'Fraunces', Georgia, serif;
          font-size: 32px;
          margin-bottom: 8px;
        }

        .course-subtitle {
          color: rgba(240, 244, 232, 0.6);
          font-size: 15px;
        }

        .strategy-section {
          background: rgba(255, 255, 255, 0.03);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 16px;
          padding: 24px;
          margin-bottom: 20px;
        }

        .overview-text {
          font-size: 16px;
          line-height: 1.7;
          color: rgba(240, 244, 232, 0.85);
        }

        .key-holes {
          display: grid;
          gap: 16px;
        }

        .hole-card {
          background: rgba(255, 255, 255, 0.03);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 12px;
          padding: 16px;
        }

        .hole-number {
          font-family: 'Fraunces', Georgia, serif;
          font-size: 18px;
          font-weight: 600;
          color: #7cb97c;
          margin-bottom: 4px;
        }

        .hole-info {
          display: flex;
          gap: 12px;
          margin-bottom: 8px;
        }

        .hole-par, .hole-yardage {
          font-size: 12px;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          color: rgba(240, 244, 232, 0.5);
        }

        .hole-strategy {
          font-size: 15px;
          color: rgba(240, 244, 232, 0.85);
          line-height: 1.5;
        }

        .hole-danger {
          margin-top: 8px;
          font-size: 13px;
          color: #e57373;
        }

        .strategy-tips {
          display: grid;
          gap: 12px;
        }

        .tip-card {
          background: rgba(124, 185, 124, 0.08);
          border-left: 3px solid #7cb97c;
          padding: 16px;
          border-radius: 0 8px 8px 0;
        }

        .tip-title {
          font-weight: 600;
          margin-bottom: 4px;
          color: #7cb97c;
        }

        .tip-desc {
          font-size: 14px;
          color: rgba(240, 244, 232, 0.8);
          line-height: 1.5;
        }

        .scoring-targets {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 16px;
        }

        @media (max-width: 600px) {
          .scoring-targets {
            grid-template-columns: 1fr;
          }
        }

        .target-card {
          text-align: center;
          padding: 20px;
          background: rgba(255, 255, 255, 0.03);
          border-radius: 12px;
          border: 1px solid rgba(255, 255, 255, 0.1);
        }

        .target-card.good {
          border-color: rgba(124, 185, 124, 0.5);
          background: rgba(124, 185, 124, 0.1);
        }

        .target-card.solid {
          border-color: rgba(124, 185, 124, 0.3);
        }

        .target-label {
          font-size: 12px;
          text-transform: uppercase;
          letter-spacing: 1px;
          color: rgba(240, 244, 232, 0.5);
          margin-bottom: 8px;
        }

        .target-score {
          font-family: 'Fraunces', Georgia, serif;
          font-size: 32px;
          font-weight: 600;
          color: #fff;
        }

        .checklist {
          list-style: none;
          padding: 0;
        }

        .checklist li {
          padding: 12px 0;
          border-bottom: 1px solid rgba(255, 255, 255, 0.05);
          color: rgba(240, 244, 232, 0.8);
        }

        .checklist li:last-child {
          border-bottom: none;
        }

        .checklist li::before {
          content: '☐ ';
          color: #7cb97c;
        }

        .course-footer {
          padding: 24px 0;
          display: flex;
          justify-content: space-between;
          align-items: center;
          flex-wrap: wrap;
          gap: 16px;
          border-top: 1px solid rgba(255, 255, 255, 0.1);
          margin-top: 20px;
        }

        .course-footer-actions {
          display: flex;
          gap: 12px;
        }

        .save-btn, .share-btn {
          padding: 12px 20px;
          font-size: 14px;
          font-weight: 600;
          border-radius: 10px;
          cursor: pointer;
          font-family: inherit;
          transition: all 0.2s;
        }

        .save-btn {
          background: linear-gradient(135deg, #7cb97c, #5a9a5a);
          color: #0d1f0d;
          border: none;
        }

        .save-btn:hover {
          transform: translateY(-1px);
          box-shadow: 0 4px 12px rgba(124, 185, 124, 0.3);
        }

        .share-btn {
          background: transparent;
          color: #7cb97c;
          border: 1px solid rgba(124, 185, 124, 0.4);
        }

        .share-btn:hover {
          background: rgba(124, 185, 124, 0.1);
        }

        @media (max-width: 600px) {
          .course-footer {
            flex-direction: column;
          }
          
          .course-footer-actions {
            width: 100%;
          }

          .save-btn, .share-btn {
            flex: 1;
          }
        }

        @media print {
          /* Hide ALL navigation and non-content elements */
          .user-header,
          .course-footer,
          .course-strategy-view .results-nav,
          .back-btn,
          .save-btn,
          .share-btn,
          .course-footer-actions {
            display: none !important;
          }

          /* Force white background on everything */
          body,
          html,
          #root,
          .golf-tool,
          .course-strategy-view,
          .course-strategy-content {
            background: white !important;
            background-color: white !important;
            color: black !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          
          /* Reset layout for printing */
          .course-strategy-view {
            position: absolute !important;
            top: 0 !important;
            left: 0 !important;
            right: 0 !important;
            padding: 40px !important;
            max-width: 100% !important;
            min-height: auto !important;
          }
          
          .course-strategy-content {
            padding: 0 !important;
            max-width: 700px !important;
            margin: 0 auto !important;
          }

          /* Course header styling */
          .course-header {
            text-align: center !important;
            margin-bottom: 40px !important;
            padding-bottom: 24px !important;
            border-bottom: 2px solid #2d5a2d !important;
          }

          .course-header h1 {
            color: #1a3a1a !important;
            font-size: 32px !important;
            margin-bottom: 8px !important;
          }

          .course-subtitle {
            color: #666 !important;
            font-size: 14px !important;
          }

          /* Section styling for clean 2-page layout */
          .strategy-section {
            background: white !important;
            border: none !important;
            border-radius: 0 !important;
            padding: 24px 0 !important;
            margin-bottom: 24px !important;
            page-break-inside: avoid;
            border-bottom: 1px solid #eee !important;
          }

          .section-header {
            margin-bottom: 16px !important;
          }

          .section-header h2 {
            color: #1a3a1a !important;
            font-size: 18px !important;
            font-weight: 600 !important;
          }

          .section-icon {
            display: none !important;
          }

          /* Overview text */
          .overview-text {
            color: #333 !important;
            font-size: 14px !important;
            line-height: 1.7 !important;
          }

          /* Key holes cards */
          .key-holes {
            display: grid !important;
            grid-template-columns: 1fr !important;
            gap: 16px !important;
          }

          .hole-card {
            background: #f8f9f7 !important;
            border: 1px solid #e0e0e0 !important;
            border-left: 3px solid #2d5a2d !important;
            border-radius: 4px !important;
            padding: 16px !important;
            page-break-inside: avoid;
          }

          .hole-number {
            color: #2d5a2d !important;
            font-weight: 600 !important;
            font-size: 15px !important;
          }

          .hole-info {
            margin: 4px 0 8px 0 !important;
          }

          .hole-par, .hole-yardage {
            color: #666 !important;
            font-size: 12px !important;
          }

          .hole-strategy {
            color: #333 !important;
            font-size: 13px !important;
            line-height: 1.5 !important;
          }

          .hole-danger {
            color: #c44 !important;
            font-size: 12px !important;
            margin-top: 8px !important;
          }

          /* Strategy tips */
          .strategy-tips {
            display: grid !important;
            gap: 12px !important;
          }

          .tip-card {
            background: #f0f7f0 !important;
            border-left: 3px solid #2d5a2d !important;
            padding: 12px 16px !important;
            border-radius: 4px !important;
          }

          .tip-title {
            color: #2d5a2d !important;
            font-weight: 600 !important;
            font-size: 14px !important;
            margin-bottom: 4px !important;
          }

          .tip-desc {
            color: #333 !important;
            font-size: 13px !important;
            line-height: 1.5 !important;
          }

          /* Scoring targets */
          .scoring-targets {
            display: flex !important;
            justify-content: center !important;
            gap: 24px !important;
          }

          .target-card {
            background: #f8f9f7 !important;
            border: 1px solid #e0e0e0 !important;
            padding: 16px 24px !important;
            border-radius: 8px !important;
            text-align: center !important;
            min-width: 100px !important;
          }

          .target-label {
            color: #666 !important;
            font-size: 11px !important;
            text-transform: uppercase !important;
            letter-spacing: 0.5px !important;
          }

          .target-score {
            color: #1a3a1a !important;
            font-size: 24px !important;
            font-weight: 700 !important;
          }

          /* Checklist */
          .checklist {
            list-style: none !important;
            padding: 0 !important;
          }

          .checklist li {
            color: #333 !important;
            padding: 10px 0 !important;
            border-bottom: 1px solid #eee !important;
            font-size: 13px !important;
          }

          .checklist li::before {
            content: "☐ " !important;
            color: #2d5a2d !important;
          }

          /* Page breaks for 2-page layout */
          .strategy-section:nth-child(4) {
            page-break-before: always;
          }
        }
      `}</style>
      
      {/* Dashboard View */}
      {view === 'dashboard' && isAuthenticated && (
        <Dashboard 
          onNewAnalysis={startNewAnalysis}
          onViewAnalysis={viewAnalysis}
          onNewCourseStrategy={openCourseStrategy}
          onViewCourseStrategy={viewCourseStrategy}
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
                <div className="logo">GOLF STRATEGY</div>
                <h1 className="tool-title">Analyze Your Game</h1>
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

      {/* Course Strategy View */}
      {view === 'courseStrategy' && courseStrategyData && (
        <div className="course-strategy-view">
          <div className="results-nav">
            <button className="back-btn" onClick={() => { setView('dashboard'); setCourseStrategyData(null); }}>
              ← Back to Dashboard
            </button>
            <span className="nav-logo">Course Strategy</span>
          </div>

          <div className="course-strategy-content">
            <div className="course-header">
              <h1>{courseStrategyData.courseName}</h1>
              <p className="course-subtitle">
                {courseStrategyData.tees && `${courseStrategyData.tees} • `}
                Strategy for {user?.handicap || 15} handicap
              </p>
            </div>

            {/* Overview */}
            {courseStrategyData.overview && (
              <section className="strategy-section">
                <div className="section-header">
                  <span className="section-icon">📋</span>
                  <h2>Course Overview</h2>
                </div>
                <p className="overview-text">{courseStrategyData.overview}</p>
              </section>
            )}

            {/* Key Holes */}
            {courseStrategyData.keyHoles && courseStrategyData.keyHoles.length > 0 && (
              <section className="strategy-section">
                <div className="section-header">
                  <span className="section-icon">⚠️</span>
                  <h2>Key Holes to Watch</h2>
                </div>
                <div className="key-holes">
                  {courseStrategyData.keyHoles.map((hole, i) => (
                    <div key={i} className="hole-card">
                      <div className="hole-number">Hole {hole.number}</div>
                      <div className="hole-info">
                        {hole.par && <span className="hole-par">Par {hole.par}</span>}
                        {hole.yardage && <span className="hole-yardage">{hole.yardage} yds</span>}
                      </div>
                      <p className="hole-strategy">{hole.strategy}</p>
                      {hole.danger && <p className="hole-danger">⚠️ {hole.danger}</p>}
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* General Strategy */}
            {courseStrategyData.generalStrategy && (
              <section className="strategy-section">
                <div className="section-header">
                  <span className="section-icon">🎯</span>
                  <h2>Your Game Plan</h2>
                </div>
                <div className="strategy-tips">
                  {courseStrategyData.generalStrategy.map((tip, i) => (
                    <div key={i} className="tip-card">
                      <div className="tip-title">{tip.title}</div>
                      <p className="tip-desc">{tip.description}</p>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Scoring Targets */}
            {courseStrategyData.scoringTargets && (
              <section className="strategy-section">
                <div className="section-header">
                  <span className="section-icon">🏆</span>
                  <h2>Scoring Targets</h2>
                </div>
                <div className="scoring-targets">
                  <div className="target-card good">
                    <div className="target-label">Great Round</div>
                    <div className="target-score">{courseStrategyData.scoringTargets.great}</div>
                  </div>
                  <div className="target-card solid">
                    <div className="target-label">Solid Round</div>
                    <div className="target-score">{courseStrategyData.scoringTargets.solid}</div>
                  </div>
                  <div className="target-card">
                    <div className="target-label">Keep It Under</div>
                    <div className="target-score">{courseStrategyData.scoringTargets.max}</div>
                  </div>
                </div>
              </section>
            )}

            {/* Pre-Round Checklist */}
            {courseStrategyData.preRoundChecklist && (
              <section className="strategy-section">
                <div className="section-header">
                  <span className="section-icon">✅</span>
                  <h2>Pre-Round Checklist</h2>
                </div>
                <ul className="checklist">
                  {courseStrategyData.preRoundChecklist.map((item, i) => (
                    <li key={i}>{item}</li>
                  ))}
                </ul>
              </section>
            )}
          </div>

          <div className="course-footer">
            <button className="back-btn" onClick={() => { setView('dashboard'); setCourseStrategyData(null); }}>
              ← Back to Dashboard
            </button>
            <div className="course-footer-actions">
              <button className="save-btn" onClick={() => window.print()}>
                🖨️ Print / Save PDF
              </button>
              <button className="share-btn" onClick={() => {
                if (navigator.share) {
                  navigator.share({
                    title: `${courseStrategyData.courseName} - Course Strategy`,
                    text: `My strategy for playing ${courseStrategyData.courseName}`,
                    url: window.location.href
                  });
                } else {
                  navigator.clipboard.writeText(window.location.href);
                  alert('Link copied to clipboard!');
                }
              }}>
                📤 Share
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
