import express from 'express';
import Stripe from 'stripe';
import { findUserById, updateUser } from '../db/database.js';
import { authenticateToken } from './auth.js';

const router = express.Router();

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

const PRICES = {
  monthly: process.env.STRIPE_PRICE_MONTHLY,
  yearly: process.env.STRIPE_PRICE_YEARLY,
  credits: process.env.STRIPE_PRICE_CREDITS_5 // Single strategy ($4.99)
};

// Trial code for testing (remove later)
const TRIAL_CODE = process.env.TRIAL_CODE || 'GOLFBETA2026';

// Activate trial (for testing with friends)
router.post('/activate-trial', authenticateToken, async (req, res) => {
  try {
    const { code } = req.body;
    const user = findUserById(req.user.userId);

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (code !== TRIAL_CODE) {
      return res.status(400).json({ error: 'Invalid trial code' });
    }

    // Give user pro status for trial
    updateUser(user.id, {
      subscription_status: 'pro',
      credits: 99 // Lots of credits for testing
    });

    res.json({ 
      success: true, 
      message: 'Trial activated! You now have Pro access.' 
    });

  } catch (error) {
    console.error('Trial activation error:', error);
    res.status(500).json({ error: 'Failed to activate trial' });
  }
});

// Create checkout session for subscription
router.post('/create-checkout', authenticateToken, async (req, res) => {
  try {
    const { priceType } = req.body; // 'monthly', 'yearly', or 'credits'
    const user = findUserById(req.user.userId);

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const priceId = PRICES[priceType];
    if (!priceId) {
      return res.status(400).json({ error: 'Invalid price type' });
    }

    const isSubscription = priceType === 'monthly' || priceType === 'yearly';

    const sessionConfig = {
      customer_email: user.email,
      line_items: [{ price: priceId, quantity: 1 }],
      mode: isSubscription ? 'subscription' : 'payment',
      success_url: `${process.env.FRONTEND_URL}?payment=success`,
      cancel_url: `${process.env.FRONTEND_URL}`,
      metadata: {
        userId: user.id.toString(),
        priceType
      }
    };

    const session = await stripe.checkout.sessions.create(sessionConfig);

    res.json({ url: session.url });

  } catch (error) {
    console.error('Checkout error:', error);
    res.status(500).json({ error: 'Failed to create checkout session' });
  }
});

// Get customer portal link (for managing subscription)
router.post('/customer-portal', authenticateToken, async (req, res) => {
  try {
    const user = findUserById(req.user.userId);
    
    if (!user || !user.subscription_id) {
      return res.status(400).json({ error: 'No active subscription' });
    }

    // Get customer ID from subscription
    const subscription = await stripe.subscriptions.retrieve(user.subscription_id);
    
    const portalSession = await stripe.billingPortal.sessions.create({
      customer: subscription.customer,
      return_url: `${process.env.FRONTEND_URL}/settings`
    });

    res.json({ url: portalSession.url });

  } catch (error) {
    console.error('Portal error:', error);
    res.status(500).json({ error: 'Failed to create portal session' });
  }
});

// Stripe webhook handler
router.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;

  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        const userId = parseInt(session.metadata.userId);
        const priceType = session.metadata.priceType;

        if (priceType === 'credits') {
          // Add 1 credit for single strategy purchase
          const user = findUserById(userId);
          updateUser(userId, { credits: user.credits + 1 });
        } else {
          // Subscription
          updateUser(userId, {
            subscription_status: 'pro',
            subscription_id: session.subscription
          });
        }
        break;
      }

      case 'customer.subscription.updated': {
        const subscription = event.data.object;
        // Find user by subscription ID and update status
        // This handles upgrades/downgrades
        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object;
        // Find user and downgrade to free
        // Would need to query by subscription_id
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object;
        // Handle failed payment - maybe send email
        break;
      }
    }

    res.json({ received: true });

  } catch (error) {
    console.error('Webhook processing error:', error);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

// Check subscription status
router.get('/status', authenticateToken, (req, res) => {
  try {
    const user = findUserById(req.user.userId);
    
    res.json({
      subscriptionStatus: user.subscription_status,
      credits: user.credits,
      canAnalyze: user.subscription_status === 'pro' || user.credits > 0
    });

  } catch (error) {
    console.error('Status check error:', error);
    res.status(500).json({ error: 'Failed to check status' });
  }
});

export default router;
