// POST /api/alert — Send scan results to Slack or Discord webhook
import rateLimit from './rate-limit.js';
const limit = rateLimit({ windowMs: 60000, max: 10 });

function gradeColor(grade) {
  if (grade === 'A') return 0x00c853;       // green
  if (grade === 'B' || grade === 'C') return 0xffab00; // yellow/amber
  return 0xff1744;                           // red (D, F, or unknown)
}

function progressBar(score) {
  const filled = Math.round(score / 10);
  const empty = 10 - filled;
  return '█'.repeat(filled) + '░'.repeat(empty) + ` ${score}/100`;
}

function categoryLines(categories) {
  if (!categories || typeof categories !== 'object') return '';
  return Object.entries(categories)
    .map(([name, result]) => {
      const icon = result.pass ? '✅' : '⚠️';
      return `${icon} ${name}`;
    })
    .join('\n');
}

function detectProvider(webhookUrl) {
  if (/hooks\.slack\.com\//i.test(webhookUrl)) return 'slack';
  if (/discord(?:app)?\.com\/api\/webhooks\//i.test(webhookUrl)) return 'discord';
  return null;
}

function buildDiscordPayload({ url, grade, score, summary, categories }) {
  return {
    embeds: [{
      title: `Vibe Gate Scan — Grade: ${grade}`,
      url: 'https://vibe-gate.dev/dashboard',
      color: gradeColor(grade),
      fields: [
        { name: 'URL Scanned', value: url, inline: false },
        { name: 'Score', value: progressBar(score), inline: false },
        ...(summary ? [{ name: 'Summary', value: summary.slice(0, 1024), inline: false }] : []),
        ...(categories && Object.keys(categories).length
          ? [{ name: 'Categories', value: categoryLines(categories).slice(0, 1024), inline: false }]
          : []),
      ],
      footer: { text: 'vibe-gate.dev' },
    }],
  };
}

function buildSlackPayload({ url, grade, score, summary, categories }) {
  const color = grade === 'A' ? '#00c853' : (grade === 'B' || grade === 'C') ? '#ffab00' : '#ff1744';
  const fields = [
    { title: 'URL Scanned', value: url, short: false },
    { title: 'Score', value: progressBar(score), short: false },
  ];
  if (summary) fields.push({ title: 'Summary', value: summary.slice(0, 1024), short: false });
  if (categories && Object.keys(categories).length) {
    fields.push({ title: 'Categories', value: categoryLines(categories).slice(0, 1024), short: false });
  }

  return {
    attachments: [{
      fallback: `Vibe Gate Scan — Grade: ${grade} | ${url} | Score: ${score}/100`,
      color,
      title: `Vibe Gate Scan — Grade: ${grade}`,
      title_link: 'https://vibe-gate.dev/dashboard',
      fields,
      footer: 'vibe-gate.dev',
    }],
  };
}

export default async function handler(req, res) {
  if (!limit(req, res)) return;
  res.setHeader('Access-Control-Allow-Origin', '*');

  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return res.status(204).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { webhookUrl, url, grade, score, summary, categories } = req.body || {};

  if (!webhookUrl) return res.status(400).json({ error: 'webhookUrl is required' });
  if (!url) return res.status(400).json({ error: 'url is required' });
  if (grade === undefined) return res.status(400).json({ error: 'grade is required' });
  if (typeof score !== 'number') return res.status(400).json({ error: 'score must be a number' });

  const provider = detectProvider(webhookUrl);
  if (!provider) {
    return res.status(400).json({ error: 'webhookUrl must be a valid Slack or Discord webhook URL' });
  }

  const payload = provider === 'discord'
    ? buildDiscordPayload({ url, grade, score, summary, categories })
    : buildSlackPayload({ url, grade, score, summary, categories });

  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      return res.status(502).json({ error: `Webhook delivery failed: ${response.status}`, details: text.slice(0, 512) });
    }

    return res.json({ success: true, sent: provider });
  } catch (err) {
    return res.status(502).json({ error: `Webhook request failed: ${err.message}` });
  }
}