import { Command } from 'commander';
import { scanUrl } from './scanner/index.js';
import { scanLocal } from './scanner/localscan.js';
import { enhanceWithLlm } from './llm.js';
import { loadConfig, gradeToScore, type VibeGateConfig } from './config.js';
import { printTerminalReport } from './reporter/index.js';
import { generateHtmlReport } from './reporter/html.js';
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
