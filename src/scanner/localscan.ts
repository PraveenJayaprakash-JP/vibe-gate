import type { ScanResult, CategoryResult, CheckResult } from '../types.js';
import type { VibeGateConfig } from '../config.js';
import { readFile, readdir, stat } from 'node:fs/promises';
import { join, relative, extname, basename, dirname } from 'node:path';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Weight distribution across categories (must sum to 100). */
const CATEGORY_WEIGHTS = {
  secrets: 25,
  auth: 25,
  tests: 20,
  deps: 15,
  config: 15,
} as const;

/** File extensions scanned for secrets. */
const SECRET_SCAN_EXTS = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs',
  '.py', '.pyi',
  '.json', '.yaml', '.yml',
  '.env', '.env.local', '.env.development', '.env.production',
  '.config.js', '.config.ts', '.config.mjs',
]);

/** Binary file extensions to skip entirely. */
const BINARY_EXTS = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.bmp', '.ico', '.svg',
  '.woff', '.woff2', '.ttf', '.eot', '.otf',
  '.mp3', '.mp4', '.wav', '.ogg', '.webm', '.avi', '.mov',
  '.zip', '.gz', '.tar', '.bz2', '.7z', '.rar',
  '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
  '.exe', '.dll', '.so', '.dylib', '.bin',
  '.db', '.sqlite', '.sqlite3',
  '.map',
  '.lock',
]);

/** Auth library names to look for in dependencies. */
const AUTH_LIBRARIES = [
  'passport', 'next-auth', 'auth0', 'clerk',
  'supabase', 'iron-session', 'jsonwebtoken', 'lucia',
  'kinde', 'better-auth',
] as const;

/** Known insecure or abandoned dependency patterns. */
const SUSPECT_DEP_PATTERNS: { name: string; reason: string }[] = [
  { name: 'request', reason: 'deprecated — use node-fetch or built-in fetch' },
  { name: 'left-pad', reason: 'abandoned — vulnerable to unpublish attacks' },
  { name: 'event-stream', reason: 'historically compromised via malicious dependency' },
  { name: 'flatmap-stream', reason: 'malicious code injection incident (2018)' },
  { name: 'crypt', reason: 'unmaintained — use bcrypt or scrypt' },
];

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SecretMatch {
  type: string;
  value: string;
  file: string;
  line: number;
}

interface FileEntry {
  path: string;
  name: string;
  ext: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function assignGrade(score: number): string {
  if (score >= 90) return 'A';
  if (score >= 80) return 'B';
  if (score >= 70) return 'C';
  if (score >= 60) return 'D';
  return 'F';
}

function buildSummary(score: number, grade: string): string {
  if (grade === 'A') return 'Local scan passed — no critical issues found.';
  if (grade === 'B') return 'Local scan found a few minor issues to review.';
  if (grade === 'C') return 'Local scan found moderate issues — address warnings before deploying.';
  if (grade === 'D') return 'Local scan flagged significant issues. Fix failures before shipping.';
  return 'Local scan detected critical issues. Not ready for production.';
}

function categoryStatus(score: number): 'pass' | 'warn' | 'fail' {
  if (score >= 80) return 'pass';
  if (score >= 50) return 'warn';
  return 'fail';
}

/** Truncate a secret value for safe display. */
function truncateSecret(value: string): string {
  if (value.length <= 12) return value.slice(0, 4) + '...';
  return value.slice(0, 8) + '...' + value.slice(-4);
}

/** Check if a filename matches any ignore pattern. */
function isIgnored(filePath: string, ignorePaths: string[]): boolean {
  const segments = filePath.split(/[/\\]/);
  return ignorePaths.some((pattern) => {
    // Exact segment match
    if (segments.includes(pattern)) return true;
    // Glob-style prefix: pattern/*
    if (pattern.endsWith('*')) {
      const prefix = pattern.slice(0, -1);
      return segments.some((s) => s.startsWith(prefix));
    }
    // Glob-style: **/pattern
    if (pattern.startsWith('**/')) {
      const target = pattern.slice(3);
      return segments.includes(target);
    }
    return false;
  });
}

/** Check if a file path should be scanned for secrets based on extension. */
function shouldScanForSecrets(filePath: string): boolean {
  const ext = extname(filePath).toLowerCase();
  if (SECRET_SCAN_EXTS.has(ext)) return true;
  const base = basename(filePath).toLowerCase();
  // Handle .env* files without standard extensions
  if (base.startsWith('.env')) return true;
  // Handle config files
  if (base.includes('.config.')) return true;
  return false;
}

/** Check if a file path should be checked for binary content. */
function isBinaryFile(filePath: string): boolean {
  const ext = extname(filePath).toLowerCase();
  return BINARY_EXTS.has(ext);
}

// ---------------------------------------------------------------------------
// File system walk
// ---------------------------------------------------------------------------

/**
 * Recursively walk a directory, collecting all file paths (ignoring filtered dirs).
 */
async function walkDir(
  dir: string,
  cwd: string,
  ignorePaths: string[],
): Promise<FileEntry[]> {
  const results: FileEntry[] = [];
  let entries;

  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return results; // skip unreadable dirs
  }

  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    const relPath = relative(cwd, fullPath).replace(/\\/g, '/');

