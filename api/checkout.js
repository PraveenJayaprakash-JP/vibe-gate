// POST /api/checkout — create subscription
// GET /api/checkout?planId=xxx — auto-redirect to payment
import rateLimit from './rate-limit.js';
const limit = rateLimit({ windowMs: 60000, max: 10 });

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (!limit(req, res)) return;

  // GET — render auto-redirect page
  if (req.method === 'GET') {
    const planId = req.query?.planId;
    if (!planId) {
      return res.redirect(302, '/#pricing');
    }
    res.setHeader('Content-Type', 'text/html');
    return res.status(200).send(`<!DOCTYPE html><html><head><title>Redirecting...</title></head><body>
<script>
fetch('/api/checkout', {
  method:'POST',
  headers:{'Content-Type':'application/json'},
  body:JSON.stringify({planId:'${planId}'})
}).then(r=>r.json()).then(d=>{ if(d.url) window.location.href=d.url; else document.body.innerHTML='Error: '+d.error; })
.catch(e=>document.body.innerHTML='Error: '+e.message);
</script></body></html>`);
  }

  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { planId } = req.body || {};
  if (!planId) return res.status(400).json({ error: 'planId required' });

  try {
    // Razorpay mode
    if (process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET) {
      const { default: Razorpay } = await import('razorpay');
      const razorpay = new Razorpay({
        key_id: process.env.RAZORPAY_KEY_ID,
        key_secret: process.env.RAZORPAY_KEY_SECRET,
      });

      const subscription = await razorpay.subscriptions.create({
        plan_id: planId,
        total_count: 12,
        customer_notify: 1,
      });

      return res.json({
        gateway: 'razorpay',
        subscriptionId: subscription.id,
        url: subscription.short_url,
      });
    }

    // Stripe mode (fallback)
    if (process.env.STRIPE_SECRET_KEY) {
      const { default: Stripe } = await import('stripe');
      const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

      const session = await stripe.checkout.sessions.create({
        mode: 'subscription',
        line_items: [{ price: planId, quantity: 1 }],
        success_url: 'https://vibe-gate.dev/dashboard',
        cancel_url: 'https://vibe-gate.dev/#pricing',
      });

      return res.json({ gateway: 'stripe', url: session.url });
    }

    return res.status(503).json({ error: 'No payment gateway configured.' });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
