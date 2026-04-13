'use strict';

// ─── Kill Command — Full Lab Destruction ─────────────────────────────────────
// "Nuclear reset" — wipes the Splunk lab index and all local cached artifacts.
// Preserves user identity (name, GitHub token, Splunk connection config).
//
// What gets destroyed:
//   - Splunk index (hex_lab) — ALL ingested case log data
//   - Local sessions (~/.hex/sessions/)
//   - Local scores (~/.hex/scores.json)
//   - Local submissions (~/.hex/submissions/)
//
// What is preserved:
//   - config.json (Splunk connection settings)
//   - user.json (user identity)
//   - github-token.json (GitHub auth)

const chalk    = require('chalk');
const ora      = require('ora');
const inquirer = require('inquirer');
const fse      = require('fs-extra');
const path     = require('path');
const os       = require('os');

const config   = require('../../core/config');
const registry = require('../../cases/registry');
const display  = require('../../core/display');
const splunk   = require('../../splunk/client');
const detector = require('../../splunk/detector');
const store    = require('../../storage/store');
const paths    = require('../../storage/paths');

// ─── Splunk CLI helpers ──────────────────────────────────────────────────────

let _splunkBinary = null;

function detectSplunk() {
  const result = detector.autoDetect();
  if (result) return result.binary;
  return null;
}

async function execSplunk(args, cwd) {
  const { execSync } = require('child_process');
  const cmd = `"${_splunkBinary}" ${args}`;
  return execSync(cmd, {
    cwd,
    stdio: ['pipe', 'pipe', 'pipe'],
    timeout: 30000,
    env: { ...process.env },
  }).toString().trim();
}

// ─── Destruction steps ───────────────────────────────────────────────────────

async function destroySplunkIndex(cfg) {
  const indexName = cfg.splunk.index || 'hex_lab';
  const axios = require('axios');
  const https = require('https');
  const agent = new https.Agent({ rejectUnauthorized: false });
  const baseURL = config.splunkUrl();

  // Try REST API first — login to get session key
  try {
    const sessionKey = await splunk.login();
    if (!sessionKey) {
      return { method: 'rest', result: 'auth_failed', deleted: false, error: 'Could not authenticate with Splunk' };
    }

    // Check if index exists
    const existsRes = await axios.get(`${baseURL}/services/data/indexes/${indexName}`, {
      headers: { 'Authorization': `Splunk ${sessionKey}` },
      httpsAgent: agent,
      timeout: 10000,
    });
    if (existsRes.status !== 200) {
      return { method: 'rest', result: 'index_not_found', deleted: false };
    }

    // Disable index first (required before deletion)
    await axios.post(`${baseURL}/services/data/indexes/${indexName}/disable`, '', {
      headers: { 'Authorization': `Splunk ${sessionKey}` },
      httpsAgent: agent,
      timeout: 15000,
    }).catch(() => {}); // May already be disabled

    // Delete index
    await axios.delete(`${baseURL}/services/data/indexes/${indexName}`, {
      headers: { 'Authorization': `Splunk ${sessionKey}` },
      httpsAgent: agent,
      timeout: 15000,
    });

    // Verify deletion
    const stillExists = await splunk.indexExists(indexName);
    if (!stillExists) {
      return { method: 'rest', result: 'deleted', deleted: true };
    }

    return { method: 'rest', result: 'partial', deleted: false, error: 'Index still exists after deletion attempt' };
  } catch (err) {
    // REST API failed
    if (process.env.HEX_DEBUG) {
      console.error('  [DEBUG] REST index deletion failed:', err.message);
    }
  }

  // Fallback: Splunk CLI
  if (!_splunkBinary) {
    return { method: 'rest', result: 'failed_no_cli', deleted: false, error: 'REST API failed and no Splunk CLI found' };
  }

  try {
    const splunkHome = path.dirname(path.dirname(_splunkBinary));
    const auth = `${cfg.splunk.username}:${cfg.splunk.password}`;

    // Disable then delete via CLI
    await execSplunk(`disable index ${indexName} -auth "${auth}" --accept-license`, splunkHome).catch(() => {});
    await execSplunk(`remove index ${indexName} -auth "${auth}" --accept-license`, splunkHome);

    return { method: 'cli', result: 'deleted', deleted: true };
  } catch (err) {
    return { method: 'cli', result: 'failed', deleted: false, error: err.message };
  }
}

