import type { ScanResult, CheckResult } from './types.js';

/**
 * Build a system prompt that instructs an LLM to analyse a vibe-gate
 * scan result and return plain-English explanations suitable for a
 * non-technical founder.
 */
export function buildAnalysisPrompt(url: string, result: ScanResult): string {
  const failingChecks = collectFailingChecks(result);
  const recommendations = result.recommendations;

  return [
    'You are a plain-English code-quality translator for non-technical founders.',
    '',
    `A website at ${url} was scanned by an automated quality gate.`,
    `Overall grade: ${result.grade} (score ${result.score}/100).`,
    `Scanner summary: ${result.summary}`,
    '',
    'Below are the FAIL/WARN checks it found and the recommendations.',
    '',
    '=== FAILING / WARNING CHECKS ===',
    ...failingChecks.map(c => `- [${c.status.toUpperCase()}] ${c.name}: ${c.message}${c.details ? ` (${c.details})` : ''}`),
    '',
    '=== RECOMMENDATIONS ===',
    ...recommendations.map((r, i) => `${i + 1}. ${r}`),
    '',
    '=== TASK ===',
    '1. Write a 1-2 sentence summary of what this scan found. Use simple language a non-technical founder would understand. Do NOT use jargon like "CSP header", "XSS", or "HSTS". Instead say things like "Your site is missing important security protections" or "Your login page is exposed without authentication."',
    '',
    '2. For each FAIL or WARN check above, write a "plainEnglish" explanation of what the check means and why it matters. Again, no jargon.',
    '',
    '3. For each recommendation above, write a "fixSteps" array of concrete, step-by-step instructions a junior developer could follow. Be specific — mention file names, code snippets, or commands where helpful.',
    '',
    'Return ONLY valid JSON in this exact shape (no markdown fences, no extra text):',
    '{',
    '  "summary": "string",',
    '  "findings": [',
    '    {',
    '      "check": "original check name",',
    '      "plainEnglish": "what this means for a founder",',
    '      "severity": "fail | warn",',
    '      "fixSteps": ["step 1", "step 2"]',
    '    }',
    '  ]',
    '}',
  ].join('\n');
}

/** Collect all checks with status 'fail' or 'warn' across all categories. */
function collectFailingChecks(result: ScanResult): CheckResult[] {
  const out: CheckResult[] = [];
  for (const cat of result.categories) {
    for (const check of cat.checks) {
      if (check.status === 'fail' || check.status === 'warn') {
        out.push(check);
      }
    }
  }
  return out;
}
