import { chromium, type Browser, type Page, type ConsoleMessage, type Cookie } from 'playwright';
import type { ConsoleIssue } from '../types.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AuthFlowReport {
  loginSuccess: boolean;
  loginDurationMs: number;
  sessionTokenFound: boolean;
  protectedRoutesAccessible: { path: string; accessible: boolean; status: number }[];
  consoleErrors: ConsoleIssue[];
  score: number;
  errors: string[];
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Paths to try as login page candidates. */
const LOGIN_PATH_CANDIDATES = ['/login', '/signin', '/auth'] as const;

/** Common username field selectors tried in order. */
const USERNAME_SELECTORS = [
  'input[name="username"]',
  'input[name="email"]',
  'input[type="email"]',
  'input[name="user"]',
  '#username',
  '#email',
  '#user',
  '[data-testid="username"]',
  '[data-testid="email"]',
];

/** Common password field selectors tried in order. */
const PASSWORD_SELECTORS = [
  'input[name="password"]',
  'input[type="password"]',
  '#password',
  '[data-testid="password"]',
];

/** Common submit button selectors tried in order. */
const SUBMIT_SELECTORS = [
  'button[type="submit"]',
  'input[type="submit"]',
  'button:has-text("Sign in")',
  'button:has-text("Log in")',
  'button:has-text("Login")',
  'button:has-text("Submit")',
  '[data-testid="login-submit"]',
];

/** Routes to probe after login to verify session is active. */
const PROTECTED_ROUTE_CANDIDATES = [
  '/admin',
  '/dashboard',
  '/account',
  '/settings',
  '/profile',
  '/api',
];

/** Substrings in page content that indicate an invalid login. */
const LOGIN_FAILURE_INDICATORS = [
  'invalid',
  'incorrect',
  'wrong password',
  'user not found',
  'invalid credentials',
  'try again',
];

