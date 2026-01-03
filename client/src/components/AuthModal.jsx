import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

export default function AuthModal({ isOpen, onClose, initialMode = 'login', defaultName = '', showPricing = false, requirePayment = false, onUnlock = null }) {
  const [mode, setMode] = useState(initialMode);
  const [step, setStep] = useState('auth'); // 'auth' or 'pricing'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState(defaultName);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState(null);

  const [trialCode, setTrialCode] = useState('');
  const [trialSuccess, setTrialSuccess] = useState(false);

  const { login, register, token, isAuthenticated, user } = useAuth();

  // Handle close - prevent if payment is required and user has no credits
  const handleClose = () => {
    if (requirePayment && step === 'pricing') {
      // Check if user has credits or subscription
      const canAccess = user?.subscriptionStatus === 'pro' || (user?.credits && user.credits > 0);
      if (!canAccess) {
        // Don't allow closing - user must pay
        return;
      }
    }
    onClose();
  };

  const handleTrialCode = async () => {
    if (!trialCode.trim()) return;
    setLoading(true);
    setError('');
    
    try {
      const response = await fetch(`${API_URL}/api/payments/activate-trial`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ code: trialCode.trim().toUpperCase() })
      });

      const data = await response.json();

      if (data.success) {
        setTrialSuccess(true);
        setTimeout(() => {
          if (onUnlock) onUnlock();
          onClose();
          window.location.reload(); // Refresh to update user state
        }, 1500);
      } else {
        setError(data.error || 'Invalid trial code');
      }
    } catch (err) {
      setError('Failed to activate trial code');
    } finally {
      setLoading(false);
    }
  };

  // Update name when defaultName changes
  useEffect(() => {
    if (defaultName && !name) {
      setName(defaultName);
    }
  }, [defaultName]);

  // Reset when modal opens
  useEffect(() => {
    if (isOpen) {
      setMode(initialMode);
      // If already authenticated and showing pricing, go straight to pricing
      if (isAuthenticated && showPricing) {
        setStep('pricing');
      } else {
        setStep('auth');
      }
      if (defaultName) {
        setName(defaultName);
      }
      setError('');
      setSelectedPlan(null);
    }
  }, [isOpen, initialMode, defaultName, showPricing, isAuthenticated]);

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (mode === 'login') {
        await login(email, password);
        if (showPricing) {
          setStep('pricing');
        } else {
          onClose();
        }
      } else {
        await register(email, password, name);
        if (showPricing) {
          setStep('pricing');
        } else {
          onClose();
        }
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handlePurchase = async (priceType) => {
    setLoading(true);
    try {
      const response = await fetch(`${API_URL}/api/payments/create-checkout`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ priceType })
      });

      const data = await response.json();

      if (data.url) {
        window.location.href = data.url;
      } else {
        setError('Failed to create checkout session');
      }
    } catch (err) {
      setError('Payment failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // Auth step (signup/login)
  if (step === 'auth') {
    return (
      <div className="modal-overlay" onClick={handleClose}>
        <div className="modal-content auth-modal" onClick={e => e.stopPropagation()}>
          <button className="modal-close" onClick={handleClose}>×</button>
          
          <h2>{mode === 'login' ? 'Welcome Back' : (showPricing ? 'Get Your Full Strategy' : 'Create Account')}</h2>
          <p className="modal-subtitle">
            {mode === 'login' 
              ? 'Sign in to access your analyses'
              : (showPricing ? 'Create an account to unlock your personalized game plan' : 'Start improving your game today')}
          </p>

          {error && <div className="auth-error">{error}</div>}

          <form onSubmit={handleSubmit}>
            {mode === 'register' && (
              <div className="form-group">
                <label>Name</label>
                <input
                  type="text"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="Your name"
                  required
                />
              </div>
            )}

            <div className="form-group">
              <label>Email</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="you@email.com"
                required
              />
            </div>

            <div className="form-group">
              <label>Password</label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                minLength={6}
              />
            </div>

            <button type="submit" className="auth-submit" disabled={loading}>
              {loading ? 'Loading...' : mode === 'login' ? 'Sign In' : (showPricing ? 'Continue to Payment' : 'Create Account')}
            </button>
          </form>

          <div className="auth-switch">
            {mode === 'login' ? (
              <>
                Don't have an account?{' '}
                <button onClick={() => setMode('register')}>Sign up</button>
              </>
            ) : (
              <>
                Already have an account?{' '}
                <button onClick={() => setMode('login')}>Sign in</button>
              </>
            )}
          </div>

          <style>{authStyles}</style>
        </div>
      </div>
    );
  }

  // Pricing step
  return (
    <div className="modal-overlay" onClick={handleClose}>
      <div className="modal-content pricing-modal" onClick={e => e.stopPropagation()}>
        <button className="modal-close" onClick={handleClose}>×</button>
        
        <h2>🎯 Unlock Your Strategy</h2>
        <p className="modal-subtitle">
          Choose how you'd like to access your personalized game plan
        </p>

        {error && <div className="auth-error">{error}</div>}

        <div className="pricing-options">
          {/* One-time purchase */}
          <div 
            className={`pricing-card ${selectedPlan === 'credits' ? 'selected' : ''}`}
            onClick={() => setSelectedPlan('credits')}
          >
            <div className="pricing-header">
              <span className="pricing-name">Single Strategy</span>
              <span className="pricing-price">$4.99</span>
            </div>
            <p className="pricing-desc">One full analysis with PDF exports</p>
            <ul className="pricing-features">
              <li>✓ Complete course strategy</li>
              <li>✓ Personalized practice plan</li>
              <li>✓ 30-day improvement roadmap</li>
              <li>✓ Downloadable PDFs</li>
            </ul>
          </div>

          {/* Monthly subscription */}
          <div 
            className={`pricing-card popular ${selectedPlan === 'monthly' ? 'selected' : ''}`}
            onClick={() => setSelectedPlan('monthly')}
          >
            <div className="popular-badge">Most Popular</div>
            <div className="pricing-header">
              <span className="pricing-name">Pro Monthly</span>
              <span className="pricing-price">$9.99<span>/mo</span></span>
            </div>
            <p className="pricing-desc">Unlimited analyses for serious golfers</p>
            <ul className="pricing-features">
              <li>✓ Unlimited analyses</li>
              <li>✓ All courses & scorecards</li>
              <li>✓ Progress tracking</li>
              <li>✓ Priority support</li>
            </ul>
          </div>

          {/* Yearly subscription */}
          <div 
            className={`pricing-card ${selectedPlan === 'yearly' ? 'selected' : ''}`}
            onClick={() => setSelectedPlan('yearly')}
          >
            <div className="savings-badge">Save 58%</div>
            <div className="pricing-header">
              <span className="pricing-name">Pro Yearly</span>
              <span className="pricing-price">$49.99<span>/yr</span></span>
            </div>
            <p className="pricing-desc">Best value for committed improvers</p>
            <ul className="pricing-features">
              <li>✓ Everything in Monthly</li>
              <li>✓ Just $4.17/month</li>
              <li>✓ Lock in lowest price</li>
            </ul>
          </div>
        </div>

        <button 
          className="purchase-btn" 
          disabled={!selectedPlan || loading}
          onClick={() => handlePurchase(selectedPlan)}
        >
          {loading ? 'Processing...' : selectedPlan ? `Get ${selectedPlan === 'credits' ? 'Single Strategy' : 'Pro Access'}` : 'Select a Plan'}
        </button>

        <p className="secure-note">🔒 Secure payment powered by Stripe</p>

        {/* Trial Code Section */}
        <div className="trial-section">
          <p className="trial-label">Have a trial code?</p>
          {trialSuccess ? (
            <div className="trial-success">✓ Trial activated! Refreshing...</div>
          ) : (
            <div className="trial-input-row">
              <input
                type="text"
                value={trialCode}
                onChange={e => setTrialCode(e.target.value)}
                placeholder="Enter code"
                className="trial-input"
              />
              <button 
                className="trial-btn"
                onClick={handleTrialCode}
                disabled={loading || !trialCode.trim()}
              >
                Apply
              </button>
            </div>
          )}
        </div>

        <style>{authStyles}</style>
        <style>{pricingStyles}</style>
      </div>
    </div>
  );
}

const authStyles = `
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

  .auth-modal {
    max-width: 400px;
  }

  .pricing-modal {
    max-width: 800px;
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
    font-family: 'Playfair Display', 'Fraunces', Georgia, serif;
    font-size: 28px;
    margin-bottom: 8px;
    color: #fff;
  }

  .modal-subtitle {
    color: rgba(240, 244, 232, 0.6);
    margin-bottom: 24px;
  }

  .auth-error {
    background: rgba(196, 69, 54, 0.2);
    border: 1px solid rgba(196, 69, 54, 0.5);
    color: #ff9b8a;
    padding: 12px 16px;
    border-radius: 8px;
    margin-bottom: 16px;
    font-size: 14px;
  }

  .modal-content .form-group {
    margin-bottom: 16px;
  }

  .modal-content label {
    display: block;
    font-size: 12px;
    text-transform: uppercase;
    letter-spacing: 1px;
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

  .auth-submit {
    width: 100%;
    padding: 16px;
    font-size: 16px;
    font-weight: 600;
    background: linear-gradient(135deg, #7cb97c, #5a9a5a);
    color: #0d1f0d;
    border: none;
    border-radius: 10px;
    cursor: pointer;
    margin-top: 8px;
    font-family: inherit;
  }

  .auth-submit:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .auth-switch {
    text-align: center;
    margin-top: 20px;
    color: rgba(240, 244, 232, 0.6);
    font-size: 14px;
  }

  .auth-switch button {
    background: none;
    border: none;
    color: #7cb97c;
    cursor: pointer;
    font-size: 14px;
    text-decoration: underline;
    font-family: inherit;
  }
`;

const pricingStyles = `
  .pricing-options {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 16px;
    margin-bottom: 24px;
  }

  @media (max-width: 700px) {
    .pricing-options {
      grid-template-columns: 1fr;
    }
  }

  .pricing-card {
    background: rgba(255, 255, 255, 0.03);
    border: 2px solid rgba(255, 255, 255, 0.1);
    border-radius: 16px;
    padding: 24px;
    cursor: pointer;
    transition: all 0.2s;
    position: relative;
  }

  .pricing-card:hover {
    border-color: rgba(124, 185, 124, 0.3);
    background: rgba(255, 255, 255, 0.05);
  }

  .pricing-card.selected {
    border-color: #7cb97c;
    background: rgba(124, 185, 124, 0.1);
  }

  .pricing-card.popular {
    border-color: rgba(124, 185, 124, 0.4);
  }

  .popular-badge, .savings-badge {
    position: absolute;
    top: -10px;
    left: 50%;
    transform: translateX(-50%);
    background: linear-gradient(135deg, #7cb97c, #5a9a5a);
    color: #0d1f0d;
    font-size: 11px;
    font-weight: 700;
    padding: 4px 12px;
    border-radius: 12px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .savings-badge {
    background: linear-gradient(135deg, #f0c674, #d4a84b);
  }

  .pricing-header {
    margin-bottom: 12px;
  }

  .pricing-name {
    display: block;
    font-weight: 600;
    font-size: 14px;
    color: rgba(240, 244, 232, 0.7);
    margin-bottom: 4px;
  }

  .pricing-price {
    font-family: 'Playfair Display', 'Fraunces', Georgia, serif;
    font-size: 32px;
    font-weight: 700;
    color: #fff;
  }

  .pricing-price span {
    font-size: 14px;
    font-weight: 400;
    color: rgba(240, 244, 232, 0.5);
  }

  .pricing-desc {
    font-size: 13px;
    color: rgba(240, 244, 232, 0.5);
    margin-bottom: 16px;
  }

  .pricing-features {
    list-style: none;
    padding: 0;
    margin: 0;
  }

  .pricing-features li {
    font-size: 13px;
    color: rgba(240, 244, 232, 0.8);
    padding: 4px 0;
  }

  .purchase-btn {
    width: 100%;
    padding: 16px;
    font-size: 17px;
    font-weight: 600;
    background: linear-gradient(135deg, #7cb97c, #5a9a5a);
    color: #0d1f0d;
    border: none;
    border-radius: 12px;
    cursor: pointer;
    font-family: inherit;
    margin-bottom: 12px;
  }

  .purchase-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .purchase-btn:not(:disabled):hover {
    transform: translateY(-1px);
    box-shadow: 0 4px 12px rgba(124, 185, 124, 0.3);
  }

  .secure-note {
    text-align: center;
    font-size: 13px;
    color: rgba(240, 244, 232, 0.4);
    margin-bottom: 20px;
  }

  .trial-section {
    border-top: 1px solid rgba(255, 255, 255, 0.1);
    padding-top: 16px;
    text-align: center;
  }

  .trial-label {
    font-size: 13px;
    color: rgba(240, 244, 232, 0.5);
    margin-bottom: 8px;
  }

  .trial-input-row {
    display: flex;
    gap: 8px;
    max-width: 280px;
    margin: 0 auto;
  }

  .trial-input {
    flex: 1;
    padding: 10px 14px;
    font-size: 14px;
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.15);
    border-radius: 8px;
    color: #fff;
    font-family: inherit;
    text-transform: uppercase;
  }

  .trial-input:focus {
    outline: none;
    border-color: #7cb97c;
  }

  .trial-btn {
    padding: 10px 16px;
    font-size: 13px;
    font-weight: 600;
    background: rgba(124, 185, 124, 0.2);
    color: #7cb97c;
    border: 1px solid rgba(124, 185, 124, 0.3);
    border-radius: 8px;
    cursor: pointer;
    font-family: inherit;
  }

  .trial-btn:hover:not(:disabled) {
    background: rgba(124, 185, 124, 0.3);
  }

  .trial-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .trial-success {
    color: #7cb97c;
    font-weight: 500;
  }
`;
