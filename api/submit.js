// POST /api/submit
// Body: { url, grade, score, summary, categories, recommendations, userId? }
// Headers: Authorization: Bearer <api_key>
import { createClient } from '@supabase/supabase-js';
import rateLimit from './rate-limit.js';

const limit = rateLimit({ windowMs: 60000, max: 10 });

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (!limit(req, res)) return;

  try {
    const { url, grade, score, summary, categories, recommendations, userId } = req.body;
    if (!url || !grade) return res.status(400).json({ error: 'url and grade required' });

    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

    // Save to Supabase if configured
    if (supabaseUrl && supabaseKey) {
      const supabase = createClient(supabaseUrl, supabaseKey);
      const { data, error } = await supabase
        .from('scan_results')
        .insert([{ url, grade, score, summary, categories, recommendations, user_id: userId || null }])
        .select('id')
        .single();

      if (error) throw error;

      res.json({
        success: true,
        scanId: data.id,
        shareUrl: `https://vibe-gate.dev/dashboard?id=${data.id}`,
        message: 'Scan saved to cloud.'
      });
    } else {
      // Fallback: respond without DB
      const scanId = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
      res.json({
        success: true,
        scanId,
        shareUrl: `https://vibe-gate.dev/dashboard?id=${scanId}`,
        message: 'Scan saved locally. Set up Supabase for cloud storage.'
      });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
