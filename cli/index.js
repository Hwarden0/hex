'use strict';

const { Command } = require('commander');
const packageJson = require('../package.json');

const program = new Command();

program
  .name('hex')
  .description('Hunt threats with Splunk. Right from your terminal.')
  .version(packageJson.version);

program
  .command('init')
  .description('Initialize HEX and connect to your Splunk instance')
  .action(async () => {
    const { run } = require('./commands/init');
    await run();
  });

program
  .command('doctor')
  .description('Run system diagnostics to verify HEX and Splunk configuration')
  .action(async () => {
    const { run } = require('./commands/doctor');
    await run();
  });

program
  .command('start <caseId>')
  .description('Start an investigation case (e.g. hex start case1)')
  .action(async (caseId) => {
    const { run } = require('./commands/start');
    await run(caseId);
  });

program
  .command('status [caseId]')
  .description('Check objective progress for a case or show all cases overview')
  .action(async (caseId) => {
    const { run } = require('./commands/status');
    await run(caseId);
  });

program
  .command('submit')
  .description('Submit your investigation findings for scoring')
  .action(async () => {
    const { run } = require('./commands/submit');
    await run();
  });

program
  .command('answer [caseId] [key] [value]')
  .description('Record your findings for an objective (interactive if no args given)')
  .action(async (caseId, key, value) => {
    const { run } = require('./commands/answer');
    await run(caseId, key, value);
  });

program
  .command('hint')
  .description('Get a hint for the current case (-5 points per hint)')
  .action(async () => {
    const { run } = require('./commands/hint');
    await run();
  });

program
  .command('score')
  .description('View your scores and overall level')
  .action(async () => {
    const { run } = require('./commands/score');
    await run();
  });

program
  .command('rank')
  .description('View the global leaderboard rankings')
  .action(async () => {
    const { run } = require('./commands/rank');
    await run();
  });

program
  .command('reset [caseId]')
  .description('Reset progress on a case (omit caseId to reset all)')
  .option('-y, --yes', 'Skip confirmation prompt')
  .action(async (caseId, opts) => {
    const { run } = require('./commands/reset');
    await run(caseId, opts);
  });

module.exports = { program };
