// Vercel serverless function — GET /api/plans
export default function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.json({
    plans: [
      {
        id: 'free',
        name: 'Free',
        price: 0,
        currency: 'usd',
        interval: 'month',
        features: ['CLI access (npx vibe-gate)', 'GitHub Action', 'Community support', 'Unlimited scans'],
        cta: 'Get Started',
        ctaLink: 'https://github.com/PraveenJayaprakash-JP/vibe-gate',
        popular: false
      },
      {
        id: 'pro',
        name: 'Pro',
        price: 900, // $9
        currency: 'usd',
        interval: 'month',
        stripePriceId: 'price_1TgTFTImrFBa2nkGfL3ydLgX',
        razorpayPlanId: null, // Set after creating plan in Razorpay dashboard
        features: ['Everything in Free', 'Hosted dashboard', 'Scheduled scans (daily)', 'Slack alerts', 'Scan history (90 days)', '10 projects', 'Email support'],
        cta: 'Buy Now',
        ctaLink: '/api/checkout?planId=price_1TgTFTImrFBa2nkGfL3ydLgX',
        popular: true
      },
      {
        id: 'growth',
        name: 'Growth',
        price: 2900, // $29
        currency: 'usd',
        interval: 'month',
        stripePriceId: 'price_1TgTFTImrFBa2nkGaKkZP27F',
        razorpayPlanId: null, // Set after creating plan in Razorpay dashboard
        features: ['Everything in Pro', '50 projects', '5 team seats', 'SSO / SAML', 'Scan history (1 year)', 'Priority support', 'Custom alerts'],
        cta: 'Buy Now',
        ctaLink: '/api/checkout?planId=price_1TgTFTImrFBa2nkGaKkZP27F',
        popular: false
      },
      {
        id: 'enterprise',
        name: 'Enterprise',
        price: null, // custom
        currency: 'usd',
        interval: 'month',
        features: ['Everything in Growth', 'Unlimited projects', 'Unlimited team seats', 'On-prem deployment', 'Custom rules engine', 'Compliance reports (SOC2)', 'SLA guarantee', 'Dedicated support'],
        cta: 'Contact Us',
        ctaLink: 'mailto:praveen@vibe-gate.dev',
        popular: false
      }
    ]
  });
}
