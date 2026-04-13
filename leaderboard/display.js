'use strict';

const chalk   = require('chalk');
const display = require('../core/display');
const store   = require('../storage/store');

function render(entries, currentUser) {
  console.log('\n' + chalk.bold.cyan('  ══════════════════════════════════════'));
  console.log(chalk.bold.cyan('             GLOBAL RANKINGS'));
  console.log(chalk.bold.cyan('  ══════════════════════════════════════') + '\n');

  if (!entries || entries.length === 0) {
    console.log(chalk.gray('  No submissions found.\n'));
    return;
  }

  display.leaderboard(entries, currentUser);

  const myRank = entries.findIndex((e) => e.user === currentUser) + 1;
  if (myRank > 0) {
    console.log(chalk.cyan(`\n  Your Rank: `) + chalk.bold.cyan(`#${myRank}`) + chalk.gray(` of ${entries.length}`));
  }

  console.log();
}

function renderLocalScores(scores, user) {
  const Table = require('cli-table3');
  const registry = require('../cases/registry');
  const { getLevelName } = require('../scoring/levels');

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
      top: '─', 'top-mid': '┬', 'top-left': '┌', 'top-right': '┐',
      bottom: '─', 'bottom-mid': '┴', 'bottom-left': '└', 'bottom-right': '┘',
      left: '│', 'left-mid': '├', mid: '─', 'mid-mid': '┼',
      right: '│', 'right-mid': '┤', middle: '│',
    },
  });

  const cases = registry.listAll();
  for (const c of cases) {
    const s    = scores[c.id];
    const scoreStr = s ? display.C.greenBold(s.score) : chalk.gray('—');
    const timeStr  = s ? chalk.gray(`${Math.round(s.time / 60)}m`) : chalk.gray('—');
    const status   = s ? chalk.green('✔ complete') : chalk.gray('○ pending');
    t.push([
      chalk.cyan(c.id),
      chalk.white(c.title),
      scoreStr,
      timeStr,
      status,
    ]);
  }

  console.log('\n' + chalk.bold.cyan(`  ${user}'s Scores`) + '\n');
  console.log(t.toString());
}

module.exports = { render, renderLocalScores };
