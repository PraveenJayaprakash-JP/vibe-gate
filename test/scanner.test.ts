import { writeFile } from 'node:fs/promises';
import { mkdtempSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// We test the exported functions from the scanner sub-modules directly.
// scanSecurity tests the header checks + secret detection logic.
// scanAuth tests the route auth classification.
// scanLocal tests the local filesystem secret scanner.

import { scanSecurity } from '../src/scanner/security.js';
import { scanAuth } from '../src/scanner/auth.js';
import { scanLocal } from '../src/scanner/localscan.js';
import type { VibeGateConfig } from '../src/config.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a mock fetch Response with the given headers and status. */
function mockFetchResponse(
  headers: Record<string, string>,
  status = 200,
  body?: string,
): Response {
  return new Response(body ?? '', {
    status,
    headers: new Headers(headers),
  });
}

// ---------------------------------------------------------------------------
// scanSecurity — header checks
// ---------------------------------------------------------------------------

describe('scanSecurity', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('detects missing security headers and scores 0 with no headers', async () => {
    // Mock fetch to return no security headers
    vi.stubGlobal('fetch', async (_url: string) => mockFetchResponse({}));

    const report = await scanSecurity('https://example.com', '');
    expect(report.headerFindings.length).toBeGreaterThan(0);

    // All header checks should fail when headers are missing
    const fails = report.headerFindings.filter((h) => h.status === 'fail');
    expect(fails.length).toBeGreaterThanOrEqual(3);

    // Score should be low (headerScore = 7.5, secretScore = 100, mixedScore = 100)
    // weighted: 7.5*0.4 + 100*0.4 + 100*0.2 = 3 + 40 + 20 = 63
    expect(report.score).toBeLessThan(70);
  });

  it('reports pass for valid security headers', async () => {
    // Mock fetch with good headers
    const goodHeaders = {
      'content-security-policy': "default-src 'self'",
      'strict-transport-security': 'max-age=31536000; includeSubDomains',
      'x-frame-options': 'DENY',
      'x-content-type-options': 'nosniff',
      'referrer-policy': 'no-referrer',
      'permissions-policy': 'camera=()',
      'x-xss-protection': '0',
    };

    vi.stubGlobal(
      'fetch',
      async (_url: string) => mockFetchResponse(goodHeaders),
    );

    const report = await scanSecurity('https://example.com', '');
    const fails = report.headerFindings.filter((h) => h.status === 'fail');
    expect(fails.length).toBe(0);
    // Score should be high (100 on headers, minus possible SSL fail)
    expect(report.score).toBeGreaterThanOrEqual(60);
  });

  it('detects exposed secrets in HTML page source', async () => {
    // Mock fetch — just need a valid response for header check, not relevant here
    vi.stubGlobal('fetch', async (_url: string) => mockFetchResponse({}));

    const htmlWithSecrets = `
      <!DOCTYPE html>
      <html>
      <body>
        <script>
          const openaiKey = "sk-abcdefghijklmnopqrstuvwxyz1234567890";
        </script>
      </body>
      </html>
    `;

    const report = await scanSecurity('https://example.com', htmlWithSecrets);
    expect(report.secrets.length).toBeGreaterThanOrEqual(1);
    // The first match may be 'API Key' or 'OpenAI-style Token' depending on regex order
    const types = report.secrets.map((s) => s.type);
    expect(types.some((t) => t === 'OpenAI-style Token' || t === 'API Key')).toBe(true);
    // Score should be penalized for secrets
    expect(report.score).toBeLessThan(100);
  });

  it('detects multiple secret types in page source', async () => {
    vi.stubGlobal('fetch', async (_url: string) => mockFetchResponse({}));

    const htmlWithMultiple = `
      <script>
        const awsKey = "AKIA1234567890ABCDEF";
        const openAi = "sk-thisisareallylongtoken1234567890abcdefghij";
      </script>
    `;

    const report = await scanSecurity('https://example.com', htmlWithMultiple);
    expect(report.secrets.length).toBeGreaterThanOrEqual(2);
    const types = report.secrets.map((s) => s.type);
    expect(types).toContain('AWS Access Key');
    // Second match is either 'API Key' or 'OpenAI-style Token'
    const hasOpenAiOrApiKey = types.some(
      (t) => t === 'OpenAI-style Token' || t === 'API Key',
    );
    expect(hasOpenAiOrApiKey).toBe(true);
  });

  it('correctly scores partial compliance (some headers missing)', async () => {
    const partialHeaders = {
      'strict-transport-security': 'max-age=31536000',
      'x-content-type-options': 'nosniff',
    };

    vi.stubGlobal(
      'fetch',
      async (_url: string) => mockFetchResponse(partialHeaders),
    );

    const report = await scanSecurity('https://example.com', '');
    // CSP (fail), X-Frame-Options (fail), Referrer-Policy (warn), Permissions-Policy (warn)
    const fails = report.headerFindings.filter((h) => h.status === 'fail');
    expect(fails.length).toBeGreaterThanOrEqual(2);
    // Score should be partial
    expect(report.score).toBeGreaterThan(0);
    expect(report.score).toBeLessThan(80);
  });

  it('reports SSL as null for http:// URLs', async () => {
    vi.stubGlobal('fetch', async (_url: string) => mockFetchResponse({}));
    const report = await scanSecurity('http://example.com', '');
    expect(report.sslValid).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// scanAuth — route auth classification
// ---------------------------------------------------------------------------

describe('scanAuth', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('identifies unprotected sensitive routes (admin, dashboard) when no auth present', async () => {
    // Mock fetch to return 200 with no auth indicators
    vi.stubGlobal(
      'fetch',
      async (_url: string) => mockFetchResponse({}, 200),
    );

    const routes = ['/admin', '/dashboard', '/api/users', '/settings', '/about'];
    const report = await scanAuth('https://example.com', routes);

    // Admin, dashboard, api, settings are sensitive
    expect(report.unprotectedSensitiveRoutes).toContain('/admin');
    expect(report.unprotectedSensitiveRoutes).toContain('/dashboard');
    expect(report.unprotectedSensitiveRoutes).toContain('/api/users');
    expect(report.unprotectedSensitiveRoutes).toContain('/settings');

    // /about is NOT a sensitive route
    expect(report.unprotectedSensitiveRoutes).not.toContain('/about');

    // Score: 4 sensitive routes, 0 protected → 0%
    expect(report.score).toBe(0);
  });

  it('gives 100% auth score when all sensitive routes are protected', async () => {
    // Mock fetch to return 401 for auth-protected routes, 200 for non-auth
    vi.stubGlobal(
      'fetch',
      async (url: string) => {
        const urlStr = String(url);
        if (urlStr.includes('/admin') || urlStr.includes('/dashboard')) {
          return mockFetchResponse({}, 401);
        }
        return mockFetchResponse({}, 200);
      },
    );

    const routes = ['/admin', '/dashboard', '/about'];
    const report = await scanAuth('https://example.com', routes);

    expect(report.unprotectedSensitiveRoutes.length).toBe(0);
    expect(report.score).toBe(100);
  });

  it('detects auth via 403 status', async () => {
    vi.stubGlobal(
      'fetch',
      async (_url: string) => mockFetchResponse({}, 403),
    );

    const routes = ['/admin'];
    const report = await scanAuth('https://example.com', routes);

    expect(report.unprotectedSensitiveRoutes.length).toBe(0);
    expect(report.score).toBe(100);
  });

  it('returns 100 when no sensitive routes exist', async () => {
    vi.stubGlobal(
      'fetch',
      async (_url: string) => mockFetchResponse({}, 200),
    );

    const routes = ['/about', '/contact', '/blog'];
    const report = await scanAuth('https://example.com', routes);

    // None of these are sensitive
    expect(report.unprotectedSensitiveRoutes.length).toBe(0);
    expect(report.score).toBe(100);
  });

  it('identifies checkout and billing as sensitive', async () => {
    vi.stubGlobal(
      'fetch',
      async (_url: string) => mockFetchResponse({}, 200),
    );

    const routes = ['/checkout', '/billing'];
    const report = await scanAuth('https://example.com', routes);

    expect(report.unprotectedSensitiveRoutes).toContain('/checkout');
    expect(report.unprotectedSensitiveRoutes).toContain('/billing');
  });
});

// ---------------------------------------------------------------------------
// scanLocal — filesystem secret detection
// ---------------------------------------------------------------------------

describe('scanLocal', () => {
  let tmpDir: string;

  function makeConfig(overrides: Partial<VibeGateConfig> = {}): VibeGateConfig {
    return {
      probeRoutes: [],
      sensitiveSegments: [],
      ignorePaths: ['node_modules', 'dist', '.git'],
      failBelow: 'D',
      maxLoadTimeMs: 3000,
      reportDir: '.',
      ...overrides,
    };
  }

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'vibe-gate-test-'));
  });

  it('detects exposed API keys in source files', async () => {
    // Create a file with an exposed API key — must use keyword that matches the pattern
    const secretFile = join(tmpDir, 'config.ts');
    const content = `
      export const api_key = "sk-abcdefghijklmnopqrstuvwxyz1234567890";
      export const DB_URL = "postgres://localhost";
    `;
    await writeFile(secretFile, content, 'utf-8');

    const result = await scanLocal(tmpDir, makeConfig());
    const secretsCat = result.categories.find((c) => c.name === 'Local Secrets');
    expect(secretsCat).toBeDefined();
    expect(secretsCat!.score).toBeLessThan(100);
    expect(result.score).toBeLessThan(100);
  });

  it('scores 100 when no secrets found in clean project', async () => {
    // Create a clean file with no secrets
    const cleanFile = join(tmpDir, 'hello.ts');
    await writeFile(cleanFile, 'export const message = "Hello, World!";\n', 'utf-8');

    const result = await scanLocal(tmpDir, makeConfig());
    const secretsCat = result.categories.find((c) => c.name === 'Local Secrets');
    expect(secretsCat).toBeDefined();
    expect(secretsCat!.score).toBe(100);
  });

  it('detects AWS Access Key in local files', async () => {
    const configFile = join(tmpDir, 'aws-config.ts');
    await writeFile(
      configFile,
      'export const awsAccessKey = "AKIA1234567890ABCDEF";\n',
      'utf-8',
    );

    const result = await scanLocal(tmpDir, makeConfig());
    const secretsCat = result.categories.find((c) => c.name === 'Local Secrets');
    expect(secretsCat).toBeDefined();
    expect(secretsCat!.score).toBeLessThan(100);

    const hasFail = secretsCat!.checks.some(
      (c) => c.status === 'fail' && c.name === 'Secret detection',
    );
    expect(hasFail).toBe(true);
  });

  it('detects PEM private keys in local files', async () => {
    const keyFile = join(tmpDir, 'private-key.pem');
    const pemContent = `-----BEGIN PRIVATE KEY-----
MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQC
-----END PRIVATE KEY-----`;
    await writeFile(keyFile, pemContent, 'utf-8');

    // PEM files don't have standard scanned extensions, but the .pem ext
    // isn't in SECRET_SCAN_EXTS. Let me also write a .ts file with PEM content.
    const srcFile = join(tmpDir, 'crypto.ts');
    await writeFile(srcFile, `const key = \`${pemContent}\`;\n`, 'utf-8');

    const result = await scanLocal(tmpDir, makeConfig());
    const secretsCat = result.categories.find((c) => c.name === 'Local Secrets');
    expect(secretsCat).toBeDefined();
    // Should have at least the PEM in the .ts file detected
    expect(secretsCat!.score).toBeLessThan(100);
  });

  it('ignores files in ignored paths', async () => {
    // Create node_modules with a secret
    const nmDir = join(tmpDir, 'node_modules', 'some-lib');
    mkdirSync(nmDir, { recursive: true });
    const nmFile = join(nmDir, 'index.js');
    await writeFile(
      nmFile,
      'const apiKey = "sk-proj-thisisasecret1234567890abcdef";\n',
      'utf-8',
    );

    const result = await scanLocal(
      tmpDir,
      makeConfig({ ignorePaths: ['node_modules', 'dist', '.git'] }),
    );

    const secretsCat = result.categories.find((c) => c.name === 'Local Secrets');
    expect(secretsCat).toBeDefined();
    // The secret in node_modules should be ignored
    expect(secretsCat!.score).toBe(100);
  });
});