    if (isIgnored(relPath, ignorePaths)) continue;

    if (entry.isDirectory()) {
      const sub = await walkDir(fullPath, cwd, ignorePaths);
      results.push(...sub);
    } else if (entry.isFile()) {
      results.push({
        path: fullPath,
        name: entry.name,
        ext: extname(entry.name).toLowerCase(),
      });
    }
    // Skip symlinks, sockets, etc.
  }

  return results;
}

// ---------------------------------------------------------------------------
// (a) Secret Detection
// ---------------------------------------------------------------------------

const SECRET_PATTERNS: { type: string; pattern: RegExp; severity: 'fail' | 'warn' }[] = [
  {
    type: 'Generic API Key / Secret',
    pattern: /(?:api[_-]?key|apikey|secret|token)['"]?\s*[:=]\s*['"][A-Za-z0-9_\-]{16,}['"]/gi,
    severity: 'fail',
  },
  {
    type: 'AWS Access Key',
    pattern: /AKIA[0-9A-Z]{16}/g,
    severity: 'fail',
  },
  {
    type: 'OpenAI API Key',
    pattern: /sk-[a-zA-Z0-9]{20,}/g,
    severity: 'fail',
  },
  {
    type: 'JWT Token',
    pattern: /eyJ[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}/g,
    severity: 'warn',
  },
  {
    type: 'Private Key (PEM)',
    pattern: /-----BEGIN (?:RSA |EC )?PRIVATE KEY-----/g,
    severity: 'fail',
  },
];