/** Common session cookie name patterns. */
const SESSION_COOKIE_PATTERNS = [
  /session/i,
  /token/i,
  /auth/i,
  /sid/i,
  /jwt/i,
  /connect\.sid/i,
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

/** Build a full URL from base + path. */
function resolveUrl(base: string, path: string): string {
  const normBase = base.endsWith('/') ? base.slice(0, -1) : base;
  const normPath = path.startsWith('/') ? path : `/${path}`;
  return `${normBase}${normPath}`;
}

/** Check whether any session cookie exists in the browser context. */
function hasSessionCookie(cookies: Cookie[]): boolean {
  return cookies.some((c) => SESSION_COOKIE_PATTERNS.some((pattern) => pattern.test(c.name)));
}

// ---------------------------------------------------------------------------
// Login discovery
// ---------------------------------------------------------------------------

async function findLoginPage(
  page: Page,
  baseUrl: string,
): Promise<string | null> {
  for (const loginPath of LOGIN_PATH_CANDIDATES) {
    const fullUrl = resolveUrl(baseUrl, loginPath);
    try {
      const response = await page.goto(fullUrl, {
        waitUntil: 'domcontentloaded',
        timeout: 10000,
      });
      const status = response?.status() ?? 0;
      // Accept any 2xx, 3xx, or 401 as a valid login page
      if (status >= 200 && (status < 400 || status === 401)) {
        return fullUrl;
      }
    } catch {
      continue;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export async function testAuthFlow(
  url: string,
  credentials: { username: string; password: string; usernameField?: string; passwordField?: string },
): Promise<AuthFlowReport> {
  const errors: string[] = [];
  const consoleErrors: ConsoleIssue[] = [];
  const protectedRoutesAccessible: AuthFlowReport['protectedRoutesAccessible'] = [];

  let browser: Browser | null = null;
  let page: Page | null = null;
  let loginSuccess = false;
  let loginDurationMs = 0;
  let sessionTokenFound = false;

  try {
    // ---------- launch browser ----------
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      viewport: { width: 1280, height: 720 },
      ignoreHTTPSErrors: true,
    });
    page = await context.newPage();

    // ---------- capture console ----------
    page.on('console', (msg: ConsoleMessage) => {
      const issue = toConsoleIssue(msg);
      if (issue.type === 'error') {
        consoleErrors.push(issue);
      }
    });

    // ---------- find login page ----------
    const loginPageUrl = await findLoginPage(page, url);
    if (!loginPageUrl) {
      errors.push('Could not discover a login page at /login, /signin, or /auth.');
      const score = 0;
      return {
        loginSuccess: false,
        loginDurationMs: 0,
        sessionTokenFound: false,
        protectedRoutesAccessible: [],
        consoleErrors,
        score,
        errors,
      };
    }

    // ---------- fill credentials ----------
    // Determine username field selector: explicit config override, or common patterns
    const userSelectors = credentials.usernameField
      ? [credentials.usernameField]
      : USERNAME_SELECTORS;

    let usernameFieldFound = false;
    for (const sel of userSelectors) {
      try {
        const field = page.locator(sel).first();
        if (await field.isVisible({ timeout: 2000 }).catch(() => false)) {
          await field.fill(credentials.username);
          usernameFieldFound = true;
          break;
        }
      } catch {
        continue;
      }
    }
    if (!usernameFieldFound) {
      errors.push('Could not locate a username/email input field on the login page.');
    }

    // Determine password field selector
    const passSelectors = credentials.passwordField
      ? [credentials.passwordField]
      : PASSWORD_SELECTORS;

    let passwordFieldFound = false;
    for (const sel of passSelectors) {
      try {
        const field = page.locator(sel).first();
        if (await field.isVisible({ timeout: 2000 }).catch(() => false)) {
          await field.fill(credentials.password);
          passwordFieldFound = true;
          break;
        }
      } catch {
        continue;
      }
    }
    if (!passwordFieldFound) {
      errors.push('Could not locate a password input field on the login page.');
    }

    if (!usernameFieldFound || !passwordFieldFound) {
      const score = 0;
      return {
        loginSuccess: false,
        loginDurationMs: 0,
        sessionTokenFound: false,
        protectedRoutesAccessible: [],
        consoleErrors,
        score,
        errors,
      };
    }

    // ---------- submit login ----------
    const loginStart = performance.now();
    let submitClicked = false;

    for (const sel of SUBMIT_SELECTORS) {
      try {
        const button = page.locator(sel).first();
        if (await button.isVisible({ timeout: 2000 }).catch(() => false)) {
          await button.click();
          submitClicked = true;
          break;
        }
      } catch {
        continue;
      }
    }

    if (!submitClicked) {
      // Fallback: press Enter on the password field
      const passField = page.locator(PASSWORD_SELECTORS[0]).first();
      await passField.press('Enter');
    }

    // Wait for navigation or settle
    try {
      await page.waitForLoadState('networkidle', { timeout: 15000 });
    } catch {
      // Timed out — page may be single-page app; fine
    }

    loginDurationMs = Math.round(performance.now() - loginStart);

    // ---------- detect login success ----------
    const pageContent = await page.content();
    const currentUrl = page.url();

    // Success: URL has changed from login page (and not still on login)
    const stillOnLogin = LOGIN_PATH_CANDIDATES.some((p) =>
      currentUrl.toLowerCase().includes(p.toLowerCase()),
    );
    const hasFailureMessage = LOGIN_FAILURE_INDICATORS.some((ind) =>
      pageContent.toLowerCase().includes(ind),
    );

    loginSuccess = !stillOnLogin && !hasFailureMessage;

    // ---------- check session cookies ----------
    const cookies = await context.cookies();
    sessionTokenFound = hasSessionCookie(cookies);

    // If URL didn't change but no failure message, treat as success
    // (some SPAs don't navigate)
    if (!loginSuccess && !hasFailureMessage && sessionTokenFound) {
      loginSuccess = true;
    }

    // ---------- probe protected routes ----------
    if (loginSuccess) {
      for (const routePath of PROTECTED_ROUTE_CANDIDATES) {
        const routePage = await context.newPage();
        try {
          const routeResponse = await routePage.goto(resolveUrl(url, routePath), {
            waitUntil: 'domcontentloaded',
            timeout: 8000,
          });
          const status = routeResponse?.status() ?? 0;
          // Accessible: 2xx (content loaded) or 3xx to non-login path
          const redirectedToLogin = routePage.url().toLowerCase().includes('login') ||
            routePage.url().toLowerCase().includes('signin') ||
            routePage.url().toLowerCase().includes('auth');
          const accessible = status >= 200 && status < 400 && !redirectedToLogin;
          protectedRoutesAccessible.push({
            path: routePath,
            accessible,
            status,
          });
        } catch {
          protectedRoutesAccessible.push({
            path: routePath,
            accessible: false,
            status: 0,
          });
        } finally {
          await routePage.close().catch(() => { /* best-effort */ });
        }
      }
    }

    // ---------- calculate score ----------
    let score = 0;
    if (loginSuccess) {
      score += 50;
    }
    if (sessionTokenFound) {
      score += 10;
    }
    // Protected route scoring: 40 points proportional to accessible routes
    if (protectedRoutesAccessible.length > 0) {
      const accessibleCount = protectedRoutesAccessible.filter((r) => r.accessible).length;
      score += Math.round((accessibleCount / protectedRoutesAccessible.length) * 40);
    } else if (loginSuccess) {
      // No protected routes tested (shouldn't happen), but give benefit
      score += 40;
    }

    // Deduct for console errors (up to 10 points)
    const deduplicatedErrors = new Set(consoleErrors.map((e) => e.message));
    const errorPenalty = Math.min(deduplicatedErrors.size * 2, 20);
    score = Math.max(0, score - errorPenalty);

    return {
      loginSuccess,
      loginDurationMs,
      sessionTokenFound,
      protectedRoutesAccessible,
      consoleErrors,
      score,
      errors,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    errors.push(`Auth flow test error: ${message}`);
    return {
      loginSuccess: false,
      loginDurationMs: 0,
      sessionTokenFound: false,
      protectedRoutesAccessible: [],
      consoleErrors,
      score: 0,
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
