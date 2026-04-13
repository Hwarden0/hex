'use strict';

const chalk    = require('chalk');
const inquirer = require('inquirer');
const display  = require('../../core/display');
const config   = require('../../core/config');
const registry = require('../../cases/registry');
const session  = require('../../engine/session');
const store    = require('../../storage/store');

async function run() {
  const cfg = config.load();
  if (!cfg.initialized) {
    display.error('HEX is not initialized.', 'Run: hex init');
    return;
  }

  // Find active sessions
  const sessions = registry.list().filter((id) => session.isActive(id));

  if (sessions.length === 0) {
    display.error('No active investigation sessions.', 'Start a case with: hex start case1');
    return;
  }

  let caseId;
  if (sessions.length === 1) {
    caseId = sessions[0];
  } else {
    const { chosen } = await inquirer.prompt([{
      type:    'list',
      name:    'chosen',
      message: 'Which case do you need a hint for?',
      choices: sessions.map((id) => {
        const c = registry.get(id);
        return { name: `${id} - ${c ? c.title : id}`, value: id };
      }),
    }]);
    caseId = chosen;
  }

  const caseObj = registry.get(caseId);
  if (!caseObj) {
    display.error(`Cannot find case: ${caseId}`);
    return;
  }

  const s = session.load(caseId);
  if (!s) {
    display.error('No active session for this case.');
    return;
  }

  const hints = caseObj.scenario?.hints || [];
  if (hints.length === 0) {
    console.log(chalk.yellow('\n  No hints available for this case.\n'));
    return;
  }

  // Find next unused hint
  const usedHints = s.hintsUsed || [];
  const nextHintIndex = usedHints.length;

  if (nextHintIndex >= hints.length) {
    console.log(chalk.yellow('\n  All hints have been used for this case.\n'));
    return;
  }

  const { confirm } = await inquirer.prompt([{
    type:    'confirm',
    name:    'confirm',
    message: `Reveal hint #${nextHintIndex + 1}? (-5 points)`,
    default: false,
  }]);

  if (!confirm) {
    console.log(chalk.gray('\n  Hint cancelled.\n'));
    return;
  }

  // Record the hint
  session.recordHint(caseId, nextHintIndex);

  // Show the hint
  display.hint(nextHintIndex + 1, hints[nextHintIndex]);

  // Warn about remaining hints
  const remaining = hints.length - nextHintIndex - 1;
  if (remaining > 0) {
    console.log(chalk.gray(`  ${remaining} hint(s) remaining.\n`));
  } else {
    console.log(chalk.gray('  No more hints available.\n'));
  }
}

module.exports = { run };
