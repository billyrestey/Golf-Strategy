import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

export default function PricingModal({ isOpen, onClose, onSuccess }) {
  const { token, user, refreshUser } = useAuth();
  const [loading, setLoading] = useState(null);
  const [trialCode, setTrialCode] = useState('');
  const [trialLoading, setTrialLoading] = useState(false);
  const [trialError, setTrialError] = useState('');
  const [trialSuccess, setTrialSuccess] = useState(false);

  if (!isOpen) return null;

  const handleCheckout = async (priceType) => {
    setLoading(priceType);
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
        throw new Error('Failed to create checkout');
      }
    } catch (error) {
      console.error('Checkout error:', error);
      alert('Failed to start checkout. Please try again.');
    } finally {
      setLoading(null);
    }
  };

  const handleTrialCode = async () => {
    if (!trialCode.trim()) return;
    
    setTrialLoading(true);
    setTrialError('');
    
    try {
      const response = await fetch(`${API_URL}/api/payments/activate-trial`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ code: trialCode.trim() })
      });

      const data = await response.json();
      
      if (data.success) {
        setTrialSuccess(true);
        if (refreshUser) await refreshUser();
        setTimeout(() => {
          onClose();
          // Trigger success callback to unlock analysis
          if (onSuccess) onSuccess();
        }, 1000);
      } else {
        setTrialError(data.error || 'Invalid code');
      }
    } catch (error) {
      setTrialError('Failed to activate code');
    } finally {
      setTrialLoading(false);
    }
  };

  const plans = [
    {
      id: 'single',
      name: 'Single Strategy',
      price: '$5',
      period: 'one-time',
      features: [
        '1 full game analysis',
        'PDF strategy card',
        'Practice plan',
        'Never expires'
      ],
      highlight: false
    },
    {
      id: 'monthly',
      name: 'Pro Monthly',
      price: '$10',
      period: '/month',
      features: [
        'Unlimited analyses',
        'PDF exports',
        'Progress tracking',
        'Round logging',
        'Cancel anytime'
      ],
      highlight: true,
      badge: 'Most Popular'
    },
    {
      id: 'yearly',
      name: 'Pro Yearly',
      price: '$50',
      period: '/year',
      features: [
        'Everything in Pro',
        'Save $70/year',
        'Best value',
        'Lock in price'
      ],
      highlight: false,
      badge: 'Best Value'
    }
  ];

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="pricing-modal" onClick={e => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose}>×</button>

        <div className="pricing-header">
          <h2>Upgrade Your Game</h2>
          <p>Choose the plan that works for you</p>
        </div>

        <div className="plans-grid">
          {plans.map(plan => (
            <div 
              key={plan.id} 
              className={`plan-card ${plan.highlight ? 'highlighted' : ''}`}
            >
              {plan.badge && <div className="plan-badge">{plan.badge}</div>}
              
              <h3>{plan.name}</h3>
              <div className="plan-price">
                <span className="price">{plan.price}</span>
                <span className="period">{plan.period}</span>
              </div>
              
              <ul className="plan-features">
                {plan.features.map((feature, i) => (
                  <li key={i}>✓ {feature}</li>
                ))}
              </ul>
              
              <button
                className={`plan-button ${plan.highlight ? 'primary' : ''}`}
                onClick={() => handleCheckout(plan.id)}
                disabled={loading !== null}
              >
                {loading === plan.id ? 'Loading...' : 'Select'}
              </button>
            </div>
          ))}
        </div>

        {/* Trial Code Section */}
        <div className="trial-section">
          <p className="trial-label">Have a discount code?</p>
          {trialSuccess ? (
            <div className="trial-success">✓ Code activated! Refreshing...</div>
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
                disabled={trialLoading || !trialCode.trim()}
              >
                {trialLoading ? '...' : 'Apply'}
              </button>
            </div>
          )}
          {trialError && <p className="trial-error">{trialError}</p>}
        </div>

        <style>{`
          .modal-overlay {
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0, 0, 0, 0.85);
            display: flex;
            align-items: flex-start;
            justify-content: center;
            z-index: 1000;
            padding: 20px;
            overflow-y: auto;
          }

          .pricing-modal {
            background: linear-gradient(145deg, #1a3a1a, #0d1f0d);
            border: 1px solid rgba(255, 255, 255, 0.1);
            border-radius: 20px;
            padding: 40px;
            width: 100%;
            max-width: 800px;
            position: relative;
            margin: auto;
          }

          .modal-close {
            position: absolute;
            top: 16px;
            right: 16px;
            background: rgba(255, 255, 255, 0.1);
            border: none;
            color: rgba(255, 255, 255, 0.6);
            font-size: 20px;
            width: 32px;
            height: 32px;
            border-radius: 50%;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
          }

          .modal-close:hover {
            background: rgba(255, 255, 255, 0.2);
            color: #fff;
          }

          .pricing-header {
            text-align: center;
            margin-bottom: 32px;
          }

          .pricing-header h2 {
            font-family: 'Fraunces', Georgia, serif;
            font-size: 28px;
            margin-bottom: 8px;
          }

          .pricing-header p {
            color: rgba(240, 244, 232, 0.6);
          }

          .plans-grid {
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            gap: 20px;
          }

          .plan-card {
            background: rgba(255, 255, 255, 0.03);
            border: 2px solid rgba(255, 255, 255, 0.1);
            border-radius: 16px;
            padding: 24px;
            position: relative;
          }

          .plan-card.highlighted {
            border-color: #7cb97c;
            background: rgba(124, 185, 124, 0.05);
          }

          .plan-badge {
            position: absolute;
            top: -10px;
            left: 50%;
            transform: translateX(-50%);
            background: linear-gradient(135deg, #7cb97c, #5a9a5a);
            color: #0d1f0d;
            font-size: 10px;
            font-weight: 700;
            padding: 4px 12px;
            border-radius: 20px;
            white-space: nowrap;
          }

          .plan-card h3 {
            font-size: 16px;
            margin-bottom: 12px;
            margin-top: 8px;
          }

          .plan-price {
            margin-bottom: 20px;
          }

          .plan-price .price {
            font-family: 'Fraunces', Georgia, serif;
            font-size: 36px;
            font-weight: 700;
          }

          .plan-price .period {
            color: rgba(240, 244, 232, 0.5);
            font-size: 14px;
          }

          .plan-features {
            list-style: none;
            margin-bottom: 24px;
            padding: 0;
          }

          .plan-features li {
            padding: 6px 0;
            font-size: 13px;
            color: rgba(240, 244, 232, 0.8);
          }

          .plan-button {
            width: 100%;
            padding: 14px;
            font-size: 15px;
            font-weight: 600;
            border: 2px solid rgba(255, 255, 255, 0.2);
            border-radius: 10px;
            cursor: pointer;
            background: transparent;
            color: #fff;
            font-family: inherit;
            transition: all 0.2s;
          }

          .plan-button:hover {
            border-color: #7cb97c;
            background: rgba(124, 185, 124, 0.1);
          }

          .plan-button.primary {
            background: linear-gradient(135deg, #7cb97c, #5a9a5a);
            color: #0d1f0d;
            border: none;
          }

          .plan-button:disabled {
            opacity: 0.5;
            cursor: not-allowed;
          }

          @media (max-width: 700px) {
            .modal-overlay {
              padding: 12px;
            }
            
            .pricing-modal {
              padding: 24px 16px;
              margin-top: 20px;
              margin-bottom: 20px;
            }
            
            .pricing-header h2 {
              font-size: 24px;
            }
            
            .plans-grid {
              grid-template-columns: 1fr;
              gap: 16px;
            }
            
            .plan-card {
              padding: 20px;
            }
            
            .plan-card.highlighted {
              order: -1;
            }
            
            .plan-price .price {
              font-size: 32px;
            }
          }

          .trial-section {
            margin-top: 24px;
            padding-top: 24px;
            border-top: 1px solid rgba(255, 255, 255, 0.1);
            text-align: center;
          }

          .trial-label {
            font-size: 13px;
            color: rgba(240, 244, 232, 0.5);
            margin-bottom: 12px;
          }

          .trial-input-row {
            display: flex;
            gap: 8px;
            justify-content: center;
            max-width: 280px;
            margin: 0 auto;
          }

          .trial-input {
            flex: 1;
            padding: 10px 14px;
            font-size: 14px;
            background: rgba(255, 255, 255, 0.08);
            border: 1px solid rgba(255, 255, 255, 0.15);
            border-radius: 8px;
            color: #fff;
            font-family: inherit;
          }

          .trial-input:focus {
            outline: none;
            border-color: #7cb97c;
          }

          .trial-btn {
            padding: 10px 16px;
            font-size: 14px;
            font-weight: 600;
            background: rgba(255, 255, 255, 0.1);
            border: 1px solid rgba(255, 255, 255, 0.2);
            border-radius: 8px;
            color: #fff;
            cursor: pointer;
            font-family: inherit;
          }

          .trial-btn:hover:not(:disabled) {
            background: rgba(255, 255, 255, 0.15);
          }

          .trial-btn:disabled {
            opacity: 0.5;
            cursor: not-allowed;
          }

          .trial-success {
            color: #7cb97c;
            font-size: 14px;
          }

          .trial-error {
            color: #ff6b6b;
            font-size: 13px;
            margin-top: 8px;
          }
        `}</style>
      </div>
    </div>
  );
}
