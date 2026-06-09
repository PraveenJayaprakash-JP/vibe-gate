// GET /api/scans?userId=<uuid>  — fetch scan history
// DELETE /api/scans?id=<uuid>&userId=<uuid>  — delete a scan
import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    return res.status(503).json({ scans: [], error: 'Supabase not configured' });
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    if (req.method === 'GET') {
      const { userId, limit } = req.query;
      if (!userId) return res.status(400).json({ error: 'userId required' });

      let query = supabase
        .from('scan_results')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      if (limit) query = query.limit(parseInt(limit));

      const { data, error } = await query;
      if (error) throw error;
      return res.json({ scans: data || [] });
    }

    if (req.method === 'DELETE') {
      const { id, userId } = req.query;
      if (!id || !userId) return res.status(400).json({ error: 'id and userId required' });

      const { error } = await supabase
        .from('scan_results')
        .delete()
        .eq('id', id)
        .eq('user_id', userId);

      if (error) throw error;
      return res.json({ success: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
