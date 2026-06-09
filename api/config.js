// GET /api/config
// Returns public frontend config (Supabase URL + anon key)
import rateLimit from './rate-limit.js';
const limit = rateLimit({ windowMs: 60000, max: 60 });

export default function handler(req, res) {
  if (!limit(req, res)) return;
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.json({
    supabaseUrl: process.env.SUPABASE_URL || '',
    supabaseAnonKey: process.env.SUPABASE_ANON_KEY || '',
  });
}