function destroyLocalData() {
  const results = [];

  // Sessions
  const sessionsDir = paths.sessionsDir();
  if (fse.existsSync(sessionsDir)) {
    const count = fse.readdirSync(sessionsDir).filter(f => f.endsWith('.json')).length;
    fse.removeSync(sessionsDir);
    fse.ensureDirSync(sessionsDir);
    results.push({ item: 'sessions', count, destroyed: true });
  } else {
    results.push({ item: 'sessions', count: 0, destroyed: false });
  }

  // Scores
  const scoresPath = paths.scoresPath();
  if (fse.existsSync(scoresPath)) {
    const scores = fse.readJsonSync(scoresPath);
    const count = Object.keys(scores).length;
    fse.writeJsonSync(scoresPath, {}, { spaces: 2 });
    results.push({ item: 'scores', count, destroyed: true });
  } else {
    results.push({ item: 'scores', count: 0, destroyed: false });
  }

  // Submissions
  const submissionsDir = paths.submissionsDir();
  if (fse.existsSync(submissionsDir)) {
    let count = 0;
    try {
      const userDirs = fse.readdirSync(submissionsDir);
      for (const u of userDirs) {
        const files = fse.readdirSync(path.join(submissionsDir, u));
        count += files.length;
      }
    } catch (_) {}
    fse.removeSync(submissionsDir);
    fse.ensureDirSync(submissionsDir);
    results.push({ item: 'submissions', count, destroyed: true });
  } else {
    results.push({ item: 'submissions', count: 0, destroyed: false });
  }

  return results;
}

// ─── Confirmation flow ───────────────────────────────────────────────────────

async function confirmDestruction() {
  console.log();
  console.log(chalk.red.bold('  ╔═══════════════════════════════════════════════════════════╗'));
  console.log(chalk.red.bold('  ║') + chalk.red.bold('         ⚠  D E S T R U C T I O N   Z O N E  ⚠          ') + chalk.red.bold('║'));
  console.log(chalk.red.bold('  ╚═══════════════════════════════════════════════════════════╝'));
  console.log();
  console.log(chalk.red.bold('  This command will PERMANENTLY destroy the following:'));
  console.log();

  const cfg = config.load();
  const indexName = cfg.splunk.index || 'hex_lab';
  const scores = store.getScores();
  const scoreCount = Object.keys(scores).length;

  let sessionCount = 0;
  try {
    const sessionFiles = fse.readdirSync(paths.sessionsDir()).filter(f => f.endsWith('.json'));
    sessionCount = sessionFiles.length;
  } catch (_) {}

  let submissionCount = 0;
  try {
    const subDirs = fse.readdirSync(paths.submissionsDir());
    for (const u of subDirs) {
      const files = fse.readdirSync(path.join(paths.submissionsDir(), u));
      submissionCount += files.length;
    }
  } catch (_) {}

  console.log(chalk.red(`    ✗ Splunk index : "${indexName}" — ALL ingested lab data`));
  console.log(chalk.red(`    ✗ Sessions     : ${sessionCount} active investigation(s)`));
  console.log(chalk.red(`    ✗ Scores       : ${scoreCount} case score(s)`));
  console.log(chalk.red(`    ✗ Submissions  : ${submissionCount} local submission(s)`));
  console.log();
  console.log(chalk.yellow('  This action is IRREVERSIBLE. There is no undo.'));
  console.log(chalk.gray('  Your identity, config, and GitHub token will be preserved.'));
  console.log();

  // Layer 1: Acknowledge understanding
  const { acknowledge } = await inquirer.prompt([{
    type: 'confirm',
    name: 'acknowledge',
    message: chalk.red.bold('I understand this will permanently destroy all lab data'),
    default: false,
  }]);
  if (!acknowledge) return false;

  // Layer 2: Type the confirmation word
  console.log();
  const { confirmWord } = await inquirer.prompt([{
    type: 'input',
    name: 'confirmWord',
    message: chalk.red.bold('Type KILL to confirm (case-sensitive):'),
  }]);
  if (confirmWord !== 'KILL') {
    console.log(chalk.gray('\n  Confirmation cancelled. You typed: "' + confirmWord + '"\n'));
    return false;
  }

  return true;
}

// ─── Main command ────────────────────────────────────────────────────────────