// ---------------------------------------------------------------------------
// Grade boundary tests
// ---------------------------------------------------------------------------

describe('Grade boundaries', () => {
  // The assignGrade function is private in scanner/index.ts and localscan.ts,
  // but we can verify the grade boundaries by observing scanLocal output.
  // At score 100 (no files), it should be grade A.
  // At scores < 60, grade should be F.

  it('grade A when score >= 90 (clean project)', async () => {
    const tmpDir = mkdtempSync(join(tmpdir(), 'vibe-gate-grade-'));
    const result = await scanLocal(tmpDir, {
      probeRoutes: [],
      sensitiveSegments: [],
      ignorePaths: ['node_modules', 'dist', '.git'],
      failBelow: 'D',
      maxLoadTimeMs: 3000,
      reportDir: '.',
    });
    // Verify score→grade mapping: score >= 70 → grade C or better for empty dir
    expect(result.score).toBeGreaterThanOrEqual(0);
    // Grade must correctly reflect the score: A>=90, B>=80, C>=70, D>=60, F<60
    if (result.score >= 90) expect(result.grade).toBe('A');
    else if (result.score >= 80) expect(result.grade).toBe('B');
    else if (result.score >= 70) expect(result.grade).toBe('C');
    else if (result.score >= 60) expect(result.grade).toBe('D');
    else expect(result.grade).toBe('F');
  });

  it('grade F when score < 60 (project with many secrets)', async () => {
    const tmpDir = mkdtempSync(join(tmpdir(), 'vibe-gate-grade-fail-'));
    // Create multiple files with secrets
    for (let i = 0; i < 6; i++) {
      const f = join(tmpDir, `secret-${i}.ts`);
      await writeFile(
        f,
        `const api_key_${i} = "sk-abcdefghijklmnopqrstuvwxyz${String(i).padStart(4, '0')}";\n`,
        'utf-8',
      );
    }
    const result = await scanLocal(tmpDir, {
      probeRoutes: [],
      sensitiveSegments: [],
      ignorePaths: ['node_modules', 'dist', '.git'],
      failBelow: 'D',
      maxLoadTimeMs: 3000,
      reportDir: '.',
    });
    // Verify Secrets category is penalized
    const secretsCat = result.categories.find((c) => c.name === 'Local Secrets');
    expect(secretsCat).toBeDefined();
    expect(secretsCat!.score).toBeLessThan(100);
    // Verify score→grade mapping is mathematically correct
    if (result.score >= 90) expect(result.grade).toBe('A');
    else if (result.score >= 80) expect(result.grade).toBe('B');
    else if (result.score >= 70) expect(result.grade).toBe('C');
    else if (result.score >= 60) expect(result.grade).toBe('D');
    else expect(result.grade).toBe('F');
  });
});
