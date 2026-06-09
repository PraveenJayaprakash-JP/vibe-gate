import chalk from 'chalk';
import type { ScanResult, CategoryResult, CheckResult } from '../types.ts';

function gradeColor(grade: string): (s: string) => string {
  switch (grade) {
    case 'A':
    case 'B':
      return chalk.green;
    case 'C':
      return chalk.yellow;
    case 'D':
      return chalk.red;
    case 'F':
      return chalk.red.bold;
    default:
      return chalk.white;
  }
}

function statusIcon(status: string): string {
  switch (status) {
    case 'pass':
      return chalk.green('✓ PASS');
    case 'warn':
      return chalk.yellow('⚠ WARN');
    case 'fail':
      return chalk.red('✗ FAIL');
    case 'info':
      return chalk.blue('ℹ INFO');
    default:
      return status;
  }
}

function indent(text: string, level: number): string {
  const pad = '  '.repeat(level);
  return pad + text.split('\n').join('\n' + pad);
}

export function printTerminalReport(result: ScanResult): void {
  const width = 60;

  // ── Header ──
  console.log('');
  console.log(chalk.bold.cyan('╔' + '═'.repeat(width - 2) + '╗'));
  console.log(chalk.bold.cyan('║') + chalk.bold.white('  VIBE GATE REPORT'.padEnd(width - 2)) + chalk.bold.cyan('║'));
  console.log(chalk.bold.cyan('╚' + '═'.repeat(width - 2) + '╝'));
  console.log('');

  // ── Grade ──
  const gradeFn = gradeColor(result.grade);
  console.log('  ' + chalk.dim('Grade: ') + gradeFn(result.grade));
  console.log('');

  // ── Score ──
  const scoreColor = result.score >= 80
    ? chalk.green
    : result.score >= 60
      ? chalk.yellow
      : chalk.red;
  console.log(`  ${chalk.dim('Score:')} ${scoreColor(`${result.score}%`)}`);
  console.log('');

  // ── Summary ──
  console.log('  ' + chalk.dim(result.summary));
  console.log('');

  // ── Categories ──
  const catWidth = width - 8;
  console.log('  ' + chalk.bold.underline('CATEGORIES'));
  console.log('');

  for (const cat of result.categories) {
    const icon = statusIcon(cat.status);
    const header = `${icon}  ${chalk.bold(cat.name)}  ${chalk.dim(`(${cat.score}% · weight ${cat.weight}%)`)}`;
    console.log(indent(header, 1));
    console.log('');

    for (const check of cat.checks) {
      const checkIcon = statusIcon(check.status);
      console.log(indent(`${checkIcon} ${check.message}`, 2));
      if (check.details) {
        console.log(indent(chalk.dim(`   ${check.details}`), 2));
      }
    }
    console.log('');
  }

  // ── Recommendations ──
  if (result.recommendations.length > 0) {
    console.log('  ' + chalk.bold.underline('RECOMMENDATIONS'));
    console.log('');
    for (const rec of result.recommendations) {
      console.log(`  ${chalk.cyan('•')} ${rec}`);
    }
    console.log('');
  }

  // ── Footer ──
  console.log(chalk.dim('─'.repeat(width)));
  console.log(chalk.dim('  Run with --verbose for detailed check output'));
  console.log(chalk.dim('  Run with --output html to save an HTML report'));
  console.log('');
}