async function scanSecrets(
  files: FileEntry[],
): Promise<{ checks: CheckResult[]; score: number; recommendations: string[]; secretsFound: SecretMatch[] }> {
  const allSecrets: SecretMatch[] = [];

  for (const file of files) {
    if (!shouldScanForSecrets(file.path) || isBinaryFile(file.path)) continue;

    let content: string;
    try {
      content = await readFile(file.path, 'utf-8');
    } catch {
      continue; // skip binary / unreadable
    }

    const lines = content.split('\n');
    const relPath = relative(process.cwd(), file.path).replace(/\\/g, '/');

    for (const rule of SECRET_PATTERNS) {
      // Reset regex lastIndex
      rule.pattern.lastIndex = 0;

      for (let i = 0; i < lines.length; i++) {
        rule.pattern.lastIndex = 0;
        let match: RegExpExecArray | null;
        while ((match = rule.pattern.exec(lines[i])) !== null) {
          // Skip matches inside comments (heuristic)
          const trimmed = lines[i].trim();
          if (
            trimmed.startsWith('//') ||
            trimmed.startsWith('#') ||
            trimmed.startsWith('/*') ||
            trimmed.startsWith('*') ||
            trimmed.startsWith('<!--')
          ) {
            continue;
          }

          allSecrets.push({
            type: rule.type,
            value: match[0],
            file: relPath,
            line: i + 1,
          });
        }
      }
    }
  }

  const checks: CheckResult[] = [];

  if (allSecrets.length === 0) {
    checks.push({
      name: 'Secret detection',
      status: 'pass',
      message: 'No exposed secrets found in source files.',
    });
  } else {
    const failSecrets = allSecrets.filter((s) => {
      const rule = SECRET_PATTERNS.find((r) => r.type === s.type);
      return rule?.severity === 'fail';
    });

    const detailParts = allSecrets.map(
      (s) => `${s.file}:${s.line} — [${s.type}] ${truncateSecret(s.value)}`,
    );

    checks.push({
      name: 'Secret detection',
      status: failSecrets.length > 0 ? 'fail' : 'warn',
      message: failSecrets.length > 0
        ? `Found ${failSecrets.length} hard secret(s) and ${allSecrets.length - failSecrets.length} potential secret(s) in source files.`
        : `Found ${allSecrets.length} potential secret(s) in source files.`,
      details: detailParts.slice(0, 15).join('\n') + (detailParts.length > 15 ? `\n... and ${detailParts.length - 15} more` : ''),
    });
  }

  const score = allSecrets.length === 0 ? 100 : allSecrets.length <= 2 ? 60 : allSecrets.length <= 5 ? 30 : 0;

  const recommendations: string[] = [];
  if (allSecrets.length > 0) {
    const types = [...new Set(allSecrets.map((s) => s.type))];
    recommendations.push(`Remove exposed secrets from source code (${types.join(', ')}). Use environment variables instead.`);
    recommendations.push('Add .env to .gitignore and rotate any exposed credentials immediately.');
  }

  return { checks, score, recommendations, secretsFound: allSecrets };
}

// ---------------------------------------------------------------------------
// (b) Auth Pattern Detection
// ---------------------------------------------------------------------------

interface AuthRouteFinding {
  file: string;
  line: number;
  pattern: string;
}

