'use strict';

const chalk    = require('chalk');
const display  = require('../../core/display');
const config   = require('../../core/config');
const registry = require('../../cases/registry');
const session  = require('../../engine/session');
const progress = require('../../engine/progress');
const store    = require('../../storage/store');
const { formatDuration } = require('../../utils/time');

async function run(caseId) {
  const cfg    = config.load();
  const scores = store.getScores();

  // ─── No caseId: show all cases overview ──────────────────────────────────
  if (!caseId) {
    showOverview(scores);
    return;
  }

  // ─── Specific case status ─────────────────────────────────────────────────
  if (!registry.exists(caseId)) {
    display.error(`Unknown case: ${caseId}`);
    return;
  }

  const s = session.load(caseId);
  if (!s) {
    console.log(chalk.gray(`\n  No active session for ${caseId}. Run: hex start ${caseId}\n`));
    return;
  }

  const caseObj  = registry.get(caseId);
  const report   = progress.report(caseId);
  const elapsed  = session.elapsed(caseId);

  // Header
  console.log();
  console.log(chalk.gray('  ─── CASE STATUS ──────────────────────────────────────'));
  console.log(`  ${chalk.bold.white(caseObj.title)}`);
  console.log(`  ${chalk.gray('Case     :')} ${chalk.cyan(caseId)}`);
  console.log(`  ${chalk.gray('Status   :')} ${s.status === 'active' ? chalk.yellow('ACTIVE') : chalk.green('SUBMITTED')}`);
  console.log(`  ${chalk.gray('Elapsed  :')} ${chalk.white(formatDuration(elapsed))}`);
  console.log(`  ${chalk.gray('Hints    :')} ${chalk.white(report.hintsUsed.length)} used`);
  console.log(chalk.gray('  ──────────────────────────────────────────────────────\n'));

  // Objectives table
  display.statusTable(report.rows);

  // Progress bar
  console.log();
  console.log(`  ${chalk.gray('Progress :')} ${display.progressBar(report.pct)}`);
  console.log();

  if (report.pct === 100) {
    console.log(chalk.green('  All objectives identified. Run: hex submit\n'));
  } else {
    const remaining = report.rows.filter((r) => !r.done).length;
    console.log(chalk.gray(`  ${remaining} objective(s) remaining. Continue your investigation in Splunk.\n`));
  }
}

function showOverview(scores) {
  const cases  = registry.listAll();
  const Table  = require('cli-table3');
  const levels = require('../../scoring/levels');

  const t = new Table({
    head: [
      chalk.bold.cyan('Case'),
      chalk.bold.cyan('Title'),
      chalk.bold.cyan('Difficulty'),
      chalk.bold.cyan('Points'),
      chalk.bold.cyan('Score'),
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

  const diffColor = { beginner: chalk.green, intermediate: chalk.yellow, advanced: chalk.red };

  for (const c of cases) {
    const s      = scores[c.id];
    const dc     = diffColor[c.difficulty] || chalk.white;
    const score  = s ? chalk.green.bold(String(s.score)) : chalk.gray('—');
    const status = s ? chalk.green('complete') : session.isActive(c.id) ? chalk.yellow('in progress') : chalk.gray('pending');
    t.push([
      chalk.cyan(c.id),
      chalk.white(c.title),
      dc(c.difficulty),
      chalk.gray(c.points),
      score,
      status,
    ]);
  }

  console.log('\n' + chalk.bold.white('  CASE OVERVIEW') + '\n');
  console.log(t.toString());

  const completed = Object.keys(scores).length;
  const total     = cases.length;
  const pct       = Math.round((completed / total) * 100);
  console.log();
  console.log(`  ${chalk.gray('Completed :')} ${chalk.white(`${completed}/${total}`)}  ${display.progressBar(pct, 20)}`);
  console.log();
}

module.exports = { run };
