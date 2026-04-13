'use strict';

const chalk   = require('chalk');
const display = require('../../core/display');
const config  = require('../../core/config');
const store   = require('../../storage/store');
const levels  = require('../../scoring/levels');
const registry = require('../../cases/registry');

async function run() {
  const cfg = config.load();
  if (!cfg.initialized) {
    display.error('HEX is not initialized.', 'Run: hex init');
    return;
  }

  const user = store.getUser();
  if (!user || !user.name) {
    display.error('No HEX user configured.', 'Run: hex init to set up your profile.');
    return;
  }

  const scores = store.getScores();
  const scoreEntries = Object.entries(scores);

  if (scoreEntries.length === 0) {
    display.infoBox('No Scores Yet', [
      'Complete and submit cases to earn points.',
      '',
      'Start investigating:',
      '  hex start case1',
    ]);
    return;
  }

  // Calculate overall stats
  const totalScore = scoreEntries.reduce((sum, [, s]) => sum + (s.score || 0), 0);
  const avgScore = Math.round(totalScore / scoreEntries.length);
  const levelInfo = levels.getLevel(avgScore);
  const completedCases = scoreEntries.length;
  const totalCases = registry.list().length;

  // Header
  console.log();
  console.log(chalk.bold.cyan('  HEX SCORECARD'));
  console.log(chalk.gray('  ' + '='.repeat(40)));
  console.log();
  console.log(`  ${chalk.gray('User     :')} ${chalk.white(user.name)}`);
  console.log(`  ${chalk.gray('Cases    :')} ${chalk.white(`${completedCases}/${totalCases}`)} completed`);
  console.log(`  ${chalk.gray('Avg Score:')} ${chalk.bold.white(avgScore + '/100')}`);
  console.log(`  ${chalk.gray('Level    :')} ${chalk.white(levelInfo.name)} ${chalk.gray(`(${levelInfo.badge})`)}`);
  console.log();

  // Per-case breakdown
  const Table = require('cli-table3');
  const t = new Table({
    head: [
      chalk.bold.cyan('Case'),
      chalk.bold.cyan('Title'),
      chalk.bold.cyan('Score'),
      chalk.bold.cyan('Time'),
      chalk.bold.cyan('Status'),
    ],
    style: { head: [], border: ['gray'] },
    chars: {
      top: '-', 'top-mid': '+', 'top-left': '+', 'top-right': '+',
      bottom: '-', 'bottom-mid': '+', 'bottom-left': '+', 'bottom-right': '+',
      left: '|', 'left-mid': '+', mid: '-', 'mid-mid': '+',
      right: '|', 'right-mid': '+', middle: '|',
    },
  });

  const allCases = registry.listAll();
  for (const c of allCases) {
    const s = scores[c.id];
    const scoreStr = s ? chalk.green(String(s.score)) : chalk.gray('--');
    const timeStr  = s ? chalk.gray(`${Math.round(s.time / 60)}m`) : chalk.gray('--');
    const status   = s ? chalk.green('completed') : chalk.gray('pending');
    t.push([
      chalk.cyan(c.id),
      chalk.white(c.title),
      scoreStr,
      timeStr,
      status,
    ]);
  }

  console.log(t.toString());

  // Level progression
  const nextLevel = levels.LEVELS.find((l) => avgScore < l.min);
  if (nextLevel) {
    console.log();
    console.log(chalk.gray(`  Next level: ${nextLevel.name} (${nextLevel.min} avg points needed)`));
  } else {
    console.log();
    console.log(chalk.green('  Maximum level achieved. Excellent work.'));
  }

  console.log();
}

module.exports = { run };