async function run(caseId, opts) {
  const cfg = config.load();
  if (!cfg.initialized) {
    display.error('HEX is not initialized.', 'Run: hex init');
    return;
  }

  // If --force flag is set, skip confirmations
  const forceMode = opts && (opts.force || opts.f);

  // Handle --splunk-path if provided
  if (opts && opts.splunkPath) {
    const result = detector.validatePath(opts.splunkPath);
    if (result) {
      _splunkBinary = result.binary;
    } else {
      console.log(chalk.yellow(`  Invalid Splunk path provided: ${opts.splunkPath}`));
      console.log(chalk.gray('  Will attempt auto-detection and REST API fallback.\n'));
    }
  }

  if (!forceMode) {
    const confirmed = await confirmDestruction();
    if (!confirmed) {
      console.log(chalk.gray('  Destruction aborted.\n'));
      return;
    }
  } else {
    console.log(chalk.yellow('  ⚠ FORCE mode: Skipping confirmations.\n'));
  }

  // ── Phase 1: Locate Splunk ────────────────────────────────────────────────
  console.log();
  console.log(chalk.cyan.bold('  ── Phase 1: Locating Splunk ─────────────────────────'));
  console.log();

  if (!_splunkBinary) {
    _splunkBinary = detectSplunk();
  }

  if (!_splunkBinary && !forceMode) {
    console.log(chalk.yellow('  Splunk binary not found in default locations.'));
    console.log(chalk.gray('  This is optional — the Splunk index can be deleted via REST API.'));
    console.log();

    const { providePath } = await inquirer.prompt([{
      type: 'confirm',
      name: 'providePath',
      message: 'Provide the path to your Splunk binary?',
      default: false,
    }]);

    if (providePath) {
      const { splunkPath } = await inquirer.prompt([{
        type: 'input',
        name: 'splunkPath',
        message: 'Splunk binary path:',
      }]);

      const result = detector.validatePath(splunkPath);
      if (result) {
        _splunkBinary = result.binary;
        console.log(chalk.green(`  Found Splunk: ${_splunkBinary}\n`));
      } else {
        console.log(chalk.yellow('  Invalid path. Will attempt REST API deletion only.\n'));
      }
    }
  } else if (_splunkBinary) {
    console.log(chalk.green(`  Found Splunk: ${_splunkBinary}`));
    const version = detector.getVersion(_splunkBinary);
    console.log(chalk.gray(`  Version: ${version}\n`));
  } else {
    console.log(chalk.yellow('  Splunk binary not found. Using REST API only.\n'));
  }

  // ── Phase 2: Destroy Splunk Index ─────────────────────────────────────────
  console.log(chalk.cyan.bold('  ── Phase 2: Destroying Splunk Index ──────────────────'));
  console.log();

  const spinner = ora({ text: `Deleting index "${cfg.splunk.index || 'hex_lab'}"...`, color: 'red' }).start();

  try {
    const result = await destroySplunkIndex(cfg);

    if (result.deleted) {
      spinner.succeed(`Splunk index "${cfg.splunk.index || 'hex_lab'}" destroyed (${result.method})`);
    } else if (result.result === 'index_not_found') {
      spinner.info(`Splunk index "${cfg.splunk.index || 'hex_lab'}" does not exist`);
    } else {
      spinner.fail(`Splunk index deletion failed (${result.method}): ${result.error || 'unknown'}`);
      console.log(chalk.yellow('  You may need to delete the index manually via Splunk Web or CLI.'));
    }
  } catch (err) {
    spinner.fail(`Splunk index destruction error: ${err.message}`);
  }

  // ── Phase 3: Destroy Local Data ───────────────────────────────────────────
  console.log();
  console.log(chalk.cyan.bold('  ── Phase 3: Destroying Local Data ────────────────────'));
  console.log();

  const localResults = destroyLocalData();

  for (const r of localResults) {
    if (r.count > 0) {
      console.log(chalk.red(`    ✗ ${r.item.padEnd(15)} ${r.count} file(s) destroyed`));
    } else {
      console.log(chalk.gray(`    - ${r.item.padEnd(15)} (nothing to destroy)`));
    }
  }

  // ── Summary ───────────────────────────────────────────────────────────────
  console.log();
  console.log(chalk.red.bold('  ╔═══════════════════════════════════════════════════════════╗'));
  console.log(chalk.red.bold('  ║') + chalk.red('              L A B   D E S T R O Y E D                 ') + chalk.red.bold('║'));
  console.log(chalk.red.bold('  ╚═══════════════════════════════════════════════════════════╝'));
  console.log();
  console.log(chalk.gray('  All lab data has been permanently destroyed.'));
  console.log(chalk.gray('  Your identity and configuration have been preserved.'));
  console.log();
  console.log(chalk.gray('  To start fresh, re-ingest case data:'));
  console.log(chalk.cyan('    hex init') + chalk.gray('   — verify your Splunk connection'));
  console.log(chalk.cyan('    hex start case1') + chalk.gray('  — begin a new investigation'));
  console.log();
}

module.exports = { run };
