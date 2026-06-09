import type { SecurityHeaders, SecretFinding } from '../types.js';
import https from 'node:https';
import tls from 'node:tls';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface HeaderFinding {
  name: string;
  status: 'pass' | 'warn' | 'fail';
  message: string;
}

export interface SecurityScanReport {
  headers: Record<string, string>;
  headerFindings: HeaderFinding[];
  secrets: SecretFinding[];
  sslValid: boolean | null;
  mixedContent: string[];
  score: number;
}

// ---------------------------------------------------------------------------
// Security header definitions – name, weight and the check function
// ---------------------------------------------------------------------------

interface HeaderCheck {
  name: string;
  weight: number; // contribution to header sub-score (sum = 100)
  check(headerValue: string | undefined): { status: 'pass' | 'warn' | 'fail'; message: string };
}

const HEADER_CHECKS: HeaderCheck[] = [
  {
    name: 'content-security-policy',
    weight: 25,
    check(val) {
      if (!val) return { status: 'fail', message: 'Missing Content-Security-Policy header' };
      return { status: 'pass', message: 'Content-Security-Policy header present' };
    },
  },
  {
    name: 'strict-transport-security',
    weight: 25,
    check(val) {
      if (!val) return { status: 'fail', message: 'Missing Strict-Transport-Security header' };
      const maxAgeMatch = val.match(/max-age=(\d+)/i);
      if (!maxAgeMatch) return { status: 'warn', message: 'HSTS present but no max-age directive found' };
      const maxAge = parseInt(maxAgeMatch[1], 10);
      const oneYear = 31_536_000;
      if (maxAge < oneYear) {
        return { status: 'warn', message: `HSTS max-age is ${maxAge} seconds (< 1 year)` };
      }
      return { status: 'pass', message: 'Strict-Transport-Security header present with sufficient max-age' };
    },
  },
  {
    name: 'x-frame-options',
    weight: 20,
    check(val) {
      if (!val) return { status: 'fail', message: 'Missing X-Frame-Options header' };
      return { status: 'pass', message: 'X-Frame-Options header present' };
    },
  },
  {
    name: 'x-content-type-options',
    weight: 15,
    check(val) {
      if (!val) return { status: 'fail', message: 'Missing X-Content-Type-Options header' };
      return { status: 'pass', message: 'X-Content-Type-Options header present' };
    },
  },
  {
    name: 'referrer-policy',
    weight: 8,
    check(val) {
      if (!val) return { status: 'warn', message: 'Missing Referrer-Policy header' };
      return { status: 'pass', message: 'Referrer-Policy header present' };
    },
  },
  {
    name: 'permissions-policy',
    weight: 7,
    check(val) {
      if (!val) return { status: 'warn', message: 'Missing Permissions-Policy header' };
      return { status: 'pass', message: 'Permissions-Policy header present' };
    },
  },
];

// ---------------------------------------------------------------------------
// Secret-detection regexes
// ---------------------------------------------------------------------------

interface SecretPattern {
  type: string;
  pattern: RegExp;
}

