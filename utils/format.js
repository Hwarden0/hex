'use strict';

const chalk = require('chalk');

// Normalize answers for comparison (lowercase, trim)
function normalizeAnswer(s) {
  return String(s).toLowerCase().trim();
}

// Compare two IP addresses
function ipEqual(a, b) {
  return normalizeAnswer(a) === normalizeAnswer(b);
}

// Check if a number is within tolerance %
function withinTolerance(actual, expected, pct = 10) {
  if (expected === 0) return actual === 0;
  return Math.abs(actual - expected) / expected <= pct / 100;
}

// Parse an integer answer safely
function parseInt2(s) {
  const n = parseInt(String(s).replace(/[^\d-]/g, ''), 10);
  return isNaN(n) ? null : n;
}

// Truncate string with ellipsis
function truncate(s, len = 40) {
  const str = String(s);
  return str.length > len ? str.slice(0, len - 1) + '…' : str;
}

// Right-pad a string
function padRight(s, width) {
  const str = String(s);
  return str + ' '.repeat(Math.max(0, width - str.length));
}

// Format a score with color
function scoreColor(score) {
  if (score >= 80) return chalk.green.bold(score);
  if (score >= 60) return chalk.yellow.bold(score);
  if (score >= 40) return chalk.yellow(score);
  return chalk.red(score);
}

module.exports = { normalizeAnswer, ipEqual, withinTolerance, parseInt2, truncate, padRight, scoreColor };