async function scanAuthPatterns(
  files: FileEntry[],
  cwd: string,
): Promise<{ checks: CheckResult[]; score: number; recommendations: string[] }> {
  const checks: CheckResult[] = [];
  const recommendations: string[] = [];

  // Check if auth libraries are in dependencies
  let hasAuthLibrary = false;
  let dependencyLines: string[] = [];

  const pkgFile = files.find((f) => basename(f.path) === 'package.json');
  if (pkgFile) {
    try {
      const pkgContent = await readFile(pkgFile.path, 'utf-8');
      const pkg = JSON.parse(pkgContent);
      const deps = { ...pkg.dependencies, ...pkg.devDependencies };

      const foundLibs: string[] = [];
      for (const lib of AUTH_LIBRARIES) {
        if (deps[lib]) foundLibs.push(lib);
      }
      hasAuthLibrary = foundLibs.length > 0;
      dependencyLines = Object.keys(deps);
    } catch {
      // invalid package.json
    }
  }

  // Scan source files for route definitions lacking auth
  const routeFiles = files.filter((f) => {
    const ext = f.ext;
    return ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.php', '.rb', '.py', '.go', '.rs'].includes(ext);
  });

  const ROUTE_PATTERNS: RegExp[] = [
    /router\.(get|post|put|delete|patch|all|use)\s*\(/gi,
    /app\.(get|post|put|delete|patch|all|use)\s*\(/gi,
    /Route::(get|post|put|delete|patch|any|match)\s*\(/gi,
    /@(Get|Post|Put|Delete|Patch)\s*\(/gi,
    /\.route\s*\(\s*['"][^'"]+['"]/gi,
    /@app\.route\s*\(/gi,
  ];

  const AUTH_INDICATORS: RegExp[] = [
    /auth/i,
    /isAuthenticated/i,
    /requireAuth/i,
    /withAuth/i,
    /authenticate/i,
    /isLoggedIn/i,
    /session/i,
    /guard/i,
    /protect/i,
  ];

  const unprotectedRoutes: AuthRouteFinding[] = [];

  for (const file of routeFiles) {
    if (isBinaryFile(file.path)) continue;

    let content: string;
    try {
      content = await readFile(file.path, 'utf-8');
    } catch {
      continue;
    }

    const relPath = relative(cwd, file.path).replace(/\\/g, '/');
    const lines = content.split('\n');

    // Check if file defines routes
    let hasRoutes = false;
    for (const pattern of ROUTE_PATTERNS) {
      pattern.lastIndex = 0;
      if (pattern.test(content)) {
        hasRoutes = true;
        break;
      }
    }

    if (!hasRoutes) continue;

    // Check if file has auth protection
    let hasAuth = false;
    for (const pattern of AUTH_INDICATORS) {
      pattern.lastIndex = 0;
      if (pattern.test(content)) {
        hasAuth = true;
        break;
      }
    }

    if (!hasAuth) {
      // Find the first route line for reporting
      let firstRouteLine = 0;
      for (let i = 0; i < lines.length; i++) {
        for (const pattern of ROUTE_PATTERNS) {
          pattern.lastIndex = 0;
          if (pattern.test(lines[i])) {
            firstRouteLine = i + 1;
            break;
          }
        }
        if (firstRouteLine > 0) break;
      }

      unprotectedRoutes.push({
        file: relPath,
        line: firstRouteLine,
        pattern: 'route without auth middleware',
      });
    }
  }

  // Build auth checks
  if (!hasAuthLibrary) {
    checks.push({
      name: 'Auth library in dependencies',
      status: 'warn',
      message: 'No recognized auth library found in package.json dependencies.',
      details: `Looked for: ${AUTH_LIBRARIES.join(', ')}. Add an auth library for proper user management.`,
    });
    recommendations.push('Install an auth library (passport, next-auth, clerk, lucia, etc.) for authentication.');
  } else {
    checks.push({
      name: 'Auth library in dependencies',
      status: 'pass',
      message: `Auth library detected in dependencies.`,
    });
  }

  if (unprotectedRoutes.length === 0 && routeFiles.length > 0) {
    checks.push({
      name: 'Route auth coverage',
      status: 'pass',
      message: 'All route files have auth protection or no routes were found.',
    });
  } else if (unprotectedRoutes.length > 0) {
    const detailParts = unprotectedRoutes.map(
      (r) => `${r.file}:${r.line} — ${r.pattern}`,
    );

    checks.push({
      name: 'Route auth coverage',
      status: unprotectedRoutes.length > 5 ? 'fail' : 'warn',
      message: `${unprotectedRoutes.length} route file(s) appear to lack auth protection.`,
      details: detailParts.slice(0, 10).join('\n') + (detailParts.length > 10 ? `\n... and ${detailParts.length - 10} more` : ''),
    });

    if (unprotectedRoutes.length > 0) {
      recommendations.push(
        `Add auth middleware to ${unprotectedRoutes.length} unprotected route(s). All API and page routes should verify authentication.`,
      );
    }
  }

  // Score auth category
  let score = 100;
  if (!hasAuthLibrary) score -= 30;
  if (unprotectedRoutes.length > 0) {
    score -= Math.min(unprotectedRoutes.length * 10, 60);
  }
  score = clamp(score, 0, 100);

  return { checks, score, recommendations };
}

// ---------------------------------------------------------------------------
// (c) Test Coverage Check
// ---------------------------------------------------------------------------

async function scanTestCoverage(
  files: FileEntry[],
  cwd: string,
): Promise<{ checks: CheckResult[]; score: number; recommendations: string[] }> {
  const checks: CheckResult[] = [];
  const recommendations: string[] = [];

  // Identify test files
  const testFiles = files.filter((f) => {
    const base = basename(f.path);
    const rel = relative(cwd, f.path).replace(/\\/g, '/');
    return (
      base.includes('.test.') ||
      base.includes('.spec.') ||
      rel.includes('__tests__/') ||
      rel.includes('/test/') ||
      rel.includes('/tests/')
    );
  });

  // Source files (non-test, non-config, non-declaration)
  const sourceFiles = files.filter((f) => {
    const ext = f.ext;
    const base = basename(f.path);
    return (
      ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.py', '.rb', '.php', '.go', '.rs', '.java', '.swift'].includes(ext) &&
      !base.includes('.test.') &&
      !base.includes('.spec.') &&
      !base.endsWith('.d.ts') &&
      !base.includes('.config.') &&
      !base.includes('.min.')
    );
  });

  const ratio = sourceFiles.length > 0 ? (testFiles.length / sourceFiles.length) * 100 : 0;

  checks.push({
    name: 'Test file count',
    status: testFiles.length === 0 ? 'fail' : testFiles.length < 5 ? 'warn' : 'pass',
    message: testFiles.length === 0
      ? 'No test files found in the project.'
      : `Found ${testFiles.length} test file(s) across ${sourceFiles.length} source file(s).`,
  });

  checks.push({
    name: 'Test-to-source ratio',
    status: ratio >= 30 ? 'pass' : ratio >= 10 ? 'warn' : 'fail',
    message: `Test-to-source ratio: ${ratio.toFixed(1)}% (${testFiles.length} tests / ${sourceFiles.length} sources).`,
    details: 'A healthy project typically has >30% test coverage by file count.',
  });

  // Check for test script in package.json
  const pkgFile = files.find((f) => basename(f.path) === 'package.json');
  let hasTestScript = false;
  if (pkgFile) {
    try {
      const pkgContent = await readFile(pkgFile.path, 'utf-8');
      const pkg = JSON.parse(pkgContent);
      hasTestScript = typeof pkg.scripts?.test === 'string' && pkg.scripts.test.length > 0;
    } catch {
      // invalid package.json
    }
  }

  checks.push({
    name: 'Test runner script',
    status: hasTestScript ? 'pass' : 'warn',
    message: hasTestScript
      ? 'package.json has a test script configured.'
      : 'No test script found in package.json. Add one for CI/test automation.',
  });

  // Score
  let score = 100;
  if (testFiles.length === 0) score = 0;
  else if (ratio < 10) score = 20;
  else if (ratio < 30) score = 50;
  else if (ratio < 50) score = 75;
  if (!hasTestScript) score -= 15;
  score = clamp(score, 0, 100);

  if (testFiles.length === 0) {
    recommendations.push('Add unit tests for critical functionality. Start with at least one test file.');
  }
  if (!hasTestScript) {
    recommendations.push('Add a "test" script to package.json for automated test execution.');
  }
  if (ratio < 30) {
    recommendations.push(`Increase test coverage. Current ratio is ${ratio.toFixed(1)}% — aim for >30%.`);
  }

  return { checks, score, recommendations };
}

// ---------------------------------------------------------------------------
// (d) Dependency Health
// ---------------------------------------------------------------------------

async function scanDependencyHealth(
  files: FileEntry[],
): Promise<{ checks: CheckResult[]; score: number; recommendations: string[] }> {
  const checks: CheckResult[] = [];
  const recommendations: string[] = [];

  const pkgFile = files.find((f) => basename(f.path) === 'package.json');
  if (!pkgFile) {
    checks.push({
      name: 'package.json',
      status: 'info' as const,
      message: 'No package.json found — skipping dependency checks.',
    });
    return { checks, score: 100, recommendations };
  }

  let pkg: Record<string, unknown> = {};
  try {
    const content = await readFile(pkgFile.path, 'utf-8');
    pkg = JSON.parse(content);
  } catch {
    checks.push({
      name: 'package.json parse',
      status: 'fail',
      message: 'Failed to parse package.json. File may be invalid JSON.',
    });
    return { checks, score: 50, recommendations: ['Fix invalid package.json.'] };
  }

  const deps = {
    ...(pkg.dependencies as Record<string, string> | undefined ?? {}),
    ...(pkg.devDependencies as Record<string, string> | undefined ?? {}),
  };
  const depCount = Object.keys(deps).length;

  // Check dependency count
  checks.push({
    name: 'Dependency count',
    status: depCount > 100 ? 'warn' : 'pass',
    message: depCount > 100
      ? `Large dependency count: ${depCount} packages. Consider auditing for unused dependencies.`
      : `${depCount} dependencies — within normal range.`,
  });

  // Check version pinning
  const unpinnedDeps: string[] = [];
  for (const [name, version] of Object.entries(deps)) {
    if (!version || version === '*' || version === 'latest' || version.startsWith('^')) {
      unpinnedDeps.push(name);
    }
  }

  checks.push({
    name: 'Version pinning',
    status: unpinnedDeps.length > 10 ? 'warn' : unpinnedDeps.length > 0 ? 'info' : 'pass',
    message: unpinnedDeps.length > 0
      ? `${unpinnedDeps.length} dependency/dependencies not pinned to exact versions (${unpinnedDeps.slice(0, 5).join(', ')}${unpinnedDeps.length > 5 ? '...' : ''}).`
      : 'All dependencies pinned to exact versions.',
    details: unpinnedDeps.length > 0
      ? 'Caret (^) or unpinned versions can introduce breaking changes on install. Use exact versions for critical dependencies.'
      : undefined,
  });

  // Check for suspect dependencies
  const suspectFound: { name: string; reason: string }[] = [];
  for (const suspect of SUSPECT_DEP_PATTERNS) {
    if (deps[suspect.name]) {
      suspectFound.push(suspect);
    }
  }

  if (suspectFound.length > 0) {
    checks.push({
      name: 'Known insecure packages',
      status: 'fail',
      message: `${suspectFound.length} known problematic package(s) detected.`,
      details: suspectFound.map((s) => `  - ${s.name}: ${s.reason}`).join('\n'),
    });
    recommendations.push(`Replace insecure packages: ${suspectFound.map((s) => s.name).join(', ')}.`);
  } else {
    checks.push({
      name: 'Known insecure packages',
      status: 'pass',
      message: 'No known insecure or abandoned packages detected.',
    });
  }

  // Check for lock file
  const hasLockFile = files.some((f) => {
    const base = basename(f.path);
    return base === 'package-lock.json' || base === 'yarn.lock' || base === 'pnpm-lock.yaml' || base === 'bun.lockb';
  });

  checks.push({
    name: 'Lock file',
    status: hasLockFile ? 'pass' : 'fail',
    message: hasLockFile
      ? 'Lock file present — reproducible installs ensured.'
      : 'No lock file found (package-lock.json, yarn.lock). Supply chain risk: installs may be non-deterministic.',
  });

  if (!hasLockFile) {
    recommendations.push('Commit a lock file (package-lock.json) to ensure reproducible dependency installs.');
  }

  // Score
  let score = 100;
  if (depCount > 100) score -= 15;
  if (unpinnedDeps.length > 10) score -= 20;
  else if (unpinnedDeps.length > 0) score -= 5;
  if (suspectFound.length > 0) score -= suspectFound.length * 15;
  if (!hasLockFile) score -= 25;
  score = clamp(score, 0, 100);

  return { checks, score, recommendations };
}

// ---------------------------------------------------------------------------
// (e) Config File Audit
// ---------------------------------------------------------------------------

async function scanConfiguration(
  files: FileEntry[],
  cwd: string,
): Promise<{ checks: CheckResult[]; score: number; recommendations: string[] }> {
  const checks: CheckResult[] = [];
  const recommendations: string[] = [];

  // Check for .env files committed
  const envFiles = files.filter((f) => {
    const base = basename(f.path).toLowerCase();
    return base === '.env' || base.startsWith('.env.');
  });

  // Check .gitignore for .env patterns
  const gitignoreFile = files.find((f) => basename(f.path) === '.gitignore');
  let envInGitignore = false;
  if (gitignoreFile) {
    try {
      const content = await readFile(gitignoreFile.path, 'utf-8');
      envInGitignore = /^\.env$/m.test(content) || content.includes('.env');
    } catch {
      // unreadable
    }
  }

  if (envFiles.length > 0) {
    const detailParts = envFiles.map((f) => `  - ${relative(cwd, f.path).replace(/\\/g, '/')}`);
    checks.push({
      name: 'Environment files',
      status: envInGitignore ? 'warn' : 'fail',
      message: envInGitignore
        ? `${envFiles.length} .env file(s) found but listed in .gitignore — verify they are not tracked by git.`
        : `${envFiles.length} .env file(s) found and NOT in .gitignore! Secrets may be committed.`,
      details: detailParts.join('\n'),
    });
    if (!envInGitignore) {
      recommendations.push('Add .env to .gitignore immediately. Environment files must never be committed.');
    }
    recommendations.push('Verify with `git ls-files` that no .env files are tracked in git history.');
  } else {
    checks.push({
      name: 'Environment files',
      status: 'pass',
      message: 'No .env files found in the project directory.',
    });
  }

  // Check for exposed environment variables in source
  const ENV_VAR_PATTERNS: RegExp[] = [
    /process\.env\.([A-Z_]+)/g,
    /import\.meta\.env\.([A-Z_]+)/g,
    /Deno\.env\.get\s*\(\s*['"]([A-Z_]+)['"]/g,
    /os\.getenv\s*\(\s*['"]([A-Z_]+)['"]/g,
    /getenv\s*\(\s*['"]([A-Z_]+)['"]/g,
  ];

  const codeFiles = files.filter((f) => {
    const ext = f.ext;
    return ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.py', '.rb', '.php'].includes(ext);
  });

  const envVarsUsed = new Map<string, string[]>(); // varName -> files
  for (const file of codeFiles) {
    if (isBinaryFile(file.path)) continue;
    let content: string;
    try {
      content = await readFile(file.path, 'utf-8');
    } catch {
      continue;
    }

    const relPath = relative(cwd, file.path).replace(/\\/g, '/');

    for (const pattern of ENV_VAR_PATTERNS) {
      pattern.lastIndex = 0;
      let match: RegExpExecArray | null;
      while ((match = pattern.exec(content)) !== null) {
        const varName = match[1];
        if (!envVarsUsed.has(varName)) {
          envVarsUsed.set(varName, []);
        }
        const fileList = envVarsUsed.get(varName)!;
        if (!fileList.includes(relPath)) {
          fileList.push(relPath);
        }
      }
    }
  }

  // Check for hardcoded env var fallback values (common anti-pattern)
  const envHardcodes: string[] = [];
  for (const file of codeFiles) {
    if (isBinaryFile(file.path)) continue;
    let content: string;
    try {
      content = await readFile(file.path, 'utf-8');
    } catch {
      continue;
    }

    const relPath = relative(cwd, file.path).replace(/\\/g, '/');

    // Check for process.env.X || 'hardcoded'
    const hardcodeMatches = content.matchAll(/process\.env\.([A-Z_]+)\s*\|\|\s*['"]([^'"]+)['"]/g);
    for (const m of hardcodeMatches) {
      envHardcodes.push(`${relPath} — fallback "${m[2]}" for ${m[1]}`);
    }
  }

  checks.push({
    name: 'Environment variable usage',
    status: envVarsUsed.size === 0 ? 'info' : 'pass',
    message: envVarsUsed.size === 0
      ? 'No environment variable references found in source code.'
      : `${envVarsUsed.size} unique environment variable(s) referenced across ${[...new Set([...envVarsUsed.values()].flat())].length} file(s).`,
  });

  if (envHardcodes.length > 0) {
    checks.push({
      name: 'Hardcoded env fallbacks',
      status: 'warn',
      message: `${envHardcodes.length} hardcoded fallback value(s) detected for environment variables.`,
      details: envHardcodes.slice(0, 10).map((h) => `  - ${h}`).join('\n') + (envHardcodes.length > 10 ? `\n  ... and ${envHardcodes.length - 10} more` : ''),
    });
  }

  // Check CI config existence
  const ciFiles = files.filter((f) => {
    const rel = relative(cwd, f.path).replace(/\\/g, '/');
    return (
      rel.startsWith('.github/workflows/') ||
      rel === '.gitlab-ci.yml' ||
      rel === 'Jenkinsfile' ||
      rel.startsWith('.circleci/') ||
      rel === 'bitbucket-pipelines.yml' ||
      rel === '.travis.yml' ||
      rel === 'azure-pipelines.yml' ||
      basename(f.path) === 'ci.yml' ||
      basename(f.path) === 'ci.yaml'
    );
  });

  checks.push({
    name: 'CI/CD pipeline',
    status: ciFiles.length > 0 ? 'pass' : 'warn',
    message: ciFiles.length > 0
      ? `CI pipeline configured (${ciFiles.map((f) => basename(f.path)).join(', ')}).`
      : 'No CI/CD pipeline configuration detected. Automated testing and builds not enforced.',
  });

  if (ciFiles.length === 0) {
    recommendations.push('Set up CI/CD pipeline (GitHub Actions, GitLab CI, etc.) to enforce automated testing on every push.');
  }

  // Score
  let score = 100;
  if (envFiles.length > 0 && !envInGitignore) score -= 30;
  else if (envFiles.length > 0) score -= 10;
  if (envHardcodes.length > 0) score -= Math.min(envHardcodes.length * 5, 20);
  if (ciFiles.length === 0) score -= 20;
  score = clamp(score, 0, 100);

  return { checks, score, recommendations };
}

// ---------------------------------------------------------------------------
// Main export: scanLocal
// ---------------------------------------------------------------------------

/**
 * Scan a local codebase directory for security, auth, test, dependency, and
 * configuration issues. Never throws — all failures are reflected in the
 * returned `ScanResult`.
 */
export async function scanLocal(
  cwd: string,
  config: VibeGateConfig,
): Promise<ScanResult> {
  const ignorePaths = config.ignorePaths ?? [
    'node_modules', 'dist', 'build', '.git', '.next', 'coverage',
  ];

  // Step 1: Walk the filesystem
  const files = await walkDir(cwd, cwd, ignorePaths);

  // Step 2: Run all scans in parallel
  const [secretsResult, authResult, testResult, depsResult, configResult] =
    await Promise.all([
      scanSecrets(files),
      scanAuthPatterns(files, cwd),
      scanTestCoverage(files, cwd),
      scanDependencyHealth(files),
      scanConfiguration(files, cwd),
    ]);

  // Step 3: Build categories
  const categories: CategoryResult[] = [
    {
      name: 'Local Secrets',
      score: secretsResult.score,
      weight: CATEGORY_WEIGHTS.secrets,
      status: categoryStatus(secretsResult.score),
      checks: secretsResult.checks,
    },
    {
      name: 'Auth Patterns',
      score: authResult.score,
      weight: CATEGORY_WEIGHTS.auth,
      status: categoryStatus(authResult.score),
      checks: authResult.checks,
    },
    {
      name: 'Test Coverage',
      score: testResult.score,
      weight: CATEGORY_WEIGHTS.tests,
      status: categoryStatus(testResult.score),
      checks: testResult.checks,
    },
    {
      name: 'Dependency Health',
      score: depsResult.score,
      weight: CATEGORY_WEIGHTS.deps,
      status: categoryStatus(depsResult.score),
      checks: depsResult.checks,
    },
    {
      name: 'Configuration',
      score: configResult.score,
      weight: CATEGORY_WEIGHTS.config,
      status: categoryStatus(configResult.score),
      checks: configResult.checks,
    },
  ];

  // Step 4: Compute weighted overall score
  const totalWeight = categories.reduce((sum, c) => sum + c.weight, 0);
  const overallScore = totalWeight > 0
    ? Math.round(
        categories.reduce((sum, c) => sum + c.score * c.weight, 0) / totalWeight,
      )
    : 0;

  const grade = assignGrade(overallScore);

  // Step 5: Aggregate recommendations (deduplicated)
  const allRecommendations = [
    ...secretsResult.recommendations,
    ...authResult.recommendations,
    ...testResult.recommendations,
    ...depsResult.recommendations,
    ...configResult.recommendations,
  ];

  const uniqueRecommendations = [...new Set(allRecommendations)];

  // Step 6: Build summary
  const summary = buildSummary(overallScore, grade);

  return {
    grade,
    score: overallScore,
    summary,
    categories,
    recommendations: uniqueRecommendations,
  };
}