const SECRET_PATTERNS: SecretPattern[] = [
  { type: 'API Key', pattern: /api[_-]?key["']?\s*[:=]\s*["'][A-Za-z0-9_\-]{16,}["']/gi },
  { type: 'AWS Access Key', pattern: /AKIA[0-9A-Z]{16}/g },
  { type: 'OpenAI-style Token', pattern: /sk-[a-zA-Z0-9]{20,}/g },
  { type: 'Password in Comment', pattern: /<!--.*?password.*?-->|(?:\/\/|#).*?password.*?:/gi },
  { type: 'JWT Token', pattern: /eyJ[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}/g },
];

// ---------------------------------------------------------------------------
// SSL check via node:https
// ---------------------------------------------------------------------------

function checkSSL(hostname: string): Promise<boolean> {
  return new Promise((resolve) => {
    const req = https.request(
      {
        hostname,
        port: 443,
        method: 'HEAD',
        rejectUnauthorized: false,
        timeout: 10_000,
      },
      (res) => {
        const socket = res.socket;
        if (socket instanceof tls.TLSSocket) {
          const cert = socket.getPeerCertificate();
          const authorized = socket.authorized;
          const hasCert = cert && Object.keys(cert).length > 0;
          resolve(authorized && hasCert);
        } else {
          resolve(false);
        }
        res.resume();
      },
    );

    req.on('error', () => resolve(false));
    req.on('timeout', () => {
      req.destroy();
      resolve(false);
    });

    req.end();
  });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function normalizeHeaderKey(key: string): string {
  return key.toLowerCase();
}

/** Build a Record<string,string> from fetch Response headers, keys lowercased. */
function headersToRecord(responseHeaders: Headers): Record<string, string> {
  const record: Record<string, string> = {};
  responseHeaders.forEach((value, key) => {
    record[normalizeHeaderKey(key)] = value;
  });
  return record;
}

/** Clamp a number to [min, max]. */
function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/** Find the line number of a sub-string in source. */
function findLine(source: string, value: string): number {
  const idx = source.indexOf(value);
  if (idx === -1) return -1;
  return source.substring(0, idx).split('\n').length;
}

// ---------------------------------------------------------------------------
// Main scan function
// ---------------------------------------------------------------------------

export async function scanSecurity(
  url: string,
  pageSource: string,
): Promise<SecurityScanReport> {
  const parsedUrl = new URL(url);
  const report: SecurityScanReport = {
    headers: {},
    headerFindings: [],
    secrets: [],
    sslValid: null,
    mixedContent: [],
    score: 0,
  };

  // ---- 1. Fetch headers ----
  try {
    const response = await fetch(url, { redirect: 'manual' });
    report.headers = headersToRecord(response.headers);
  } catch {
    // URL unreachable – all header checks will fail, SSL unknown
  }

  // ---- 2. Header findings ----
  for (const check of HEADER_CHECKS) {
    const headerValue = report.headers[check.name];
    const result = check.check(headerValue);
    report.headerFindings.push({
      name: check.name,
      status: result.status,
      message: result.message,
    });
  }

  // ---- 3. Scan secrets in page source ----
  for (const { type, pattern } of SECRET_PATTERNS) {
    // Reset lastIndex for global regexes
    pattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(pageSource)) !== null) {
      report.secrets.push({
        type,
        value: match[0],
        location: url,
        line: findLine(pageSource, match[0]),
      });
    }
  }

  // ---- 4. Mixed content ----
  const mixedContentRegex = /src=["']http:\/\//gi;
  let mixedMatch: RegExpExecArray | null;
  while ((mixedMatch = mixedContentRegex.exec(pageSource)) !== null) {
    report.mixedContent.push(mixedMatch[0]);
  }

  // ---- 5. SSL check ----
  if (parsedUrl.protocol === 'https:') {
    report.sslValid = await checkSSL(parsedUrl.hostname);
  }

  // ---- 6. Score ----
  // Headers sub-score (0-100): start at 100, deduct based on weight for non-pass results
  let headerScore = 100;
  for (let i = 0; i < HEADER_CHECKS.length && i < report.headerFindings.length; i++) {
    const finding = report.headerFindings[i];
    if (finding.status === 'fail') {
      headerScore -= HEADER_CHECKS[i].weight;
    } else if (finding.status === 'warn') {
      headerScore -= HEADER_CHECKS[i].weight * 0.5;
    }
  }
  headerScore = clamp(headerScore, 0, 100);

  // Secrets sub-score (0-100): deduct 15 per secret found
  const secretScore = clamp(100 - report.secrets.length * 15, 0, 100);

  // Mixed content sub-score (0-100): deduct 10 per mixed resource
  const mixedScore = clamp(100 - report.mixedContent.length * 10, 0, 100);

  report.score = Math.round(headerScore * 0.4 + secretScore * 0.4 + mixedScore * 0.2);
  report.score = clamp(report.score, 0, 100);

  return report;
}
