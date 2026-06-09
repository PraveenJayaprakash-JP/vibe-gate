// POST /api/submit
// Body: { url, grade, score, summary, categories, recommendations }
// Headers: Authorization: Bearer <api_key>
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  res.setHeader('Access-Control-Allow-Origin', '*');

  try {
    const { url, grade, score, summary, categories, recommendations } = req.body;

    // Validate
    if (!url || !grade) return res.status(400).json({ error: 'url and grade required' });

    // Store to DB (future: MongoDB or Supabase via env var)
    // For now, respond with success + a shareable link
    const scanId = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

    res.json({
      success: true,
      scanId,
      shareUrl: `https://vibe-gate.vercel.app/dashboard?id=${scanId}`,
      message: 'Scan saved. View online at vibe-gate.vercel.app'
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
