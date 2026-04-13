'use strict';

const chalk   = require('chalk');
const display = require('../../core/display');
const config  = require('../../core/config');
const store   = require('../../storage/store');
const lbClient = require('../../leaderboard/client');
const lbDisplay = require('../../leaderboard/display');

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

  // Show local scores first
  lbDisplay.renderLocalScores(scores, user.name);

  // Try to fetch remote leaderboard
  console.log(chalk.gray('  Fetching global rankings...\n'));

  try {
    const entries = await lbClient.get();
    if (entries && entries.length > 0) {
      lbDisplay.render(entries, user.name);
    } else {
      console.log(chalk.gray('  No global rankings available. Submit a case to appear on the leaderboard.\n'));
    }
  } catch (err) {
    console.log(chalk.gray(`  Could not fetch global rankings: ${err.message}\n`));
    console.log(chalk.gray('  Showing local scores only.\n'));
  }
}

module.exports = { run };
