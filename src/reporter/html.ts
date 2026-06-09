import type { ScanResult, CategoryResult, CheckResult } from '../types.ts';

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function gradeColor(grade: string): string {
  switch (grade) {
    case 'A':
    case 'B':
      return '#4ade80';
    case 'C':
      return '#facc15';
    case 'D':
      return '#f87171';
    case 'F':
      return '#ef4444';
    default:
      return '#a1a1aa';
  }
}

function statusColor(status: string): string {
  switch (status) {
    case 'pass':
      return '#4ade80';
    case 'warn':
      return '#facc15';
    case 'fail':
      return '#f87171';
    case 'info':
      return '#60a5fa';
    default:
      return '#a1a1aa';
  }
}

function statusDot(status: string): string {
  const color = statusColor(status);
  return `<span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${color};margin-right:6px;flex-shrink:0;"></span>`;
}

function statusIcon(status: string): string {
  switch (status) {
    case 'pass':
      return '&#x2713; PASS';
    case 'warn':
      return '&#x26A0; WARN';
    case 'fail':
      return '&#x2717; FAIL';
    case 'info':
      return '&#x2139; INFO';
    default:
      return status;
  }
}

function renderCheckRow(check: CheckResult): string {
  const icon = statusIcon(check.status);
  const color = statusColor(check.status);
  let html = `
    <div class="check-row" style="padding:6px 0;border-bottom:1px solid #27272a;color:#a1a1aa;font-size:13px;">
      <span style="color:${color};font-weight:600;">${icon}</span>
      <span style="margin-left:8px;">${escapeHtml(check.message)}</span>`;

  if (check.details) {
    html += `
      <details style="margin-top:4px;">
        <summary style="cursor:pointer;color:#71717a;font-size:12px;">Details</summary>
        <pre style="background:#18181b;padding:8px;border-radius:4px;margin-top:4px;font-size:12px;color:#d4d4d8;overflow-x:auto;white-space:pre-wrap;">${escapeHtml(check.details)}</pre>
      </details>`;
  }

  html += `
    </div>`;
  return html;
}

function renderCategoryCard(cat: CategoryResult, index: number): string {
  const color = statusColor(cat.status);
  const dot = statusDot(cat.status);
  const checksHtml = cat.checks.map(renderCheckRow).join('');

  return `
    <details class="category-card" style="background:#18181b;border:1px solid #27272a;border-radius:8px;margin-bottom:12px;overflow:hidden;" ${index === 0 ? 'open' : ''}>
      <summary style="display:flex;align-items:center;padding:14px 16px;cursor:pointer;list-style:none;user-select:none;">
        <span style="display:flex;align-items:center;gap:8px;font-size:15px;font-weight:600;color:#e4e4e7;">
          ${dot} ${escapeHtml(cat.name)}
          <span style="font-size:12px;color:#71717a;font-weight:400;">${cat.score}% · weight ${cat.weight}%</span>
        </span>
        <span style="margin-left:auto;font-size:12px;color:#52525b;font-weight:600;">&#x25BC;</span>
      </summary>
      <div style="padding:0 16px 12px 20px;">
        ${checksHtml}
      </div>
    </details>`;
}

function renderScoreBar(score: number): string {
  const color = score >= 80 ? '#4ade80' : score >= 60 ? '#facc15' : '#f87171';
  return `
    <div style="width:100%;max-width:400px;margin:12px auto;">
      <div style="display:flex;justify-content:space-between;margin-bottom:4px;font-size:13px;color:#a1a1aa;">
        <span>Score</span>
        <span style="color:${color};font-weight:600;">${score}%</span>
      </div>
      <div style="background:#27272a;border-radius:99px;height:10px;overflow:hidden;">
        <div style="background:${color};height:100%;width:${score}%;border-radius:99px;transition:width 0.6s ease;"></div>
      </div>
    </div>`;
}

export function generateHtmlReport(result: ScanResult, url: string): string {
  const timestamp = new Date().toISOString();
  const gradeFn = gradeColor(result.grade);
  const categoryCards = result.categories.map(renderCategoryCard).join('');
  const recommendationsHtml = result.recommendations.length > 0
    ? `
    <div class="section">
      <h3 style="color:#e4e4e7;font-size:16px;border-bottom:1px solid #27272a;padding-bottom:8px;">Recommendations</h3>
      <ul style="padding-left:20px;color:#d4d4d8;line-height:1.8;">
        ${result.recommendations.map(r => `<li>${escapeHtml(r)}</li>`).join('')}
      </ul>
    </div>`
    : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Vibe Gate Report — ${escapeHtml(url)}</title>
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
    background: #09090b;
    color: #d4d4d8;
    line-height: 1.6;
    padding: 0;
    min-height: 100vh;
  }
  .container { max-width: 720px; margin: 0 auto; padding: 24px 16px 48px; }
  .header {
    text-align: center;
    padding: 32px 0 24px;
    border-bottom: 1px solid #27272a;
    margin-bottom: 24px;
  }
  .header h1 { font-size: 28px; font-weight: 700; color: #fff; letter-spacing: -0.02em; }
  .header .url {
    font-size: 14px; color: #71717a; margin-top: 4px;
    word-break: break-all;
  }
  .header .timestamp { font-size: 11px; color: #52525b; margin-top: 8px; }
  .grade-section { text-align: center; padding: 20px 0 8px; }
  .grade-letter {
    display: inline-block;
    font-size: 72px; font-weight: 800; line-height: 1;
    color: ${gradeFn}; letter-spacing: -0.03em;
  }
  .summary {
    text-align: center; max-width: 500px; margin: 16px auto 24px;
    color: #a1a1aa; font-size: 14px; line-height: 1.7;
  }
  .section { margin-top: 24px; }
  .footer {
    text-align: center; margin-top: 40px; padding-top: 24px;
    border-top: 1px solid #27272a; color: #52525b; font-size: 12px;
  }
  details.category-card[open] > summary { border-bottom: 1px solid #27272a; }
  details.category-card > summary::-webkit-details-marker { display: none; }
  details.category-card > summary::marker { display: none; content: none; }
  details.category-card[open] > summary span:last-child { transform: rotate(180deg); }

  /* Print styles */
  @media print {
    body { background: #fff; color: #18181b; }
    .header { border-color: #d4d4d8; }
    .header h1 { color: #18181b; }
    .grade-letter { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    details.category-card { border-color: #d4d4d8; background: #fafafa; break-inside: avoid; }
    details.category-card > summary { color: #18181b; }
    .footer { border-color: #d4d4d8; }
    .container { max-width: 100%; }
  }

  /* Responsive */
  @media (max-width: 480px) {
    .grade-letter { font-size: 56px; }
    .header h1 { font-size: 22px; }
    .container { padding: 16px 12px 32px; }
  }
</style>
</head>
<body>
<div class="container">

  <header class="header">
    <h1>Vibe Gate Report</h1>
    <div class="url">${escapeHtml(url)}</div>
    <div class="timestamp">Generated: ${escapeHtml(timestamp)}</div>
  </header>

  <div class="grade-section">
    <div class="grade-letter">${escapeHtml(result.grade)}</div>
  </div>

  ${renderScoreBar(result.score)}

  <div class="summary">
    ${escapeHtml(result.summary)}
  </div>

  <div class="section">
    <h3 style="color:#e4e4e7;font-size:16px;border-bottom:1px solid #27272a;padding-bottom:8px;">Categories</h3>
    ${categoryCards}
  </div>

  ${recommendationsHtml}

  <footer class="footer">
    Generated by Vibe Gate · ${escapeHtml(timestamp)}
  </footer>

</div>
</body>
</html>`;
}
