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
    case 'A': return '#4ade80';
    case 'B': return '#a3e635';
    case 'C': return '#facc15';
    case 'D': return '#fb923c';
    case 'F': return '#ef4444';
    default: return '#a1a1aa';
  }
}

function gradeBg(grade: string): string {
  switch (grade) {
    case 'A': return 'rgba(74,222,128,0.12)';
    case 'B': return 'rgba(163,230,53,0.12)';
    case 'C': return 'rgba(250,204,21,0.12)';
    case 'D': return 'rgba(251,146,60,0.12)';
    case 'F': return 'rgba(239,68,68,0.12)';
    default: return 'rgba(161,161,170,0.12)';
  }
}

function gradeBorder(grade: string): string {
  switch (grade) {
    case 'A': return 'rgba(74,222,128,0.3)';
    case 'B': return 'rgba(163,230,53,0.3)';
    case 'C': return 'rgba(250,204,21,0.3)';
    case 'D': return 'rgba(251,146,60,0.3)';
    case 'F': return 'rgba(239,68,68,0.3)';
    default: return 'rgba(161,161,170,0.3)';
  }
}

function statusColor(status: string): string {
  switch (status) {
    case 'pass': return '#4ade80';
    case 'warn': return '#facc15';
    case 'fail': return '#f87171';
    case 'info': return '#60a5fa';
    default: return '#a1a1aa';
  }
}

function statusIcon(status: string): string {
  switch (status) {
    case 'pass': return '&#x2713;';
    case 'warn': return '&#x26A0;';
    case 'fail': return '&#x2717;';
    case 'info': return '&#x2139;';
    default: return status;
  }
}

function statusLabel(status: string): string {
  switch (status) {
    case 'pass': return 'PASS';
    case 'warn': return 'WARN';
    case 'fail': return 'FAIL';
    case 'info': return 'INFO';
    default: return status.toUpperCase();
  }
}

