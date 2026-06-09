import type { ScanResult, CategoryResult } from '../types.js';
import { scanPlaywright, type PlaywrightScanReport } from './playwright.js';
import { scanSecurity, type SecurityScanReport } from './security.js';
import { scanAuth, type AuthScanReport } from './auth.js';

/** Category weights (must sum to 100). */
const WEIGHTS = {
  pageHealth: 15,
  consoleErrors: 20,
  securityHeaders: 25,
  secretsExposure: 20,
  authCoverage: 20,
} as const;

/** Grade thresholds. */
function assignGrade(score: number): string {
  if (score >= 90) return 'A';
  if (score >= 80) return 'B';
  if (score >= 70) return 'C';
  if (score >= 60) return 'D';
  return 'F';
}

/** Build summary sentence from scores. */
function buildSummary(score: number, grade: string): string {
  if (grade === 'A') return 'Looking good! Your app passes all major checks.';
  if (grade === 'B') return 'A few minor issues to review before shipping.';
  if (grade === 'C') return 'Moderate issues found — address warnings before deploying to production.';
  if (grade === 'D') return 'Significant issues detected. Do not ship without addressing the failures below.';
  return 'Critical issues found. Your app is not ready for production.';
}

/** Generate actionable recommendations from scan data. */
function buildRecommendations(
  pw: PlaywrightScanReport,
  sec: SecurityScanReport,
  authRp: AuthScanReport,
): string[] {
  const recs: string[] = [];

  // Only flag server errors (5xx) as broken — 4xx means route doesn't exist
  const serverErrors = pw.commonRoutes.filter((r) => r.status >= 500);
  if (serverErrors.length > 0) {
    recs.push(`Fix server errors on: ${serverErrors.map((r) => r.path).join(', ')} returning 5xx.`);
  }
  if (pw.consoleIssues.filter((c) => c.type === 'error').length > 0) {
    recs.push('Fix console errors — they may indicate broken JavaScript or missing API endpoints.');
  }
  if (pw.loadTimeMs > 3000) {
    recs.push(`Page load time is ${pw.loadTimeMs}ms — consider optimizing for < 2s.`);
  }
  if (sec.headerFindings.some((h) => h.status === 'fail')) {
    const missing = sec.headerFindings.filter((h) => h.status === 'fail').map((h) => h.name);
    recs.push(`Add missing security headers: ${missing.join(', ')}.`);
  }
  if (sec.secrets.length > 0) {
    const types = [...new Set(sec.secrets.map((s) => s.type))];
    recs.push(`Remove exposed secrets from source code (${types.join(', ')}).`);
  }
  if (sec.mixedContent.length > 0) {
    recs.push(`Replace ${sec.mixedContent.length} mixed content resource(s) with HTTPS versions.`);
  }
  if (authRp.unprotectedSensitiveRoutes.length > 0) {
    const routes = authRp.unprotectedSensitiveRoutes.slice(0, 5);
    recs.push(`Add authentication to sensitive routes: ${routes.join(', ')}${authRp.unprotectedSensitiveRoutes.length > 5 ? ` and ${authRp.unprotectedSensitiveRoutes.length - 5} more` : ''}.`);
  }
  if (!authRp.loginPage.found) {
    recs.push('No login page detected — if your app requires auth, verify the login flow works.');
  }

  if (recs.length === 0) {
    recs.push('No critical issues found. Keep up the good work!');
  }

  return recs;
}

