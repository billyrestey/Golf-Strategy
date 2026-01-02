# Golf Strategy

AI-powered golf strategy tool with user accounts, payments, and PDF exports.

## Features

- **AI Scorecard Analysis**: Upload screenshots, get personalized strategy
- **User Accounts**: Save analyses, track progress over time
- **PDF Exports**: Download strategy cards and practice plans
- **Payments**: Stripe integration for subscriptions and credit packs
- **Progress Tracking**: Log rounds and monitor improvement

## Tech Stack

- **Frontend**: React + Vite
- **Backend**: Node.js + Express
- **Database**: SQLite (better-sqlite3)
- **AI**: Anthropic Claude API (vision + text)
- **Payments**: Stripe
- **Auth**: JWT tokens + bcrypt

## Quick Start

### Prerequisites
- Node.js 18+
- Anthropic API key
- Stripe account (for payments)

### Installation

```bash
# Clone and enter directory
cd fairway-strategy-v2

# Server setup
cd server
npm install
cp .env.example .env
# Edit .env with your keys

# Client setup
cd ../client
npm install
```

### Configuration

Edit `server/.env`:

```env
# Required
ANTHROPIC_API_KEY=sk-ant-xxxxx
JWT_SECRET=your-secret-key

# Stripe (for payments)
STRIPE_SECRET_KEY=sk_test_xxxxx
STRIPE_WEBHOOK_SECRET=whsec_xxxxx
STRIPE_PRICE_MONTHLY=price_xxxxx
STRIPE_PRICE_YEARLY=price_xxxxx
STRIPE_PRICE_CREDITS_5=price_xxxxx

# URLs
PORT=3001
FRONTEND_URL=http://localhost:5173
```

### Run Development

```bash
# Terminal 1 - Server
cd server
npm run dev

# Terminal 2 - Client
cd client
npm run dev
```

Open http://localhost:5173

## Project Structure

```
fairway-strategy-v2/
├── client/
│   ├── src/
│   │   ├── components/
│   │   │   ├── AuthModal.jsx      # Login/register
│   │   │   └── PricingModal.jsx   # Upgrade plans
│   │   ├── context/
│   │   │   └── AuthContext.jsx    # Auth state
│   │   ├── App.jsx                # Main app
│   │   └── main.jsx
│   └── package.json
│
├── server/
│   ├── db/
│   │   └── database.js            # SQLite models
│   ├── routes/
│   │   ├── auth.js                # Login/register
│   │   └── payments.js            # Stripe
│   ├── services/
│   │   ├── claude.js              # AI analysis
│   │   └── pdf.js                 # PDF generation
│   ├── index.js                   # Express app
│   └── package.json
│
└── README.md
```

## API Endpoints

### Auth
- `POST /api/auth/register` - Create account
- `POST /api/auth/login` - Sign in
- `GET /api/auth/me` - Get current user
- `PUT /api/auth/profile` - Update profile

### Analysis
- `POST /api/analyze` - Run AI analysis (requires auth)
- `GET /api/analyses` - Get user's analyses
- `GET /api/analyses/:id` - Get specific analysis
- `GET /api/analyses/:id/pdf?type=strategy|practice` - Download PDF

### Payments
- `POST /api/payments/create-checkout` - Start Stripe checkout
- `POST /api/payments/customer-portal` - Manage subscription
- `GET /api/payments/status` - Check credits/subscription
- `POST /api/payments/webhook` - Stripe webhooks

### Progress
- `POST /api/rounds` - Log a round
- `GET /api/rounds` - Get round history
- `GET /api/stats` - Get aggregate stats

## Stripe Setup

1. Create Stripe account at stripe.com
2. Create 3 products in Dashboard:
   - **Pro Monthly**: $9.99/month subscription
   - **Pro Yearly**: $49.99/year subscription
   - **5 Credits**: $4.99 one-time payment
3. Copy price IDs to `.env`
4. Set up webhook:
   - URL: `https://yourdomain.com/api/payments/webhook`
   - Events: `checkout.session.completed`, `customer.subscription.*`, `invoice.payment_failed`
5. Copy webhook secret to `.env`

## Deployment

### Frontend (Vercel)
```bash
cd client
vercel
```

### Backend (Railway)
```bash
cd server
railway up
```

Remember to:
- Set all environment variables
- Update FRONTEND_URL to production domain
- Set up Stripe webhook for production URL

## iOS App

This backend works with any frontend. For iOS:

1. **React Native**: Reuse ~70% of React code
2. **Capacitor**: Wrap web app in native shell
3. **Native Swift**: Call same API endpoints

The API is client-agnostic - just make HTTP requests with JWT auth.

## Business Model

### Pricing Strategy
- **Free**: 1 analysis (lead gen)
- **Credits**: $4.99 for 5 analyses (casual users)
- **Pro**: $9.99/mo or $49.99/yr (serious golfers)

### Unit Economics
- Cost per analysis: ~$0.05 (Claude API)
- Pro subscriber using 10x/month: $9.95 profit
- Credit pack: $4.74 profit (95% margin)

### Growth Ideas
- Partner with golf courses/pros
- Integrate with Arccos/Garmin for auto-import
- Add social features (share strategies)
- Course-specific strategy cards

## License

MIT
