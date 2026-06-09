import type { RouteCheck } from '../types.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AuthScanReport {
  routes: RouteCheck[];
  loginPage: { found: boolean; url: string | null };
  unprotectedSensitiveRoutes: string[];
  score: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Path segments that imply a route should require authentication. */
const SENSITIVE_SEGMENTS = [
  'admin',
  'dashboard',
  'api',
  'account',
  'settings',
  'profile',
  'checkout',
  'billing',
];

/** Common login-page paths scanned when not discovered organically. */
const COMMON_LOGIN_PATHS = [
  '/login',
  '/auth',
  '/auth/login',
  '/signin',
  '/sign-in',
  '/account/login',
];

/** Substrings in response bodies that indicate auth is required. */
const AUTH_BODY_INDICATORS = ['unauthorized', 'login', 'sign in', 'authentication required'];

/** Auth redirect destinations (checked against Location header pathname). */
const AUTH_REDIRECT_PATHS = ['/login', '/auth', '/signin', '/sign-in', '/account/login'];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Determine if a path should require auth based on its segments. */
function isSensitivePath(path: string): boolean {
  const lower = path.toLowerCase();
  return SENSITIVE_SEGMENTS.some((seg) => lower.includes(seg));
}

/** Clamp a number to [min, max]. */
function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/** Build a full URL from base + path (handles both relative and absolute paths). */
function resolveUrl(base: string, path: string): string {
  try {
    // If path is already an absolute URL, return it
    if (path.startsWith('http://') || path.startsWith('https://')) {
      return path;
    }
    // Append to base URL
    const normalizedBase = base.endsWith('/') ? base.slice(0, -1) : base;
    const normalizedPath = path.startsWith('/') ? path : `/${path}`;
    return `${normalizedBase}${normalizedPath}`;
  } catch {
    return `${base.replace(/\/$/, '')}/${path.replace(/^\//, '')}`;
  }
}

// ---------------------------------------------------------------------------
// Route checking
// ---------------------------------------------------------------------------

interface RouteResult {
  path: string;
  status: number;
  requiresAuth: boolean;
  hasAuth: boolean;
}

async function checkRoute(
  fullUrl: string,
  path: string,
  timeoutMs: number,
): Promise<RouteResult> {
  const result: RouteResult = {
    path,
    status: 0,
    requiresAuth: isSensitivePath(path),
    hasAuth: false,
  };

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(fullUrl, {
      redirect: 'manual',
      signal: controller.signal,
    });

    clearTimeout(timeoutId);
    result.status = response.status;

    // Auth detected via HTTP status
    if (response.status === 401 || response.status === 403) {
      result.hasAuth = true;
      return result;
    }

    // Auth detected via redirect to login
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      if (location) {
        try {
          const locPath = new URL(location, fullUrl).pathname.toLowerCase();
          if (AUTH_REDIRECT_PATHS.some((p) => locPath === p || locPath.startsWith(`${p}/`))) {
            result.hasAuth = true;
            return result;
          }
        } catch {
          // Malformed location header – continue to body check
        }
      }
    }

    // Auth detected via response body
    try {
      const body = await response.text();
      const lowerBody = body.toLowerCase().substring(0, 2000); // first 2KB only
      if (AUTH_BODY_INDICATORS.some((indicator) => lowerBody.includes(indicator))) {
        result.hasAuth = true;
      }
    } catch {
      // Body read failed – treat as no auth detected
    }
  } catch {
    clearTimeout(timeoutId);
    result.status = 0; // unreachable
  }

  return result;
}

// ---------------------------------------------------------------------------
// Login page detection
// ---------------------------------------------------------------------------

async function findLoginPage(
  baseUrl: string,
  existingRoutes: string[],
  timeoutMs: number,
): Promise<{ found: boolean; url: string | null }> {
  // First check if any existing route looks like a login page
  const loginFromRoutes = existingRoutes.find((route) =>
    COMMON_LOGIN_PATHS.some((p) => route.toLowerCase().includes(p.toLowerCase())),
  );

  if (loginFromRoutes) {
    const fullUrl = resolveUrl(baseUrl, loginFromRoutes);
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
      const response = await fetch(fullUrl, { redirect: 'manual', signal: controller.signal });
      clearTimeout(timeoutId);

      if (response.ok || response.status === 401 || response.status === 403) {
        return { found: true, url: fullUrl };
      }
    } catch {
      // Try next candidate
    }
  }

  // Try common login paths
  for (const loginPath of COMMON_LOGIN_PATHS) {
    // Skip if already checked above
    if (existingRoutes.some((r) => r.toLowerCase() === loginPath.toLowerCase())) {
      continue;
    }

    const fullUrl = resolveUrl(baseUrl, loginPath);
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
      const response = await fetch(fullUrl, { redirect: 'manual', signal: controller.signal });
      clearTimeout(timeoutId);

      if (response.ok) {
        return { found: true, url: fullUrl };
      }
    } catch {
      // Try next
    }
  }

  return { found: false, url: null };
}

// ---------------------------------------------------------------------------
// Main scan function
// ---------------------------------------------------------------------------

export async function scanAuth(
  url: string,
  discoveredRoutes: string[],
): Promise<AuthScanReport> {
  const timeoutMs = 10_000;
  const report: AuthScanReport = {
    routes: [],
    loginPage: { found: false, url: null },
    unprotectedSensitiveRoutes: [],
    score: 0,
  };

  // ---- 1. Check each discovered route ----
  for (const path of discoveredRoutes) {
    const fullUrl = resolveUrl(url, path);
    const result = await checkRoute(fullUrl, path, timeoutMs);
    report.routes.push({
      path: result.path,
      status: result.status,
      requiresAuth: result.requiresAuth,
      hasAuth: result.hasAuth,
    });
  }

  // ---- 2. Find login page ----
  report.loginPage = await findLoginPage(url, discoveredRoutes, timeoutMs);

  // ---- 3. Identify unprotected sensitive routes ----
  // Only flag routes that actually exist (status 200) and lack auth
  for (const route of report.routes) {
    if (route.requiresAuth && !route.hasAuth && route.status < 400) {
      report.unprotectedSensitiveRoutes.push(route.path);
    }
  }

  // ---- 4. Calculate score ----
  // Only score based on routes that exist (return 200 or similar)
  const existingSensitiveRoutes = report.routes.filter((r) => r.requiresAuth && r.status < 400);
  if (existingSensitiveRoutes.length === 0) {
    report.score = 100;
  } else {
    const protectedCount = existingSensitiveRoutes.filter((r) => r.hasAuth).length;
    report.score = Math.round((protectedCount / existingSensitiveRoutes.length) * 100);
    report.score = clamp(report.score, 0, 100);
  }

  return report;
}