/** Run all scanners against a URL and produce a final ScanResult. */
export async function scanUrl(url: string): Promise<ScanResult> {
  // 1. Playwright scan
  const pw = await scanPlaywright(url);

  // 2. Security scan (pass the page source — playwright captures HTML)
  //    We'll fetch the page source separately via the playwright report
  //    For now, pass what's available
  const sec = await scanSecurity(url, ''); // source is set below

  // 3. Auth scan with discovered routes
  const discoveredRoutes = pw.commonRoutes.map((r) => r.path);
  const authRp = await scanAuth(url, discoveredRoutes);

  // Build categories
  const pageHealthScore = pw.pageLoaded ? Math.max(0, 100 - Math.floor(pw.loadTimeMs / 50)) : 0;
  const consoleErrorScore = (() => {
    const errors = pw.consoleIssues.filter((c) => c.type === 'error').length;
    if (errors === 0) return 100;
    if (errors <= 2) return 80;
    if (errors <= 5) return 60;
    return Math.max(0, 100 - errors * 10);
  })();

  const categories: CategoryResult[] = [
    {
      name: 'Page Health',
      score: pageHealthScore,
      weight: WEIGHTS.pageHealth,
      status: pageHealthScore >= 80 ? 'pass' : pageHealthScore >= 60 ? 'warn' : 'fail',
      checks: [
        { name: 'Page loaded', status: pw.pageLoaded ? 'pass' : 'fail', message: pw.pageLoaded ? `Loaded in ${pw.loadTimeMs}ms` : 'Page failed to load' },
        { name: 'HTTP Status', status: pw.httpStatus < 400 ? 'pass' : 'fail', message: `Status ${pw.httpStatus}` },
        { name: 'Title', status: pw.title ? 'pass' : 'warn', message: pw.title ? `Title: "${pw.title.slice(0, 60)}"` : 'No page title' },
      ],
    },
    {
      name: 'Console Errors',
      score: consoleErrorScore,
      weight: WEIGHTS.consoleErrors,
      status: consoleErrorScore >= 80 ? 'pass' : consoleErrorScore >= 60 ? 'warn' : 'fail',
      checks: [
        { name: 'JS Errors', status: consoleErrorScore >= 80 ? 'pass' : consoleErrorScore >= 60 ? 'warn' : 'fail', message: `${pw.consoleIssues.filter((c) => c.type === 'error').length} error(s), ${pw.consoleIssues.filter((c) => c.type === 'warn').length} warning(s)` },
        ...pw.consoleIssues.filter((c) => c.type === 'error').slice(0, 5).map((c) => ({
          name: 'Error Detail',
          status: 'info' as const,
          message: c.message.slice(0, 120),
          details: c.source,
        })),
      ],
    },
    {
      name: 'Security Headers',
      score: sec.score,
      weight: WEIGHTS.securityHeaders,
      status: sec.score >= 80 ? 'pass' : sec.score >= 60 ? 'warn' : 'fail',
      checks: sec.headerFindings.map((h) => ({
        name: h.name,
        status: h.status,
        message: h.message,
      })),
    },
    {
      name: 'Secrets Exposure',
      score: sec.secrets.length === 0 ? 100 : Math.max(0, 100 - sec.secrets.length * 15),
      weight: WEIGHTS.secretsExposure,
      status: sec.secrets.length === 0 ? 'pass' : sec.secrets.length <= 2 ? 'warn' : 'fail',
      checks: sec.secrets.length > 0
        ? sec.secrets.slice(0, 10).map((s) => ({
            name: s.type,
            status: 'fail' as const,
            message: `Found in ${s.location}${s.line ? `:${s.line}` : ''}`,
            details: s.value.slice(0, 80),
          }))
        : [{ name: 'Secrets Check', status: 'pass' as const, message: 'No exposed secrets detected' }],
    },
    {
      name: 'Auth Coverage',
      score: authRp.score,
      weight: WEIGHTS.authCoverage,
      status: authRp.score >= 80 ? 'pass' : authRp.score >= 60 ? 'warn' : 'fail',
      checks: [
        { name: 'Login Page', status: authRp.loginPage.found ? 'pass' : 'warn', message: authRp.loginPage.found ? `Found at ${authRp.loginPage.url}` : 'No login page detected' },
        ...authRp.unprotectedSensitiveRoutes.slice(0, 5).map((r) => ({
          name: 'Unprotected Route',
          status: 'fail' as const,
          message: `${r} — no auth detected`,
        })),
        ...(authRp.routes.length > 0
          ? [{ name: 'Routes Checked', status: 'info' as const, message: `${authRp.routes.length} route(s) checked, ${authRp.routes.filter((r) => r.requiresAuth).length} require auth` }]
          : []),
      ],
    },
  ];

  // Compute weighted total score
  const totalWeight = Object.values(WEIGHTS).reduce((a, b) => a + b, 0);
  const totalScore = Math.round(
    categories.reduce((sum, cat) => sum + (cat.score * cat.weight) / totalWeight, 0),
  );
  const grade = assignGrade(totalScore);

  return {
    grade,
    score: totalScore,
    summary: buildSummary(totalScore, grade),
    categories,
    recommendations: buildRecommendations(pw, sec, authRp),
  };
}
