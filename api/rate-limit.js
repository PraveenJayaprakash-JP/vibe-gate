// Simple in-memory rate limiter for Vercel serverless functions
// Note: per-instance only, not跨-instance. Good enough for low-traffic.
const REQUESTS = new Map();

export default function rateLimit({ windowMs = 60000, max = 30 } = {}) {
  return (req, res) => {
    const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim()
      || req.headers['x-real-ip']
      || 'anonymous';
    const now = Date.now();
    const entry = REQUESTS.get(ip) || { count: 0, resetAt: now + windowMs };

    if (now > entry.resetAt) {
      entry.count = 0;
      entry.resetAt = now + windowMs;
    }

    entry.count++;
    REQUESTS.set(ip, entry);

    res.setHeader('X-RateLimit-Limit', max);
    res.setHeader('X-RateLimit-Remaining', Math.max(0, max - entry.count));
    res.setHeader('X-RateLimit-Reset', Math.ceil(entry.resetAt / 1000));

    if (entry.count > max) {
      res.status(429).json({ error: 'Too many requests. Please try again later.' });
      return false;
    }
    return true;
  };
}
