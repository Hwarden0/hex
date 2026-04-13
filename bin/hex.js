#!/usr/bin/env node

'use strict';

const { program } = require('../cli/index');

process.title = 'hex';

process.on('uncaughtException', (err) => {
  const chalk = require('chalk');
  console.error(chalk.red('\n[FATAL] Unhandled error:'), err.message);
  if (process.env.HEX_DEBUG) console.error(err.stack);
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  const chalk = require('chalk');
  console.error(chalk.red('\n[FATAL] Unhandled rejection:'), reason);
  process.exit(1);
});

program.parseAsync(process.argv).catch((err) => {
  const chalk = require('chalk');
  console.error(chalk.red('\n[ERROR]'), err.message);
  if (process.env.HEX_DEBUG) console.error(err.stack);
  process.exit(1);
});
