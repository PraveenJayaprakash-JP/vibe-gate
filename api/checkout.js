// POST /api/checkout
// Body: { priceId: string, successUrl: string, cancelUrl: string }
import Stripe from 'stripe';
import rateLimit from './rate-limit.js';
const limit = rateLimit({ windowMs: 60000, max: 10 });

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (!limit(req, res)) return;

  try {
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [{ price: req.body.priceId, quantity: 1 }],
      success_url: req.body.successUrl,
      cancel_url: req.body.cancelUrl,
    });
    res.json({ url: session.url });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
