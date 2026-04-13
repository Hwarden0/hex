'use strict';

const chalk    = require('chalk');
const ora      = require('ora');
const display  = require('../../core/display');
const config   = require('../../core/config');
const registry = require('../../cases/registry');
const session  = require('../../engine/session');
const setup    = require('../../splunk/setup');
const splunk   = require('../../splunk/client');
const store    = require('../../storage/store');
const { formatDuration } = require('../../utils/time');

async function run(caseId) {
  // ─── Guard: initialized ──────────────────────────────────────────────────
  const cfg = config.load();
  if (!cfg.initialized) {
    display.error('HEX is not initialized.', 'Run: hex init');
    return;
  }

  // ─── Guard: valid case ───────────────────────────────────────────────────
  if (!registry.exists(caseId)) {
    display.error(`Unknown case: ${caseId}`, `Available: case1 through case10`);
    return;
  }

  const caseObj = registry.get(caseId);
  const scenario = caseObj.scenario;
  const scores   = store.getScores();

  // ─── Guard: already submitted ────────────────────────────────────────────
  if (scores[caseId]) {
    console.log(chalk.yellow(`\n  You have already submitted ${caseId} (score: ${scores[caseId].score}).`));
    const inquirer = require('inquirer');
    const { restart } = await inquirer.prompt([{
      type:    'confirm',
      name:    'restart',
      message: 'Restart this case? (previous score will be cleared)',
      default: false,
    }]);
    if (!restart) return;
    store.resetCase(caseId);
  }

  // ─── Guard: already active ───────────────────────────────────────────────
  if (session.isActive(caseId)) {
    const s = session.load(caseId);
    const elapsed = session.elapsed(caseId);
    console.log(chalk.yellow(`\n  Case ${caseId} is already in progress (${formatDuration(elapsed)}).`));
    const inquirer = require('inquirer');
    const { resume } = await inquirer.prompt([{
      type:    'confirm',
      name:    'resume',
      message: 'Resume this session?',
      default: true,
    }]);
    if (!resume) {
      session.abandon(caseId);
    } else {
      showScenario(caseObj, scenario, s);
      return;
    }
  }

  // ─── Ensure Splunk is up ─────────────────────────────────────────────────
  const pingOk = await splunk.ping();
  if (!pingOk) {
    display.error('Splunk is not reachable.', 'Run: hex doctor');
    return;
  }

  // ─── Check log data exists, ingest if missing ────────────────────────────
  const spinner = ora({ text: `Preparing case data for ${caseId}...`, color: 'cyan' }).start();
  try {
    const ingested = await setup.caseIngested(caseId);
    if (!ingested) {
      spinner.text = `Ingesting log data for ${caseId}...`;
      await setup.reingestCase(caseId);
      await new Promise((r) => setTimeout(r, 2000));
    }
    spinner.succeed(`Case data ready.`);
  } catch (err) {
    spinner.fail(`Failed to prepare case data: ${err.message}`);
    return;
  }

  // ─── Create session ───────────────────────────────────────────────────────
  const s = session.create(caseId);

  // ─── Display scenario ─────────────────────────────────────────────────────
  showScenario(caseObj, scenario, s);
}

function showScenario(caseObj, scenario, s) {
  display.banner();

  // Alert box
  display.alert({
    time:     display.timestamp(),
    title:    scenario.title,
    target:   scenario.alert.target,
    type:     scenario.alert.type,
    severity: scenario.alert.severity,
    status:   'ACTIVE',
  });

  // Story
  const storyLines = scenario.story.map((l) =>
    l === '' ? '' : (l.startsWith('  ') ? chalk.cyan(l) : chalk.white(l))
  );
  console.log(chalk.gray('  ─── INCIDENT BRIEF ──────────────────────────────────'));
  storyLines.forEach((l) => console.log('  ' + l));
  console.log(chalk.gray('  ─────────────────────────────────────────────────────\n'));

  // Objectives
  console.log(chalk.bold.white('  OBJECTIVES:\n'));
  const objectives = scenario.objectives || [];
  objectives.forEach((obj, i) => {
    console.log(`  ${chalk.cyan(`[${i + 1}]`)} ${chalk.white(obj.label)} ${chalk.gray(`(${obj.points}pts)`)}`);
  });

  // Splunk info
  const cfg = require('../../core/config').load();
  console.log(chalk.gray('\n  ─── SPLUNK SEARCH ────────────────────────────────────'));
  console.log(`  ${chalk.gray('URL      :')} ${chalk.cyan(`http://${cfg.splunk.host}:8000`)}`);
  console.log(`  ${chalk.gray('Index    :')} ${chalk.white(`index=${cfg.splunk.index} sourcetype=hex_${caseObj.id}_*`)}`);
  console.log(chalk.gray('  ──────────────────────────────────────────────────────\n'));

  // Quick-start queries
  if (scenario.splunk_queries && scenario.splunk_queries.length > 0) {
    console.log(chalk.bold.white('  SUGGESTED FIRST QUERY:\n'));
    console.log(chalk.cyan('  ' + scenario.splunk_queries[0]));
    console.log();
  }

  // Commands
  console.log(chalk.gray('  ─── COMMANDS ─────────────────────────────────────────'));
  console.log(`  ${chalk.cyan('hex status')}    ${chalk.gray('—')} ${chalk.white('Check objective progress')}`);
  console.log(`  ${chalk.cyan('hex hint')}      ${chalk.gray('—')} ${chalk.white('Get a hint (-5pts each)')}`);
  console.log(`  ${chalk.cyan('hex submit')}    ${chalk.gray('—')} ${chalk.white('Submit your findings')}`);
  console.log(chalk.gray('  ──────────────────────────────────────────────────────\n'));

  console.log(chalk.bold.yellow(`  Investigation started. Good luck.\n`));
}

module.exports = { run };
