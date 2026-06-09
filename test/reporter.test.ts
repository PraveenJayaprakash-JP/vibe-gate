import { generateHtmlReport } from '../src/reporter/html.js';
import { printTerminalReport } from '../src/reporter/index.js';
import type { ScanResult } from '../src/types.js';

// ---------------------------------------------------------------------------
// Fixture: a sample ScanResult
// ---------------------------------------------------------------------------

function makeSampleResult(overrides: Partial<ScanResult> = {}): ScanResult {
  return {
    grade: 'B',
    score: 87,
    summary: 'A few minor issues to review before shipping.',
    categories: [
      {
        name: 'Page Health',
        score: 90,
        weight: 15,
        status: 'pass',
        checks: [
          { name: 'Page loaded', status: 'pass', message: 'Loaded in 450ms' },
          { name: 'HTTP Status', status: 'pass', message: 'Status 200' },
          { name: 'Title', status: 'pass', message: 'Title: "Test App"' },
        ],
      },
      {
        name: 'Console Errors',
        score: 80,
        weight: 20,
        status: 'pass',
        checks: [
          {
            name: 'JS Errors',
            status: 'pass',
            message: '0 error(s), 2 warning(s)',
          },
        ],
      },
      {
        name: 'Security Headers',
        score: 75,
        weight: 25,
        status: 'warn',
        checks: [
          {
            name: 'content-security-policy',
            status: 'fail',
            message: 'Missing Content-Security-Policy header',
          },
          {
            name: 'strict-transport-security',
            status: 'pass',
            message: 'Strict-Transport-Security header present',
          },
          {
            name: 'x-frame-options',
            status: 'pass',
            message: 'X-Frame-Options header present',
          },
        ],
      },
      {
        name: 'Secrets Exposure',
        score: 100,
        weight: 20,
        status: 'pass',
        checks: [
          {
            name: 'Secrets Check',
            status: 'pass',
            message: 'No exposed secrets detected',
          },
        ],
      },
      {
        name: 'Auth Coverage',
        score: 90,
        weight: 20,
        status: 'pass',
        checks: [
          {
            name: 'Login Page',
            status: 'pass',
            message: 'Found at https://example.com/login',
          },
          {
            name: 'Routes Checked',
            status: 'info',
            message: '5 route(s) checked, 3 require auth',
          },
        ],
      },
    ],
    recommendations: [
      'Add missing security headers: content-security-policy.',
      'Fix console errors — they may indicate broken JavaScript or missing API endpoints.',
    ],
    ...overrides,
  };
}

function makeFailingResult(): ScanResult {
  return {
    grade: 'F',
    score: 35,
    summary: 'Critical issues found. Your app is not ready for production.',
    categories: [
      {
        name: 'Security Headers',
        score: 0,
        weight: 50,
        status: 'fail',
        checks: [
          {
            name: 'content-security-policy',
            status: 'fail',
            message: 'Missing Content-Security-Policy header',
          },
          {
            name: 'strict-transport-security',
            status: 'fail',
            message: 'Missing Strict-Transport-Security header',
          },
        ],
      },
      {
        name: 'Secrets Exposure',
        score: 0,
        weight: 50,
        status: 'fail',
        checks: [
          {
            name: 'API Key',
            status: 'fail',
            message: 'Found in https://example.com:42',
            details: 'sk-proj-abcdefghijklmnopqrstuvwxyz1234',
          },
        ],
      },
    ],
    recommendations: [
      'Add missing security headers: content-security-policy, strict-transport-security.',
      'Remove exposed secrets from source code.',
    ],
  };
}

// ---------------------------------------------------------------------------
// generateHtmlReport
// ---------------------------------------------------------------------------

describe('generateHtmlReport', () => {
  it('returns a string containing <!DOCTYPE html>', () => {
    const result = makeSampleResult();
    const html = generateHtmlReport(result, 'https://example.com');
    expect(html).toContain('<!DOCTYPE html>');
  });

  it('contains the grade letter in the output', () => {
    const result = makeSampleResult({ grade: 'B' });
    const html = generateHtmlReport(result, 'https://example.com');
    expect(html).toContain('B');
  });

  it('contains the URL in the output', () => {
    const result = makeSampleResult();
    const html = generateHtmlReport(result, 'https://myapp.example.com');
    expect(html).toContain('https://myapp.example.com');
  });

  it('contains category names', () => {
    const result = makeSampleResult();
    const html = generateHtmlReport(result, 'https://example.com');
    expect(html).toContain('Page Health');
    expect(html).toContain('Security Headers');
    expect(html).toContain('Auth Coverage');
  });

  it('contains recommendations when present', () => {
    const result = makeSampleResult();
    const html = generateHtmlReport(result, 'https://example.com');
    expect(html).toContain('content-security-policy');
  });

  it('handles grade F correctly', () => {
    const result = makeFailingResult();
    const html = generateHtmlReport(result, 'https://example.com');
    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('F');
    expect(html).toContain('35%');
  });

  it('escapes HTML special characters in the URL', () => {
    const result = makeSampleResult();
    const urlWithSpecial = 'https://example.com/path?a=1&b=<script>';
    const html = generateHtmlReport(result, urlWithSpecial);
    // The URL appears in the title attribute, should be escaped
    expect(html).toContain('&amp;');
    expect(html).toContain('&lt;script&gt;');
    expect(html).not.toContain('<script>');
  });
});

// ---------------------------------------------------------------------------
// printTerminalReport
// ---------------------------------------------------------------------------

describe('printTerminalReport', () => {
  it('does not throw for a valid ScanResult', () => {
    const result = makeSampleResult();
    expect(() => printTerminalReport(result)).not.toThrow();
  });

  it('does not throw for a failing result with many checks', () => {
    const result = makeFailingResult();
    expect(() => printTerminalReport(result)).not.toThrow();
  });

  it('does not throw when recommendations are empty', () => {
    const result = makeSampleResult({ recommendations: [] });
    expect(() => printTerminalReport(result)).not.toThrow();
  });

  it('outputs the grade text via console.log', () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const result = makeSampleResult({ grade: 'A', score: 95 });

    printTerminalReport(result);

    const output = logSpy.mock.calls.map((call) => call.join(' ')).join('\n');
    expect(output).toContain('VIBE GATE REPORT');
    expect(output).toContain('A');
    expect(output).toContain('95%');

    logSpy.mockRestore();
  });
});
