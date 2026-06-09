// POST /api/webhook
// Supports: Stripe (stripe-signature header) or Razorpay (x-razorpay-signature header)
export const config = { api: { bodyParser: false } };

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).send('Method not allowed');

  try {
    const buf = await new Promise((resolve) => {
      const chunks = [];
      req.on('data', (c) => chunks.push(c));
      req.on('end', () => resolve(Buffer.concat(chunks)));
    });

    const rawBody = buf.toString();

    // Razorpay webhook
    if (req.headers['x-razorpay-signature']) {
      // Validate signature (simplified — in production use crypto)
      const event = JSON.parse(rawBody);
      const eventType = event.event;

      switch (eventType) {
        case 'subscription.charged':
        case 'subscription.activated':
          // Grant plan access based on event.payload.subscription.plan_id
          break;
        case 'subscription.cancelled':
        case 'subscription.completed':
          // Revoke plan access
          break;
      }

      return res.json({ received: true, gateway: 'razorpay' });
    }

    // Stripe webhook
    if (req.headers['stripe-signature']) {
      if (!process.env.STRIPE_SECRET_KEY) {
        return res.status(503).send('Stripe not configured');
      }
      const { default: Stripe } = await import('stripe');
      const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
      const event = stripe.webhooks.constructEvent(buf, req.headers['stripe-signature'], process.env.STRIPE_WEBHOOK_SECRET);

      switch (event.type) {
        case 'checkout.session.completed':
        case 'customer.subscription.updated':
        case 'customer.subscription.deleted':
          break;
      }

      return res.json({ received: true, gateway: 'stripe' });
    }

    return res.status(400).send('Missing webhook signature');
  } catch (err) {
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }
}
