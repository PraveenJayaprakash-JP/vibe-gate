export interface ScanResult {
  grade: string;
  score: number;
  summary: string;
  categories: CategoryResult[];
  recommendations: string[];
}

export interface CategoryResult {
  name: string;
  score: number;
  weight: number;
  status: 'pass' | 'warn' | 'fail';
  checks: CheckResult[];
}

export interface CheckResult {
  name: string;
  status: 'pass' | 'warn' | 'fail' | 'info';
  message: string;
  details?: string;
}

export interface ScanOptions {
  url: string;
  verbose?: boolean;
  output?: 'terminal' | 'html' | 'json';
}

export interface SecurityHeaders {
  'content-security-policy'?: string;
  'strict-transport-security'?: string;
  'x-frame-options'?: string;
  'x-content-type-options'?: string;
  'x-xss-protection'?: string;
  'referrer-policy'?: string;
  'permissions-policy'?: string;
}

export interface RouteCheck {
  path: string;
  status: number;
  requiresAuth: boolean;
  hasAuth: boolean;
}

export interface ConsoleIssue {
  type: 'error' | 'warn' | 'info';
  message: string;
  source?: string;
}

export interface SecretFinding {
  type: string;
  value: string;
  location: string;
  line?: number;
}
