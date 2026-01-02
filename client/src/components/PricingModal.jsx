import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

export default function PricingModal({ isOpen, onClose }) {
  const { token, user } = useAuth();
  const [loading, setLoading] = useState(null);

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

  const plans = [
    {
      id: 'credits_5',
      name: '5 Credits',
      price: '$4.99',
      period: 'one-time',
      features: [
        '5 game analyses',
        'PDF strategy cards',
        'Practice plans',
        'Never expires'
      ],
      highlight: false
    },
    {
      id: 'monthly',
      name: 'Pro Monthly',
      price: '$9.99',
      period: '/month',
      features: [
        'Unlimited analyses',
        'PDF exports',
        'Progress tracking',
        'Round logging',
        'Priority support'
      ],
      highlight: true
    },
    {
      id: 'yearly',
      name: 'Pro Yearly',
      price: '$49.99',
      period: '/year',
      features: [
        'Everything in Pro',
        'Save $70/year',
        '2 months free',
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
          {user && (
            <div className="current-credits">
              Current credits: <strong>{user.credits}</strong>
            </div>
          )}
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

        <style>{`
          .pricing-modal {
            background: linear-gradient(145deg, #1a3a1a, #0d1f0d);
            border: 1px solid rgba(255, 255, 255, 0.1);
            border-radius: 20px;
            padding: 40px;
            width: 100%;
            max-width: 800px;
            position: relative;
            max-height: 90vh;
            overflow-y: auto;
          }

          .pricing-header {
            text-align: center;
            margin-bottom: 32px;
          }

          .pricing-header h2 {
            font-family: 'Fraunces', Georgia, serif;
            font-size: 32px;
            margin-bottom: 8px;
          }

          .pricing-header p {
            color: rgba(240, 244, 232, 0.6);
          }

          .current-credits {
            margin-top: 12px;
            padding: 8px 16px;
            background: rgba(124, 185, 124, 0.1);
            border-radius: 20px;
            display: inline-block;
            font-size: 14px;
          }

          .current-credits strong {
            color: #7cb97c;
          }

          .plans-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
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
            right: 16px;
            background: linear-gradient(135deg, #7cb97c, #5a9a5a);
            color: #0d1f0d;
            font-size: 11px;
            font-weight: 600;
            padding: 4px 12px;
            border-radius: 20px;
          }

          .plan-card h3 {
            font-size: 18px;
            margin-bottom: 12px;
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
          }

          .plan-features li {
            padding: 8px 0;
            font-size: 14px;
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

          @media (max-width: 640px) {
            .pricing-modal {
              padding: 24px;
            }
            
            .plans-grid {
              grid-template-columns: 1fr;
            }
          }
        `}</style>
      </div>
    </div>
  );
}
