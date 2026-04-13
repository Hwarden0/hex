'use strict';

const inquirer = require('inquirer');
const chalk    = require('chalk');
const ora      = require('ora');
const path     = require('path');
const display  = require('../../core/display');
const config   = require('../../core/config');
const store    = require('../../storage/store');
const detector = require('../../splunk/detector');
const setup    = require('../../splunk/setup');
const splunk   = require('../../splunk/client');

async function run() {
  display.banner();

  console.log(chalk.bold.white('  HEX INITIALIZATION\n'));
  console.log(chalk.white('  This wizard will configure HEX and connect to your Splunk instance.\n'));

  // ─── Step 1: Splunk download prompt ─────────────────────────────────────────
  console.log(chalk.bold.yellow('  ┌─ REQUIREMENT: Splunk Enterprise'));
  console.log(chalk.gray  ('  │'));
  console.log(chalk.gray  ('  │  HEX requires a local Splunk instance to ingest and search log data.'));
  console.log(chalk.gray  ('  │'));
  console.log(chalk.cyan  ('  │  Download: https://www.splunk.com/en_us/download.html'));
  console.log(chalk.gray  ('  │  License:  Free Developer License (500MB/day, no time limit)'));
  console.log(chalk.bold.yellow('  └────────────────────────────────────────\n'));

  const { hasSplunk } = await inquirer.prompt([{
    type:    'confirm',
    name:    'hasSplunk',
    message: 'Do you have Splunk Enterprise installed?',
    default: true,
  }]);

  if (!hasSplunk) {
    display.infoBox('Installation Guide', [
      '> Download Splunk Enterprise from the URL above',
      '> Install with default settings',
      '> The free license supports 500MB/day — more than enough for HEX',
      '> Run: hex init  once Splunk is installed',
    ]);
    return;
  }

  // ─── Step 2: Detect Splunk ───────────────────────────────────────────────────
  console.log(chalk.gray('\n  Searching for Splunk installation...\n'));

  let splunkInfo = detector.autoDetect();

  if (splunkInfo) {
    display.log('ok', `Found Splunk at: ${splunkInfo.home}`);
    const version = detector.getVersion(splunkInfo.binary);
    display.log('info', `Version: ${version}`);

    const { useFound } = await inquirer.prompt([{
      type:    'confirm',
      name:    'useFound',
      message: `Use this Splunk installation?`,
      default: true,
    }]);

    if (!useFound) splunkInfo = null;
  }

  if (!splunkInfo) {
    const { customPath } = await inquirer.prompt([{
      type:    'input',
      name:    'customPath',
      message: 'Enter your Splunk installation path:',
      default: '/opt/splunk',
    }]);
    splunkInfo = detector.validatePath(customPath);
    if (!splunkInfo) {
      display.error(`Cannot find Splunk binary at: ${customPath}`);
      return;
    }
  }

  // ─── Step 3: Splunk credentials ──────────────────────────────────────────────
  console.log();
  display.log('info', 'Configure Splunk API connection:');
  const cfg = config.load();

  const creds = await inquirer.prompt([
    {
      type:    'input',
      name:    'host',
      message: 'Splunk host:',
      default: cfg.splunk.host || '127.0.0.1',
    },
    {
      type:    'number',
      name:    'port',
      message: 'Splunk API port:',
      default: cfg.splunk.port || 8089,
    },
    {
      type:    'input',
      name:    'username',
      message: 'Splunk username:',
      default: cfg.splunk.username || 'admin',
    },
    {
      type:    'password',
      name:    'password',
      message: 'Splunk password:',
      default: cfg.splunk.password || 'changeme',
      mask:    '*',
    },
  ]);

  // ─── Step 4: User setup ──────────────────────────────────────────────────────
  console.log();
  const { username, githubUser } = await inquirer.prompt([
    {
      type:    'input',
      name:    'username',
      message: 'Your HEX username (for leaderboard):',
      validate: (v) => v.trim().length > 2 || 'Username must be at least 3 characters',
    },
    {
      type:    'input',
      name:    'githubUser',
      message: 'Your GitHub username (for submission PRs):',
      default: '',
    },
  ]);

  // ─── Step 5: Save config ─────────────────────────────────────────────────────
  store.ensureDirs();
  config.save({
    splunk:      { ...cfg.splunk, ...creds },
    user:        { name: username, githubUser },
    initialized: false,
    version:     '1.0.0',
    splunkHome:  splunkInfo.home,
    splunkBin:   splunkInfo.binary,
  });
  store.saveUser({ name: username, githubUser, createdAt: new Date().toISOString() });

  // ─── Step 6: Start Splunk if needed ──────────────────────────────────────────
  console.log();
  const spinner = ora({ text: 'Checking Splunk status...', color: 'cyan' }).start();
  const isUp = await splunk.ping();

  if (!isUp) {
    spinner.text = 'Starting Splunk...';
    try {
      await detector.start(splunkInfo.binary);
      // Wait for startup
      let attempts = 0;
      while (attempts < 30) {
        await new Promise((r) => setTimeout(r, 2000));
        if (await splunk.ping()) break;
        attempts++;
        spinner.text = `Waiting for Splunk to start... (${attempts * 2}s)`;
      }
    } catch (err) {
      spinner.fail(`Failed to start Splunk: ${err.message}`);
      console.log(chalk.yellow('\n  Start Splunk manually and run: hex init\n'));
      return;
    }
  }

  // ─── Step 7: Validate API ────────────────────────────────────────────────────
  spinner.text = 'Authenticating with Splunk API...';
  const authed = await splunk.authenticate();
  if (!authed) {
    spinner.fail('Authentication failed. Check username/password in config.');
    console.log(chalk.gray(`  Edit: ~/.hex/config.json`));
    return;
  }

  // ─── Step 8: Full setup ──────────────────────────────────────────────────────
  spinner.text = 'Configuring Splunk for HEX...';
  try {
    const eventCount = await setup.fullSetup(spinner);
    spinner.succeed(`Setup complete! Ingested ${eventCount} events across ${require('../../cases/registry').list().length} cases.`);
  } catch (err) {
    spinner.fail(`Setup failed: ${err.message}`);
    if (process.env.HEX_DEBUG) console.error(err.stack);
    return;
  }

  // ─── Step 9: Mark initialized ────────────────────────────────────────────────
  config.set('initialized', true);

  // ─── Done ────────────────────────────────────────────────────────────────────
  display.success(`HEX initialized for ${chalk.bold(username)}`);

  display.infoBox('Ready to Investigate', [
    `# Welcome to HEX, ${username}`,
    '',
    '> Run a quick system check:',
    '  hex doctor',
    '',
    '> Start your first investigation:',
    '  hex start case1',
    '',
    '> List all available cases:',
    '  hex score',
  ]);
}

module.exports = { run };
