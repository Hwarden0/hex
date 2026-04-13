'use strict';

const chalk    = require('chalk');
const inquirer = require('inquirer');
const display  = require('../../core/display');
const registry = require('../../cases/registry');
const session  = require('../../engine/session');
const checker  = require('../../validation/checker');

async function run(caseId, key, value) {
  // Find active session
  const sessions = registry.list().filter((id) => session.isActive(id));

  if (sessions.length === 0) {
    display.error('No active investigation sessions.', 'Start a case with: hex start case1');
    return;
  }

  // Resolve caseId
  if (!caseId) {
    if (sessions.length === 1) {
      caseId = sessions[0];
    } else {
      const { chosen } = await inquirer.prompt([{
        type:    'list',
        name:    'chosen',
        message: 'Which case are you answering?',
        choices: sessions,
      }]);
      caseId = chosen;
    }
  }

  if (!session.isActive(caseId)) {
    display.error(`No active session for: ${caseId}`);
    return;
  }

  const caseObj    = registry.get(caseId);
  const validation = caseObj.validation;
  const objectives = caseObj.scenario.objectives || [];
  const s          = session.load(caseId);
  const answers    = { ...(s.answers || {}) };

  // ─── Interactive mode: no key/value provided ──────────────────────────────
  if (!key) {
    console.log();
    console.log(chalk.bold.white(`  ${caseObj.title} — Record Finding\n`));

    // Show objectives with current status
    const choices = objectives.map((obj) => {
      const rule  = validation.objectives[obj.answer_key];
      const given = answers[obj.answer_key];
      let status  = chalk.gray('unanswered');
      if (given !== undefined) {
        const result = checker.checkObjective(given, rule);
        status = result.correct
          ? chalk.green(`✓ ${given}`)
          : chalk.red(`✗ ${given}`);
      }
      return {
        name:  `${obj.label} ${chalk.gray('[')}${status}${chalk.gray(']')}`,
        value: obj.answer_key,
        short: obj.label,
      };
    });

    choices.push({ name: chalk.gray('— done —'), value: '__done__' });

    let keepGoing = true;
    while (keepGoing) {
      const { selectedKey } = await inquirer.prompt([{
        type:    'list',
        name:    'selectedKey',
        message: 'Select objective to answer:',
        choices,
        pageSize: 15,
      }]);

      if (selectedKey === '__done__') break;

      const obj  = objectives.find((o) => o.answer_key === selectedKey);
      const rule = validation.objectives[selectedKey];

      const prompt = buildPrompt(selectedKey, rule, obj.label);

      const { userAnswer } = await inquirer.prompt([{
        type:    'input',
        name:    'userAnswer',
        message: prompt,
        default: answers[selectedKey] || '',
      }]);

      if (userAnswer.trim() === '') {
        console.log(chalk.gray('  Skipped.\n'));
        continue;
      }

      answers[selectedKey] = userAnswer.trim();
      session.update(caseId, { answers });

      // Instant feedback
      const result = checker.checkObjective(userAnswer.trim(), rule);
      if (result.correct) {
        console.log(chalk.green(`  ✓ Correct! +${rule.weight} pts\n`));
      } else if (result.partial) {
        console.log(chalk.yellow(`  ~ Partial credit.\n`));
      } else {
        console.log(chalk.red(`  ✗ Recorded — keep investigating.\n`));
      }

      // Refresh choice display
      const idx = choices.findIndex((c) => c.value === selectedKey);
      if (idx !== -1) {
        const freshResult = checker.checkObjective(answers[selectedKey], rule);
        const freshStatus = freshResult.correct
          ? chalk.green(`✓ ${answers[selectedKey]}`)
          : chalk.red(`✗ ${answers[selectedKey]}`);
        choices[idx].name = `${obj.label} ${chalk.gray('[')}${freshStatus}${chalk.gray(']')}`;
      }

      const { cont } = await inquirer.prompt([{
        type:    'confirm',
        name:    'cont',
        message: 'Answer another objective?',
        default: true,
      }]);
      keepGoing = cont;
    }

  // ─── Direct mode: hex answer case1 attacker_ip 10.0.0.5 ─────────────────
  } else {
    if (!validation.objectives[key]) {
      display.error(`Unknown objective key: ${key}`);
      console.log(chalk.gray('  Valid keys: ' + objectives.map((o) => o.answer_key).join(', ')));
      return;
    }

    answers[key] = value;
    session.update(caseId, { answers });

    const rule   = validation.objectives[key];
    const result = checker.checkObjective(value, rule);

    if (result.correct) {
      console.log(chalk.green(`\n  ✓ Correct! +${rule.weight} pts\n`));
    } else if (result.partial) {
      console.log(chalk.yellow(`\n  ~ Partial credit recorded.\n`));
    } else {
      console.log(chalk.red(`\n  ✗ Recorded — keep investigating.\n`));
    }
  }

  // Show updated progress
  const updatedSession = session.load(caseId);
  const completedCount = objectives.filter((obj) => {
    const rule   = validation.objectives[obj.answer_key];
    const given  = (updatedSession.answers || {})[obj.answer_key];
    return given !== undefined && checker.checkObjective(given, rule).correct;
  }).length;

  console.log(chalk.gray(`  Progress: ${completedCount}/${objectives.length} objectives complete`));
  if (completedCount === objectives.length) {
    console.log(chalk.green.bold('  All objectives found! Run: hex submit\n'));
  } else {
    console.log(chalk.gray('  Run hex status to review • hex submit when ready\n'));
  }
}

function buildPrompt(key, rule, label) {
  const hints = {
    ip:           'Enter IP address (e.g. 192.168.1.1)',
    integer:      `Enter a number${rule.tolerance ? ` (±${rule.tolerance} tolerance)` : ''}`,
    boolean_text: 'Enter yes or no',
    set:          'Enter comma-separated values',
    ordered_list: 'Enter values in order, comma-separated',
    time_hhmm:    `Enter time HH:MM${rule.tolerance_minutes ? ` (±${rule.tolerance_minutes}min)` : ''}`,
    set_partial:  'Enter comma-separated values',
  };
  const hint = hints[rule.type] || 'Enter your answer';
  return `${label}\n  ${chalk.gray(hint)}\n  Answer`;
}

module.exports = { run };