const SHIELD_SVG = `<svg width="28" height="28" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
  <path d="M12 2L3 7v5c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V7l-9-5z" fill="#00d4aa" opacity="0.15"/>
  <path d="M12 2L3 7v5c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V7l-9-5z" stroke="#00d4aa" stroke-width="1.5" fill="none"/>
  <path d="M9 12l2 2 4-4" stroke="#00d4aa" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;

function renderCheckRow(check: CheckResult): string {
  const color = statusColor(check.status);
  const icon = statusIcon(check.status);
  const label = statusLabel(check.status);
  let html = `
      <div class="check-row">
        <span class="check-status" style="color:${color};">
          <span class="check-icon">${icon}</span>
          <span class="check-label">${label}</span>
        </span>
        <span class="check-msg">${escapeHtml(check.message)}</span>`;

  if (check.details) {
    html += `
        <details class="check-details">
          <summary>Details</summary>
          <pre>${escapeHtml(check.details)}</pre>
        </details>`;
  }

  html += `
      </div>`;
  return html;
}

function renderCategoryCard(cat: CategoryResult, index: number): string {
  const color = statusColor(cat.status);
  const scoreColor = cat.score >= 80 ? '#4ade80' : cat.score >= 60 ? '#facc15' : '#f87171';
  const checksHtml = cat.checks.map(renderCheckRow).join('');

  return `
    <details class="category-card" ${index === 0 ? 'open' : ''}>
      <summary class="cat-summary">
        <span class="cat-left">
          <span class="cat-dot" style="background:${color};"></span>
          <span class="cat-name">${escapeHtml(cat.name)}</span>
          <span class="cat-meta">${cat.score}% &middot; weight ${cat.weight}%</span>
        </span>
        <span class="cat-right">
          <span class="cat-bar-wrap">
            <span class="cat-bar" style="width:${cat.score}%;background:${scoreColor};"></span>
          </span>
          <span class="cat-chevron">&#x25BC;</span>
        </span>
      </summary>
      <div class="cat-checks">
        ${checksHtml}
      </div>
    </details>`;
}

function renderScoreBar(score: number): string {
  const color = score >= 80 ? '#4ade80' : score >= 60 ? '#facc15' : '#f87171';
  return `
    <div class="score-bar-wrap">
      <div class="score-bar-track">
        <div class="score-bar-fill" style="width:${score}%;background:${color};"></div>
      </div>
      <div class="score-bar-label">
        <span>Overall Score</span>
        <span style="color:${color};font-weight:700;">${score}/100</span>
      </div>
    </div>`;
}

export function generateHtmlReport(result: ScanResult, url: string): string {
  const timestamp = new Date().toISOString();
  const gColor = gradeColor(result.grade);
  const gBg = gradeBg(result.grade);
  const gBorder = gradeBorder(result.grade);
  const categoryCards = result.categories.map(renderCategoryCard).join('');
  const recommendationsHtml = result.recommendations.length > 0
    ? `
    <section class="section">
      <h3 class="section-title">Recommendations</h3>
      <ol class="rec-list">
        ${result.recommendations.map(r => `<li class="rec-item"><span class="rec-bullet">&#x2192;</span> ${escapeHtml(r)}</li>`).join('')}
      </ol>
    </section>`
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

  /* Header */
  .header {
    text-align: center;
    padding: 36px 0 28px;
    border-bottom: 1px solid #27272a;
    margin-bottom: 28px;
  }
  .header-brand {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
    margin-bottom: 8px;
  }
  .header h1 {
    font-size: 28px;
    font-weight: 700;
    color: #fff;
    letter-spacing: -0.02em;
  }
  .header h1 .accent { color: #00d4aa; }
  .header .url {
    font-size: 14px;
    color: #71717a;
    margin-top: 4px;
    word-break: break-all;
  }
  .header .timestamp {
    font-size: 11px;
    color: #52525b;
    margin-top: 6px;
  }

  /* Grade badge */
  .grade-section {
    text-align: center;
    padding: 24px 0 12px;
  }
  .grade-badge {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 120px;
    height: 120px;
    border-radius: 24px;
    font-size: 64px;
    font-weight: 800;
    line-height: 1;
    letter-spacing: -0.03em;
    color: ${gColor};
    background: ${gBg};
    border: 2px solid ${gBorder};
    box-shadow: 0 0 40px ${gBg}, 0 0 80px ${gBg};
  }

  /* Score bar */
  .score-bar-wrap { max-width: 400px; margin: 16px auto 24px; }
  .score-bar-track {
    background: #27272a;
    border-radius: 99px;
    height: 10px;
    overflow: hidden;
  }
  .score-bar-fill {
    height: 100%;
    border-radius: 99px;
    transition: width 0.6s ease;
  }
  .score-bar-label {
    display: flex;
    justify-content: space-between;
    margin-top: 6px;
    font-size: 13px;
    color: #a1a1aa;
  }

  /* Summary */
  .summary {
    text-align: center;
    max-width: 500px;
    margin: 0 auto 28px;
    color: #a1a1aa;
    font-size: 14px;
    line-height: 1.7;
  }

  /* Sections */
  .section { margin-top: 28px; }
  .section-title {
    color: #e4e4e7;
    font-size: 16px;
    font-weight: 600;
    border-bottom: 1px solid #27272a;
    padding-bottom: 8px;
    margin-bottom: 12px;
  }

  /* Category cards */
  .category-card {
    background: #18181b;
    border: 1px solid #27272a;
    border-radius: 8px;
    margin-bottom: 12px;
    overflow: hidden;
  }
  .cat-summary {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 14px 16px;
    cursor: pointer;
    list-style: none;
    user-select: none;
  }
  .cat-summary::-webkit-details-marker { display: none; }
  .cat-summary::marker { display: none; content: none; }
  .category-card[open] > .cat-summary { border-bottom: 1px solid #27272a; }
  .category-card[open] > .cat-summary .cat-chevron { transform: rotate(180deg); }
  .cat-left {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 15px;
    font-weight: 600;
    color: #e4e4e7;
  }
  .cat-dot {
    display: inline-block;
    width: 10px;
    height: 10px;
    border-radius: 50%;
    flex-shrink: 0;
  }
  .cat-meta {
    font-size: 12px;
    color: #71717a;
    font-weight: 400;
  }
  .cat-right {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .cat-bar-wrap {
    width: 80px;
    height: 6px;
    background: #27272a;
    border-radius: 99px;
    overflow: hidden;
  }
  .cat-bar {
    display: block;
    height: 100%;
    border-radius: 99px;
  }
  .cat-chevron {
    font-size: 12px;
    color: #52525b;
    font-weight: 600;
    transition: transform 0.2s ease;
  }
  .cat-checks { padding: 0 16px 12px 20px; }

  /* Check rows */
  .check-row {
    padding: 6px 0;
    border-bottom: 1px solid #27272a;
    color: #a1a1aa;
    font-size: 13px;
  }
  .check-row:last-child { border-bottom: none; }
  .check-status { font-weight: 600; }
  .check-icon { margin-right: 2px; }
  .check-label { font-size: 11px; opacity: 0.7; margin-left: 2px; }
  .check-msg { margin-left: 8px; }
  .check-details { margin-top: 4px; }
  .check-details summary {
    cursor: pointer;
    color: #71717a;
    font-size: 12px;
  }
  .check-details pre {
    background: #18181b;
    padding: 8px;
    border-radius: 4px;
    margin-top: 4px;
    font-size: 12px;
    color: #d4d4d8;
    overflow-x: auto;
    white-space: pre-wrap;
  }

  /* Recommendations */
  .rec-list {
    padding-left: 0;
    list-style: none;
    counter-reset: rec-counter;
  }
  .rec-item {
    position: relative;
    padding: 10px 12px 10px 36px;
    margin-bottom: 8px;
    background: #18181b;
    border: 1px solid #27272a;
    border-radius: 6px;
    color: #d4d4d8;
    font-size: 14px;
    line-height: 1.6;
    counter-increment: rec-counter;
  }
  .rec-item::before {
    content: counter(rec-counter);
    position: absolute;
    left: 12px;
    top: 10px;
    width: 18px;
    height: 18px;
    border-radius: 50%;
    background: rgba(0,212,170,0.15);
    color: #00d4aa;
    font-size: 11px;
    font-weight: 700;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .rec-bullet { color: #00d4aa; font-weight: 600; }

  /* Footer */
  .footer {
    text-align: center;
    margin-top: 40px;
    padding-top: 24px;
    border-top: 1px solid #27272a;
    color: #52525b;
    font-size: 12px;
  }
  .footer a { color: #00d4aa; text-decoration: none; }

  /* Print styles */
  @media print {
    body { background: #fff; color: #18181b; }
    .container { max-width: 100%; }
    .header { border-color: #d4d4d8; }
    .header h1 { color: #18181b; }
    .header h1 .accent { color: #009977; }
    .grade-badge {
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
      box-shadow: none;
      border-width: 2px;
    }
    .score-bar-track { background: #e5e7eb; }
    .category-card {
      border-color: #d4d4d8;
      background: #fafafa;
      break-inside: avoid;
    }
    .cat-summary { color: #18181b; }
    .cat-left { color: #18181b; }
    .section-title { color: #18181b; border-color: #d4d4d8; }
    .rec-item { background: #fafafa; border-color: #d4d4d8; color: #18181b; }
    .rec-item::before { background: rgba(0,153,119,0.15); color: #009977; }
    .footer { border-color: #d4d4d8; }
    .check-row { border-color: #e5e7eb; }
    .check-details pre { background: #f3f4f6; }
  }

  /* Responsive */
  @media (max-width: 480px) {
    .grade-badge { width: 96px; height: 96px; font-size: 48px; border-radius: 20px; }
    .header h1 { font-size: 22px; }
    .container { padding: 16px 12px 32px; }
    .cat-bar-wrap { width: 50px; }
  }
</style>
</head>
<body>
<div class="container">

  <header class="header">
    <div class="header-brand">
      ${SHIELD_SVG}
      <h1>Vibe <span class="accent">Gate</span> Report</h1>
    </div>
    <div class="url">${escapeHtml(url)}</div>
    <div class="timestamp">Generated: ${escapeHtml(timestamp)}</div>
  </header>

  <div class="grade-section">
    <div class="grade-badge">${escapeHtml(result.grade)}</div>
  </div>

  ${renderScoreBar(result.score)}

  <div class="summary">
    ${escapeHtml(result.summary)}
  </div>

  <section class="section">
    <h3 class="section-title">Categories</h3>
    ${categoryCards}
  </section>

  ${recommendationsHtml}

  <footer class="footer">
    Generated by <a href="https://vibe-gate.dev" target="_blank">Vibe Gate</a> &middot; ${escapeHtml(timestamp)}
  </footer>

</div>
</body>
</html>`;
}