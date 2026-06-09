import { Command } from 'commander';
import chalk from 'chalk';
import { scanUrl } from './scanner/index.js';
import { scanLocal } from './scanner/localscan.js';
import { enhanceWithLlm } from './llm.js';
import { loadConfig, gradeToScore, type VibeGateConfig } from './config.js';
import { printTerminalReport } from './reporter/index.js';
import { generateHtmlReport } from './reporter/html.js';
import { submitScan } from './cloud.js';
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const pkg = { version: '0.1.0', description: 'Quality gate for AI-generated web apps' };

async function outputResult(
  result: Awaited<ReturnType<typeof scanUrl>>,
  target: string,
  options: { output?: string; verbose?: boolean },
) {
  switch (options.output) {
    case 'json':
      console.log(JSON.stringify(result, null, 2));
      break;
    case 'html': {
      const html = generateHtmlReport(result, target);
      const filename = `vibe-gate-report-${Date.now()}.html`;
      await writeFile(resolve(filename), html, 'utf-8');
      console.log(`\n  HTML report saved to: ${filename}`);
      break;
    }
    case 'terminal':
    default:
      printTerminalReport(result);
      break;
  }
}

function shouldFail(grade: string, threshold: string): boolean {
  const gradeNum = gradeToScore(grade);
  const thresholdNum = gradeToScore(threshold);
  return gradeNum < thresholdNum;
}

