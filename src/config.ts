import { readFile, access } from 'node:fs/promises';
import { resolve } from 'node:path';

export interface VibeGateConfig {
  /** Routes to probe during URL scan. */
  probeRoutes?: string[];
  /** Auth-sensitive path segments. */
  sensitiveSegments?: string[];
  /** Paths/patterns to ignore in local scans. */
  ignorePaths?: string[];
  /** Grade threshold to exit 1 (default: 'D'). */
  failBelow?: 'A' | 'B' | 'C' | 'D' | 'F';
  /** Max page load time in ms before warning (default: 3000). */
  maxLoadTimeMs?: number;
  /** HTML report output dir (default: cwd). */
  reportDir?: string;
  /** LLM provider for enhanced analysis (optional). */
  llm?: {
    provider: 'openai' | 'anthropic' | 'google';
    apiKey: string;
    model?: string;
  };
  /** Auth testing credentials (P3). */
  auth?: {
    url: string;
    usernameField?: string;
    passwordField?: string;
    username?: string;
    password?: string;
  };
}

const DEFAULTS: VibeGateConfig = {
  probeRoutes: ['/api', '/health', '/admin', '/login', '/signup', '/dashboard', '/.env', '/config', '/swagger', '/graphql'],
  sensitiveSegments: ['admin', 'dashboard', 'api', 'account', 'settings', 'profile', 'checkout', 'billing'],
  ignorePaths: ['node_modules', 'dist', 'build', '.git', '.next', 'coverage'],
  failBelow: 'D',
  maxLoadTimeMs: 3000,
  reportDir: '.',
};

const CONFIG_FILES = [
  '.vibegaterc.json',
  'vibe-gate.config.json',
  '.vibegaterc',
];

async function findConfigFile(dir: string): Promise<string | null> {
  for (const name of CONFIG_FILES) {
    const path = resolve(dir, name);
    try {
      await access(path);
      return path;
    } catch {
      continue;
    }
  }
  // Check package.json for vibe-gate config
  try {
    const pkgPath = resolve(dir, 'package.json');
    const pkg = JSON.parse(await readFile(pkgPath, 'utf-8'));
    if (pkg['vibe-gate']) return pkgPath;
  } catch {
    // no package.json
  }
  return null;
}

export async function loadConfig(cwd?: string): Promise<VibeGateConfig> {
  const dir = cwd || process.cwd();
  const configPath = await findConfigFile(dir);
  if (!configPath) return DEFAULTS;

  try {
    const raw = await readFile(configPath, 'utf-8');
    let userConfig: Partial<VibeGateConfig>;
    if (configPath.endsWith('package.json')) {
      userConfig = JSON.parse(raw)['vibe-gate'] || {};
    } else {
      userConfig = JSON.parse(raw);
    }
    return { ...DEFAULTS, ...userConfig };
  } catch {
    return DEFAULTS;
  }
}

export function gradeToScore(grade: string): number {
  const map: Record<string, number> = { A: 90, B: 80, C: 70, D: 60, F: 0 };
  return map[grade] ?? 60;
}
