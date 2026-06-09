import { chromium, type Browser, type Page, type ConsoleMessage } from 'playwright';
import type { ConsoleIssue } from '../types.js';

/** Structured report produced by the Playwright browser scanner. */
export interface PlaywrightScanReport {
  /** Whether the target page loaded without fatal network errors. */
  pageLoaded: boolean;
  /** Time from navigation start to load event in milliseconds. */
  loadTimeMs: number;
  /** All console issues (errors, warnings, infos) captured during the session. */
  consoleIssues: ConsoleIssue[];
  /** HTTP status code of the primary navigation response. */
  httpStatus: number;
  /** Document title of the loaded page. */
  title: string;
  /** Full-page screenshot encoded as base64 PNG. */
  screenshot: string;
  /** HTTP status codes for common sub-routes probed against the target origin. */
  commonRoutes: { path: string; status: number }[];
  /** Human-readable error descriptions when something goes wrong. */
  errors: string[];
}

/** Routes probed after the main page load to detect broken links / exposed endpoints. */
const PROBE_ROUTES = [
  '/api',
  '/health',
  '/admin',
  '/login',
  '/signup',
  '/dashboard',
  '/.env',
  '/config',
  '/swagger',
  '/graphql',
] as const;

/**
 * Sanitise a user-provided URL so it always has an origin we can use as a base
 * for route probing. Returns `null` when the input cannot be parsed.
 */
function normaliseUrl(raw: string): URL | null {
  let candidate = raw.trim();
  if (!/^https?:\/\//i.test(candidate)) {
    candidate = `https://${candidate}`;
  }
  try {
    const parsed = new URL(candidate);
    return parsed;
  } catch {
    return null;
  }
}

/**
 * Map a Playwright `ConsoleMessage` to our shared `ConsoleIssue` shape.
 * Coerces `type()` to an allowed union member.
 */
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

/**
 * Probe a single route on the given page's origin.
 * Returns the HTTP status, or 0 when the request was aborted / timed out.
 */
async function probeRoute(
  context: ReturnType<Browser['contexts']>[number],
  origin: string,
  path: string,
): Promise<{ path: string; status: number }> {
  const page = await context.newPage();
  try {
    const response = await page.goto(`${origin}${path}`, {
      waitUntil: 'domcontentloaded',
      timeout: 8000,
    });
    const status = response?.status() ?? 0;
    return { path, status };
  } catch {
    return { path, status: 0 };
  } finally {
    await page.close();
  }
}

/**
 * Scan a deployed web app using Playwright.
 *
 * Launches a headless Chromium browser, navigates to `url`, collects
 * console messages, takes a full-page screenshot, and probes a set of
 * common sub-routes for availability.
 *
 * **Never throws** — every failure path is caught and reflected in the
 * returned report's `errors` array so callers can inspect structured
 * diagnostic data instead of handling exceptions.
 *
 * @param url - The target web app URL (with or without protocol).
 * @returns A structured `PlaywrightScanReport`.
 */
export async function scanPlaywright(url: string): Promise<PlaywrightScanReport> {
  const errors: string[] = [];
  const consoleIssues: ConsoleIssue[] = [];

  // ---------- input validation ----------
  const normalised = normaliseUrl(url);
  if (!normalised) {
    return {
      pageLoaded: false,
      loadTimeMs: 0,
      consoleIssues: [],
      httpStatus: 0,
      title: '',
      screenshot: '',
      commonRoutes: [],
      errors: [`Invalid URL: "${url}"`],
    };
  }

  const targetUrl = normalised.href;
  const origin = normalised.origin;

  let browser: Browser | null = null;
  let page: Page | null = null;

  try {
    // ---------- launch ----------
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      viewport: { width: 1280, height: 720 },
      ignoreHTTPSErrors: true,
    });
    page = await context.newPage();

    // ---------- capture console ----------
    page.on('console', (msg: ConsoleMessage) => {
      consoleIssues.push(toConsoleIssue(msg));
    });

    // ---------- navigate + measure ----------
    const start = performance.now();
    const response = await page.goto(targetUrl, {
      waitUntil: 'load',
      timeout: 30000,
    });
    const loadTimeMs = Math.round(performance.now() - start);

    const httpStatus = response?.status() ?? 0;
    const pageLoaded = httpStatus >= 200 && httpStatus < 500;
    const title = (await page.title()) || '';

    // ---------- screenshot ----------
    const screenshotBuffer = await page.screenshot({
      fullPage: true,
      type: 'png',
    });
    const screenshot = screenshotBuffer.toString('base64');

    // ---------- probe common routes ----------
    const routeResults: { path: string; status: number }[] = [];
    for (const routePath of PROBE_ROUTES) {
      const result = await probeRoute(context, origin, routePath);
      routeResults.push(result);
    }

    await page.close();
    await context.close();

    return {
      pageLoaded,
      loadTimeMs,
      consoleIssues,
      httpStatus,
      title,
      screenshot,
      commonRoutes: routeResults,
      errors,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    errors.push(`Scanner error: ${message}`);

    return {
      pageLoaded: false,
      loadTimeMs: 0,
      consoleIssues,
      httpStatus: 0,
      title: '',
      screenshot: '',
      commonRoutes: [],
      errors,
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
