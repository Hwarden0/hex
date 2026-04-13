'use strict';

const chalk    = require('chalk');
const ora      = require('ora');
const inquirer = require('inquirer');
const display  = require('../../core/display');
const config   = require('../../core/config');
const registry = require('../../cases/registry');
const session  = require('../../engine/session');
const progress = require('../../engine/progress');
const calc     = require('../../scoring/calculator');
const antiCheat = require('../../submission/anticheat');
const gen      = require('../../submission/generator');
const github   = require('../../submission/github');
const { formatDuration } = require('../../utils/time');

async function run() {
  const cfg = config.load();
  if (!cfg.initialized) {
    display.error('HEX is not initialized.', 'Run: hex init');
    return;
  }

  const user = require('../../storage/store').getUser();
  if (!user || !user.name) {
    display.error('No HEX user configured.', 'Run: hex init to set up your profile.');
    return;
  }

  // Find active sessions
  const sessions = registry.list().filter((id) => session.isActive(id));

  if (sessions.length === 0) {
    display.error('No active investigation sessions.', 'Start a case with: hex start case1');
    return;
  }

  // If multiple sessions, let user pick
  let caseId;
  if (sessions.length === 1) {
    caseId = sessions[0];
  } else {
    const { chosen } = await inquirer.prompt([{
      type:    'list',
      name:    'chosen',
      message: 'Which case do you want to submit?',
      choices: sessions.map((id) => {
        const c = registry.get(id);
        const elapsed = session.elapsed(id);
        return { name: `${id} - ${c ? c.title : id} (${formatDuration(elapsed)})`, value: id };
      }),
    }]);
    caseId = chosen;
  }

  const caseObj = registry.get(caseId);
  if (!caseObj) {
    display.error(`Cannot find case: ${caseId}`);
    return;
  }

  const s       = session.load(caseId);
  const report  = progress.report(caseId);
  const elapsed = session.elapsed(caseId);

  if (!report) {
    display.error('Cannot generate progress report.', 'Start the case first: hex start ' + caseId);
    return;
  }

  // ── Show submission preview ────────────────────────────────────────────────
  console.log();
  display.infoBox('Submission Preview', [
    `Case      : ${caseObj.title}`,
    `Elapsed   : ${formatDuration(elapsed)}`,
    `Progress  : ${report.pct}%`,
    `Hints used: ${report.hintsUsed.length}`,
    '',
    `Objectives: ${report.rows.filter((r) => r.done).length}/${report.rows.length} complete`,
  ]);

  const { confirm } = await inquirer.prompt([{
    type:    'confirm',
    name:    'confirm',
    message: 'Submit these findings for scoring?',
    default: false,
  }]);

  if (!confirm) {
    console.log(chalk.gray('\n  Submission cancelled.\n'));
    return;
  }

  // ── Calculate score ────────────────────────────────────────────────────────
  const validation = caseObj.validation;
  const scoring = calc.calculate({
    answers:        s.answers,
    validation,
    elapsedSeconds: elapsed,
    hintsUsed:      s.hintsUsed,
    estimatedTime:  caseObj.metadata?.estimatedTime || 30,
  });

  // Anti-cheat check
  const submissionPreview = {
    user:  user.name,
    case:  caseId,
    score: scoring.finalScore,
    time:  elapsed,
    timestamp: new Date().toISOString(),
    answers: s.answers,
  };

  const antiCheatResult = antiCheat.validate(submissionPreview, s, validation);

  // ── Mark session complete ──────────────────────────────────────────────────
  session.complete(caseId, s.answers);

  // ── ALWAYS save locally first — this is the source of truth ────────────────
  const flags = antiCheatResult.flags || [];
  const submission = gen.generate({
    user:         user.name,
    caseId,
    score:        scoring.finalScore,
    elapsedSeconds: elapsed,
    answers:      s.answers,
    queriesUsed:  s.queriesUsed || [],
    flags,
  });

  gen.save(user.name, caseId, submission);

  // ── Show results ───────────────────────────────────────────────────────────
  console.log();
  display.separator();
  console.log(chalk.bold.cyan('  SUBMISSION RESULTS'));
  display.separator();
  console.log();
  console.log(`  ${chalk.gray('Case     :')} ${chalk.white(caseObj.title)}`);
  console.log(`  ${chalk.gray('Score    :')} ${chalk.bold.green(scoring.finalScore + '/100')}`);
  console.log(`  ${chalk.gray('Level    :')} ${chalk.white(scoring.level)}`);
  console.log(`  ${chalk.gray('Time     :')} ${chalk.white(formatDuration(elapsed))}`);
  console.log(`  ${chalk.gray('Time mod :')} ${chalk.white(scoring.timeFactor >= 1 ? '+' : '')}${chalk.white(Math.round((scoring.timeFactor - 1) * 100))}%`);
  console.log(`  ${chalk.gray('Hints    :')} ${chalk.white(s.hintsUsed.length > 0 ? `-${s.hintsUsed.length * 5} points` : 'none')}`);

  if (antiCheatResult.flags && antiCheatResult.flags.length > 0) {
    console.log();
    console.log(chalk.yellow('  Warnings:'));
    antiCheatResult.flags.forEach((f) => console.log(chalk.yellow(`    - ${f}`)));
  }

  console.log();
  display.success(`Case ${caseId} submitted locally with score ${scoring.finalScore}/100`);
  console.log(chalk.gray(`  File saved to: ~/.hex/submissions/${user.name}/${caseId}.json`));

  // ── Optional: Submit to public leaderboard ─────────────────────────────────
  console.log();

  const cachedUser = github.getCachedGitHubUser();
  const authNote = cachedUser
    ? chalk.gray(`  (Currently authenticated as @${cachedUser})`)
    : chalk.gray('  (Will use GitHub Device Authorization Flow)');
  console.log(authNote);

  const { pushToGitHub } = await inquirer.prompt([{
    type:    'confirm',
    name:    'pushToGitHub',
    message: 'Submit to the public leaderboard via GitHub?',
    default: !!cachedUser,
  }]);

  if (!pushToGitHub) {
    console.log();
    console.log(chalk.gray('  Leaderboard submission skipped.'));
    console.log(chalk.gray('  Your results are saved locally.\n'));
    console.log(chalk.gray('  Run ') + chalk.cyan('hex submit') + chalk.gray(' again later to publish your score.\n'));
    return;
  }

  // ── GitHub submission flow ─────────────────────────────────────────────────
  const spinner = ora({ text: 'Authenticating with GitHub...', color: 'cyan' }).start();

  try {
    const result = await github.submitToLeaderboard(submission);

    if (result.success) {
      spinner.succeed('Leaderboard submission complete!');
      console.log();
      display.infoBox('Pull Request Created', [
        `  PR: ${result.prUrl}`,
        '',
        `  Your score will appear on the leaderboard once the PR is merged.`,
      ]);
    } else {
      spinner.fail(`Leaderboard submission failed: ${result.error}`);
      console.log();
      console.log(chalk.yellow('  Your submission was saved locally but could not be published.'));
      console.log(github.prInstructions(user.name, caseId));
      console.log(chalk.gray('  You can retry later with: hex submit\n'));
    }
  } catch (err) {
    spinner.fail(`GitHub error: ${err.message}`);
    console.log();
    console.log(chalk.gray('  Your submission has been saved locally.\n'));
  }
}

module.exports = { run };
