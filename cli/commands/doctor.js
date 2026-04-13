'use strict';

const chalk    = require('chalk');
const ora      = require('ora');
const display  = require('../../core/display');
const config   = require('../../core/config');
const splunk   = require('../../splunk/client');
const detector = require('../../splunk/detector');

async function run() {
  display.banner();
  console.log(chalk.bold.white('  SYSTEM DIAGNOSTICS\n'));

  const cfg = config.load();
  const checks = [];

  // ─── 1. Config file ────────────────────────────────────────────────────────
  const initialized = cfg.initialized === true;
  checks.push({
    label: 'HEX configuration',
    pass:  initialized,
    info:  initialized ? '~/.hex/config.json' : 'Run: hex init',
  });

  // ─── 2. Splunk binary ─────────────────────────────────────────────────────
  let splunkBin = cfg.splunkBin;
  if (!splunkBin) {
    const found = detector.autoDetect();
    splunkBin   = found?.binary;
  }
  const binExists = splunkBin && require('fs').existsSync(splunkBin);
  checks.push({
    label: 'Splunk binary',
    pass:  binExists,
    info:  binExists ? splunkBin : 'Splunk not found — check installation',
  });

  // ─── 3. Splunk process ────────────────────────────────────────────────────
  const running = detector.isRunning();
  checks.push({
    label: 'Splunk process running',
    pass:  running,
    info:  running ? 'splunkd is active' : `Start with: ${splunkBin || 'splunk'} start`,
  });

  // ─── 4. API reachable ─────────────────────────────────────────────────────
  let apiReachable = false;
  let authOk       = false;
  let indexExists  = false;
  let eventCount   = 0;

  if (running) {
    const spinner = ora({ text: 'Checking Splunk API...', color: 'cyan' }).start();
    try {
      apiReachable = await splunk.ping();
      spinner.stop();
    } catch (_) {
      spinner.stop();
    }

    if (apiReachable) {
      try {
        authOk = await splunk.authenticate();
      } catch (_) {}
    }

    if (authOk) {
      try {
        indexExists = await splunk.indexExists(cfg.splunk.index);
      } catch (_) {}

      if (indexExists) {
        try {
          eventCount = await splunk.countEvents(cfg.splunk.index, 'hex_');
        } catch (_) {}
      }
    }
  }

  checks.push({
    label: `Splunk API (${cfg.splunk.scheme}://${cfg.splunk.host}:${cfg.splunk.port})`,
    pass:  apiReachable,
    info:  apiReachable ? 'Reachable' : 'Cannot reach Splunk API',
  });

  checks.push({
    label: 'Splunk authentication',
    pass:  authOk,
    info:  authOk ? `Authenticated as ${cfg.splunk.username}` : 'Check credentials in ~/.hex/config.json',
  });

  checks.push({
    label: `HEX index (${cfg.splunk.index})`,
    pass:  indexExists,
    info:  indexExists ? 'Exists' : 'Run: hex init to create',
  });

  checks.push({
    label: 'Log data ingested',
    pass:  eventCount > 0,
    info:  eventCount > 0 ? `${eventCount} events` : 'Run: hex init to ingest case data',
  });

  // ─── Print results ────────────────────────────────────────────────────────
  const width = 38;
  console.log(chalk.gray('  ' + '─'.repeat(width)));

  let allPass = true;
  for (const c of checks) {
    const icon  = c.pass ? chalk.green('✔') : chalk.red('✖');
    const label = chalk.white(c.label.padEnd(32));
    const info  = chalk.gray(`  ${c.info}`);
    console.log(`  ${icon}  ${label}`);
    if (!c.pass) {
      console.log(`       ${info}`);
      allPass = false;
    }
  }

  console.log(chalk.gray('  ' + '─'.repeat(width)) + '\n');

  if (allPass) {
    display.success('All systems operational');
    console.log(chalk.gray('  Run: hex start case1  to begin investigating.\n'));
  } else {
    const failCount = checks.filter((c) => !c.pass).length;
    console.log(chalk.yellow(`  ${failCount} check(s) failed. Run: hex init to resolve.\n`));
  }
}

module.exports = { run };
