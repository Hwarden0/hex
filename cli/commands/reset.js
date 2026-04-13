'use strict';

const chalk    = require('chalk');
const inquirer = require('inquirer');
const display  = require('../../core/display');
const config   = require('../../core/config');
const registry = require('../../cases/registry');
const session  = require('../../engine/session');
const store    = require('../../storage/store');

async function run(caseId, opts) {
  const cfg = config.load();
  if (!cfg.initialized) {
    display.error('HEX is not initialized.', 'Run: hex init');
    return;
  }

  if (caseId) {
    // Reset a specific case
    if (!registry.exists(caseId)) {
      display.error(`Unknown case: ${caseId}`);
      return;
    }

    const scores = store.getScores();
    const hasProgress = scores[caseId] || session.isActive(caseId);

    if (!hasProgress) {
      console.log(chalk.gray(`\n  No progress found for ${caseId}.\n`));
      return;
    }

    let confirmed = opts && opts.yes;

    if (!confirmed) {
      console.log(chalk.yellow(`\n  This will reset all progress for: ${caseId}`));
      console.log(chalk.gray('  Your score and session data will be permanently deleted.\n'));

      const { confirm } = await inquirer.prompt([{
        type:    'confirm',
        name:    'confirm',
        message: `Reset ${caseId}?`,
        default: false,
      }]);
      confirmed = confirm;
    }

    if (!confirmed) {
      console.log(chalk.gray('\n  Reset cancelled.\n'));
      return;
    }

    store.resetCase(caseId);
    console.log(chalk.green(`\n  ${caseId} has been reset. You can restart it with: hex start ${caseId}\n`));
  } else {
    // Reset all
    const scores = store.getScores();
    const sessions = registry.list().filter((id) => session.isActive(id));

    if (Object.keys(scores).length === 0 && sessions.length === 0) {
      console.log(chalk.gray('\n  No progress to reset.\n'));
      return;
    }

    let confirmed = opts && opts.yes;

    if (!confirmed) {
      console.log(chalk.yellow('\n  WARNING: This will reset ALL progress across all cases.'));
      console.log(chalk.gray('  All scores, sessions, and session data will be permanently deleted.\n'));

      const { confirm } = await inquirer.prompt([{
        type:    'confirm',
        name:    'confirm',
        message: 'Reset ALL progress?',
        default: false,
      }]);
      confirmed = confirm;
    }

    if (!confirmed) {
      console.log(chalk.gray('\n  Reset cancelled.\n'));
      return;
    }

    store.resetAll();
    console.log(chalk.green('\n  All progress has been reset. Start fresh with: hex start case1\n'));
  }
}

module.exports = { run };