export async function run() {
  const program = new Command();

  program
    .name('vibe-gate')
    .version(pkg.version)
    .description(pkg.description)
    .option('--verbose', 'Show detailed output')
    .option('-o, --output <format>', 'Output format: terminal, html, json', 'terminal')
    .option('--threshold <grade>', 'Minimum grade to pass (default: D)', 'D')
    .option('--llm', 'Enhance results with AI explanations (requires API key)')
    .hook('preAction', async (cmd) => {
      (cmd as unknown as Record<string, unknown>).config = await loadConfig();
    });

  // `vibe-gate <url>` — scan a deployed web app
  program
    .command('url', { isDefault: true })
    .argument('<url>', 'URL of the web app to scan')
    .description('Scan a deployed web app')
    .action(async (url: string, options: Record<string, unknown>) => {
      const opts = program.opts();
      const config = (program as unknown as Record<string, unknown>).config as VibeGateConfig;
      const verbose = !!opts.verbose;
      const output = (opts.output as string) || 'terminal';
      const threshold = (opts.threshold as string) || 'D';

      let targetUrl: string;
      try {
        targetUrl = new URL(url.startsWith('http') ? url : `https://${url}`).href;
      } catch {
        console.error('Invalid URL. Provide a valid web app URL (e.g., https://myapp.vercel.app)');
        process.exit(1);
      }

      if (verbose) console.error(`\n  Scanning ${targetUrl}...`);

      try {
        let result = await scanUrl(targetUrl);

        // Optional LLM enhancement
        if (opts.llm) {
          const enhanced = await enhanceWithLlm(result, targetUrl, config);
          if (enhanced.plainEnglishSummary) {
            result = enhanced as typeof result;
            if (verbose) console.error('  AI analysis complete.');
          } else if (verbose) {
            console.error('  AI analysis skipped (no API key configured, set GEMINI_API_KEY or configure .vibegaterc)');
          }
        }

        await outputResult(result, targetUrl, { output, verbose });

        if (shouldFail(result.grade, threshold)) {
          process.exit(1);
        }
      } catch (err) {
        console.error(`\n  Scan failed: ${err instanceof Error ? err.message : String(err)}`);
        process.exit(1);
      }
    });

  // `vibe-gate scan .` — scan local codebase
  program
    .command('scan')
    .argument('[path]', 'Project directory to scan', '.')
    .description('Scan a local codebase for security issues, auth gaps, and test coverage')
    .action(async (path: string) => {
      const opts = program.opts();
      const config = (program as unknown as Record<string, unknown>).config as VibeGateConfig;
      const verbose = !!opts.verbose;
      const output = (opts.output as string) || 'terminal';
      const threshold = (opts.threshold as string) || 'D';
      const targetDir = resolve(path);

      if (verbose) console.error(`\n  Scanning local project at ${targetDir}...`);

      try {
        let result = await scanLocal(targetDir, config);

        // Optional LLM enhancement
        if (opts.llm) {
          const enhanced = await enhanceWithLlm(result, targetDir, config);
          if (enhanced.plainEnglishSummary) {
            result = enhanced as typeof result;
            if (verbose) console.error('  AI analysis complete.');
          } else if (verbose) {
            console.error('  AI analysis skipped (no API key configured)');
          }
        }

        await outputResult(result, targetDir, { output, verbose });

        if (shouldFail(result.grade, threshold)) {
          process.exit(1);
        }
      } catch (err) {
        console.error(`\n  Scan failed: ${err instanceof Error ? err.message : String(err)}`);
        process.exit(1);
      }
    });

  // `vibe-gate submit <url>` — scan + upload to cloud
  program
    .command('submit')
    .argument('<url>', 'URL of the web app to scan and submit')
    .option('-k, --api-key <key>', 'API key for authenticated submission')
    .description('Scan a URL and upload results to vibe-gate cloud dashboard')
    .action(async (url: string, options: { apiKey?: string }) => {
      const opts = program.opts();
      const verbose = !!opts.verbose;

      let targetUrl: string;
      try {
        targetUrl = new URL(url.startsWith('http') ? url : `https://${url}`).href;
      } catch {
        console.error('Invalid URL.');
        process.exit(1);
      }

      if (verbose) console.error(`\n  Scanning ${targetUrl}...`);

      try {
        const result = await scanUrl(targetUrl);
        printTerminalReport(result);
        console.log('\n  Uploading to vibe-gate cloud...');
        const submission = await submitScan(targetUrl, options.apiKey);
        if (submission.success && submission.shareUrl) {
          console.log(`  ✓ Report saved! View online: ${chalk.cyan(submission.shareUrl)}`);
        } else {
          console.log(`  ${submission.error || 'Upload failed — run without submit to see local report'}`);
        }
      } catch (err) {
        console.error(`\n  Failed: ${err instanceof Error ? err.message : String(err)}`);
        process.exit(1);
      }
    });

  // `vibe-gate watch <url>` — re-scan URL on interval
  program
    .command('watch')
    .argument('<url>', 'URL of the web app to monitor')
    .option('-i, --interval <seconds>', 'Seconds between scans (min 5)', '30')
    .description('Continuously re-scan a URL at a fixed interval')
    .action(async (url: string, options: { interval: string }) => {
      const opts = program.opts();
      const config = (program as unknown as Record<string, unknown>).config as VibeGateConfig;
      const verbose = !!opts.verbose;
      const intervalSec = Math.max(5, parseInt(options.interval, 10) || 30);

      let targetUrl: string;
      try {
        targetUrl = new URL(url.startsWith('http') ? url : `https://${url}`).href;
      } catch {
        console.error('Invalid URL. Provide a valid web app URL (e.g., https://myapp.vercel.app)');
        process.exit(1);
      }

      let previousGrade: string | null = null;
      let scanCount = 0;

      console.log(chalk.cyan(`\n  Watching ${targetUrl} (every ${intervalSec}s, Ctrl+C to stop)\n`));

      const runScan = async () => {
        scanCount++;
        const timestamp = new Date().toLocaleTimeString();
        process.stdout.write('\x1Bc'); // clear terminal

        console.log(chalk.cyan(`\n  Vibe Gate Watch — ${targetUrl}`));
        console.log(chalk.dim(`  Scan #${scanCount} at ${timestamp} (interval: ${intervalSec}s)\n`));

        try {
          let result = await scanUrl(targetUrl);

          if (opts.llm) {
            const enhanced = await enhanceWithLlm(result, targetUrl, config);
            if (enhanced.plainEnglishSummary) {
              result = enhanced as typeof result;
            }
          }

          // Trend indicator
          let trend = '';
          if (previousGrade !== null) {
            const prevScore = gradeToScore(previousGrade);
            const currScore = gradeToScore(result.grade);
            if (currScore > prevScore) trend = chalk.green(' ↑');
            else if (currScore < prevScore) trend = chalk.red(' ↓');
            else trend = chalk.dim(' →');
          }

          console.log(`  ${chalk.bold('Grade:')} ${gradeToScore(result.grade) >= 80 ? chalk.green(result.grade) : result.grade === 'C' ? chalk.yellow(result.grade) : chalk.red(result.grade)}${trend}  ${chalk.dim(`(${result.score}%)`)}`);
          console.log(`  ${chalk.dim(result.summary)}\n`);

          printTerminalReport(result);

          previousGrade = result.grade;
        } catch (err) {
          console.error(chalk.red(`\n  Scan #${scanCount} failed: ${err instanceof Error ? err.message : String(err)}`));
        }
      };

      await runScan();

      const timer = setInterval(runScan, intervalSec * 1000);

      const shutdown = () => {
        clearInterval(timer);
        console.log(chalk.dim('\n  Watch stopped.\n'));
        process.exit(0);
      };

      process.on('SIGINT', shutdown);
      process.on('SIGTERM', shutdown);
    });

  // `vibe-gate init` — create config file
  program
    .command('init')
    .description('Create a .vibegaterc.json config file')
    .action(async () => {
      const configPath = resolve('.vibegaterc.json');
      const sample = {
        probeRoutes: ['/api', '/health', '/admin', '/login', '/signup', '/dashboard'],
        sensitiveSegments: ['admin', 'dashboard', 'api', 'account', 'settings', 'profile', 'checkout', 'billing'],
        ignorePaths: ['node_modules', 'dist', 'build', '.git', '.next', 'coverage'],
        failBelow: 'D',
        maxLoadTimeMs: 3000,
      };
      await writeFile(configPath, JSON.stringify(sample, null, 2) + '\n', 'utf-8');
      console.log(`\n  Created ${configPath}`);
      console.log('  Edit it to configure routes, thresholds, and API keys.');
    });

  await program.parseAsync(process.argv);
}
