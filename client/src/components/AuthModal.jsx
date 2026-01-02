import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';

export default function AuthModal({ isOpen, onClose, initialMode = 'login', defaultName = '' }) {
  const [mode, setMode] = useState(initialMode);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState(defaultName);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const { login, register } = useAuth();

  // Update name when defaultName changes
  useEffect(() => {
    if (defaultName && !name) {
      setName(defaultName);
    }
  }, [defaultName]);

  // Reset mode when modal opens
  useEffect(() => {
    if (isOpen) {
      setMode(initialMode);
      if (defaultName) {
        setName(defaultName);
      }
    }
  }, [isOpen, initialMode, defaultName]);

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (mode === 'login') {
        await login(email, password);
      } else {
        await register(email, password, name);
      }
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose}>×</button>
        
        <h2>{mode === 'login' ? 'Welcome Back' : 'Create Account'}</h2>
        <p className="modal-subtitle">
          {mode === 'login' 
            ? 'Sign in to access your analyses'
            : 'Start with 1 free analysis'}
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
            {loading ? 'Loading...' : mode === 'login' ? 'Sign In' : 'Create Account'}
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

        <style>{`
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
            padding: 40px;
            width: 100%;
            max-width: 400px;
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
        `}</style>
      </div>
    </div>
  );
}
