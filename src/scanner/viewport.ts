import { chromium, type Browser, type Page, type ConsoleMessage } from 'playwright';
import type { ConsoleIssue } from '../types.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ViewportReport {
  viewports: {
    width: number;
    height: number;
    label: string;
    loadTimeMs: number;
    consoleErrors: ConsoleIssue[];
    hasHorizontalScroll: boolean;
    layoutBreakpoints: string[];
    screenshot: string;
  }[];
  responsiveIssues: string[];
  score: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Default viewport presets to test. */
const DEFAULT_VIEWPORTS = [
  { width: 1280, height: 800, label: 'desktop' },
  { width: 768, height: 1024, label: 'tablet' },
  { width: 375, height: 812, label: 'mobile' },
  { width: 320, height: 568, label: 'mobile-small' },
] as const;

/** Max viewports per scan to prevent excessive runtime. */
const MAX_VIEWPORTS = 8;

/** Elements to check for visibility changes across breakpoints. */
const BREAKPOINT_CHECK_SELECTORS = [
  'nav',
  'header',
  '[role="navigation"]',
  '.sidebar',
  '.menu',
  '.hamburger',
  '.mobile-menu',
  '[data-testid="mobile-nav"]',
  '.desktop-only',
  '.mobile-only',
  '.tablet-only',
  'main',
  'footer',
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Map a Playwright ConsoleMessage to ConsoleIssue. */
function toConsoleIssue(msg: ConsoleMessage): ConsoleIssue {
  const pwType = msg.type();
  let type: ConsoleIssue['type'];
  if (pwType === 'error') {
    type = 'error';
  } else if (pwType === 'warning') {
    type = 'warn';
  } else {
    type = 'info';
  }
  const location = msg.location();
  return {
    type,
    message: msg.text(),
    source: location.url ? `${location.url}:${location.lineNumber ?? 0}` : undefined,
  };
}

/** Normalise user-supplied URL so it always has a valid origin. */
function normaliseUrl(raw: string): URL | null {
  let candidate = raw.trim();
  if (!/^https?:\/\//i.test(candidate)) {
    candidate = `https://${candidate}`;
  }
  try {
    return new URL(candidate);
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Single-viewport scanner
// ---------------------------------------------------------------------------

interface ViewportResult {
  width: number;
  height: number;
  label: string;
  loadTimeMs: number;
  consoleErrors: ConsoleIssue[];
  hasHorizontalScroll: boolean;
  layoutBreakpoints: string[];
  screenshot: string;
}

async function scanSingleViewport(
  page: Page,
  width: number,
  height: number,
  label: string,
  targetUrl: string,
): Promise<ViewportResult> {
  const consoleErrors: ConsoleIssue[] = [];
  const layoutBreakpoints: string[] = [];

  // Capture console errors for this viewport
  const consoleHandler = (msg: ConsoleMessage): void => {
    const issue = toConsoleIssue(msg);
    if (issue.type === 'error') {
      consoleErrors.push(issue);
    }
  };
  page.on('console', consoleHandler);

  try {
    // ---------- resize viewport ----------
    await page.setViewportSize({ width, height });

    // ---------- navigate + measure ----------
    const start = performance.now();
    await page.goto(targetUrl, {
      waitUntil: 'load',
      timeout: 30000,
    });
    const loadTimeMs = Math.round(performance.now() - start);

    // Small settle for layout shifts
    await page.waitForTimeout(500);

    // ---------- check horizontal scroll ----------
    let hasHorizontalScroll = false;
    try {
      hasHorizontalScroll = await page.evaluate(
        'document.documentElement.scrollWidth > window.innerWidth + 1',
      );
    } catch {
      hasHorizontalScroll = false;
    }

    // ---------- detect layout breakpoints ----------
    const visibleState = await recordVisibility(page);
    for (const [selector, info] of Object.entries(visibleState)) {
      const { visible, overflow } = info;
      if (!visible) {
        layoutBreakpoints.push(`${selector} hidden at ${width}px`);
      } else if (overflow) {
        layoutBreakpoints.push(`${selector} overflows viewport at ${width}px`);
      }
    }

    // ---------- take screenshot ----------
    let screenshot = '';
    try {
      const buffer = await page.screenshot({
        fullPage: false, // viewport-only
        type: 'png',
      });
      screenshot = buffer.toString('base64');
    } catch {
      // Screenshot failed — continue without it
    }

    return {
      width,
      height,
      label,
      loadTimeMs,
      consoleErrors,
      hasHorizontalScroll,
      layoutBreakpoints,
      screenshot,
    };
  } finally {
    page.off('console', consoleHandler);
  }
}

/** Record whether key elements are visible and within the viewport. */
async function recordVisibility(
  page: Page,
): Promise<Record<string, { visible: boolean; overflow: boolean }>> {
  const result: Record<string, { visible: boolean; overflow: boolean }> = {};
  try {
    const selectorsJson = JSON.stringify(BREAKPOINT_CHECK_SELECTORS);
    const data = await page.evaluate(
      `(() => {
        const selectors = ${selectorsJson};
        const map = {};
        for (const sel of selectors) {
          const el = document.querySelector(sel);
          if (!el) {
            map[sel] = { visible: false, overflow: false };
            continue;
          }
          const rect = el.getBoundingClientRect();
          const hasSize = rect.width > 0 && rect.height > 0;
          const inViewport =
            rect.bottom > 0 &&
            rect.right > 0 &&
            rect.top < window.innerHeight &&
            rect.left < window.innerWidth;
          const overflows =
            rect.right > window.innerWidth + 5 || rect.left < -5;
          map[sel] = {
            visible: hasSize && inViewport,
            overflow: overflows,
          };
        }
        return map;
      })()`,
    );
    Object.assign(result, data as Record<string, { visible: boolean; overflow: boolean }>);
  } catch {
    // Evaluation failed — return empty map
  }
  return result;
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export async function scanViewports(
  url: string,
  viewports?: { width: number; height: number }[],
): Promise<ViewportReport> {
  const errors: string[] = [];
  const responsiveIssues: string[] = [];
  const results: ViewportReport['viewports'] = [];

  // ---------- input validation ----------
  const normalised = normaliseUrl(url);
  if (!normalised) {
    return {
      viewports: [],
      responsiveIssues: [`Invalid URL: "${url}"`],
      score: 0,
    };
  }
  const targetUrl = normalised.href;

  // ---------- resolve viewports ----------
  let viewportList: { width: number; height: number; label: string }[];
  if (viewports && viewports.length > 0) {
    // User-supplied viewports, truncated to MAX_VIEWPORTS
    viewportList = viewports.slice(0, MAX_VIEWPORTS).map((vp, i) => ({
      width: vp.width,
      height: vp.height,
      label: `${vp.width}x${vp.height}`,
    }));
  } else {
    viewportList = [...DEFAULT_VIEWPORTS];
  }

  let browser: Browser | null = null;
  let page: Page | null = null;

  try {
    // ---------- launch browser ----------
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      viewport: { width: 1280, height: 800 },
      ignoreHTTPSErrors: true,
    });
    page = await context.newPage();

    // ---------- scan each viewport ----------
    for (const vp of viewportList) {
      const result = await scanSingleViewport(page, vp.width, vp.height, vp.label, targetUrl);
      results.push(result);

      // Collect responsive issues from this viewport
      if (result.hasHorizontalScroll) {
        responsiveIssues.push(`Horizontal scrollbar detected at ${vp.label} (${vp.width}x${vp.height}). Content exceeds viewport width.`);
      }
      for (const bp of result.layoutBreakpoints) {
        responsiveIssues.push(`Layout breakpoint at ${vp.label}: ${bp}`);
      }
      if (result.consoleErrors.length > 0) {
        for (const ce of result.consoleErrors) {
          responsiveIssues.push(`Console error at ${vp.label}: ${ce.message}`);
        }
      }
    }

    // ---------- calculate score ----------
    // 25 points per viewport. Deduct 3 per responsive issue, min 0 per viewport.
    const maxPerViewport = 25;
    let score = 0;

    for (let i = 0; i < results.length; i++) {
      const r = results[i];
      let vpScore = maxPerViewport;

      // Deductions
      if (r.hasHorizontalScroll) {
        vpScore -= 5;
      }
      vpScore -= Math.min(r.layoutBreakpoints.length * 3, 15);
      vpScore -= Math.min(r.consoleErrors.length * 2, 10);

      // Additional deduction for slow load
      if (r.loadTimeMs > 3000) {
        vpScore -= 3;
      }

      score += Math.max(vpScore, 0);
    }

    return {
      viewports: results,
      responsiveIssues,
      score,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    responsiveIssues.push(`Viewport scan error: ${message}`);
    return {
      viewports: results,
      responsiveIssues,
      score: 0,
    };
  } finally {
    if (page !== null && !page.isClosed()) {
      await page.close().catch(() => { /* best-effort */ });
    }
    if (browser !== null) {
      await browser.close().catch(() => { /* best-effort */ });
    }
  }
}
