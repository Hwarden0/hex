'use strict';

const chalk = require('chalk');
const boxen = require('boxen');

// --- Color Palette ---
const C = {
  red:     (s) => chalk.red(s),
  yellow:  (s) => chalk.yellow(s),
  green:   (s) => chalk.green(s),
  cyan:    (s) => chalk.cyan(s),
  white:   (s) => chalk.white(s),
  gray:    (s) => chalk.gray(s),
  bold:    (s) => chalk.bold(s),
  dim:     (s) => chalk.dim(s),
  redBold: (s) => chalk.bold.red(s),
  greenBold: (s) => chalk.bold.green(s),
  yellowBold: (s) => chalk.bold.yellow(s),
  cyanBold: (s) => chalk.bold.cyan(s),
};

// --- Banner ---
function banner() {
const lines = [
"██╗  ██╗███████╗██╗  ██╗",
"██║  ██║██╔════╝╚██╗██╔╝",
"███████║█████╗   ╚███╔╝ ",
"██╔══██║██╔══╝   ██╔██╗ ",
"██║  ██║███████╗██╔╝ ██╗",
"╚═╝  ╚═╝╚══════╝╚═╝  ╚═╝"
];
  console.log('');
  lines.forEach(function(ln) {
    console.log(chalk.red('    ' + ln));
  });
  console.log('');
  console.log(chalk.gray('    ══════════════════'));
  console.log('    ' + chalk.yellow('Where Logs Become Evidence'));
  console.log('');
}

// --- Section separator ---
function separator(width) {
  if (!width) width = 50;
  console.log(chalk.gray('-'.repeat(width)));
}

// --- SOC Alert Box ---
function alert(opts) {
  if (!opts) opts = {};
  var time = opts.time || timestamp();
  var target = opts.target || '';
  var type = opts.type || '';
  var severity = opts.severity || 'HIGH';
  var status = opts.status || 'ACTIVE';
  var details = opts.details || [];

  var severityColor = severity === 'CRITICAL' ? C.red : severity === 'HIGH' ? C.yellow : C.cyan;

  var lines = [
    time + '  !! ALERT TRIGGERED',
    '',
    '  Target   : ' + target,
    '  Type     : ' + type,
    '  Severity : ' + severityColor(severity),
    '  Status   : ' + chalk.bold.red(status),
  ];

  if (details.length > 0) {
    lines.push('');
    details.forEach(function(d) { lines.push('  > ' + d); });
  }

  var box = boxen(lines.join('\n'), {
    padding: { top: 0, bottom: 0, left: 1, right: 2 },
    borderStyle: 'single',
    borderColor: 'yellow',
    title: '  HEX INCIDENT  ',
    titleAlignment: 'center',
  });

  console.log('\n' + box + '\n');
}

// --- Info Box ---
function infoBox(title, lines) {
  var content = lines.map(function(l) {
    if (l === '') return '';
    if (l.charAt(0) === '!') return chalk.yellow(l.slice(1).trim());
    if (l.charAt(0) === '>') return chalk.cyan('  > ') + chalk.white(l.slice(1).trim());
    if (l.charAt(0) === '#') return chalk.bold.white(l.slice(1).trim());
    return chalk.gray('  ') + chalk.white(l);
  }).join('\n');

  var box = boxen(content, {
    padding: { top: 0, bottom: 0, left: 1, right: 2 },
    borderStyle: 'round',
    borderColor: 'cyan',
    title: '  ' + title + '  ',
    titleAlignment: 'left',
  });

  console.log('\n' + box + '\n');
}

// --- Status Table ---
function statusTable(rows) {
  var Table = require('cli-table3');
  var t = new Table({
    head: [chalk.bold.cyan('Objective'), chalk.bold.cyan('Status'), chalk.bold.cyan('Points')],
    style: { head: [], border: ['gray'] },
    chars: {
      top: '-', 'top-mid': '+', 'top-left': '+', 'top-right': '+',
      bottom: '-', 'bottom-mid': '+', 'bottom-left': '+', 'bottom-right': '+',
      left: '|', 'left-mid': '+', mid: '-', 'mid-mid': '+',
      right: '|', 'right-mid': '+', middle: '|',
    },
  });

  rows.forEach(function(r) {
    var icon = r.done ? chalk.green('[x]') : r.partial ? chalk.yellow('[~]') : chalk.red('[ ]');
    var pts  = r.done ? chalk.green('+' + r.points) : r.partial ? chalk.yellow('+' + r.partial) : chalk.gray(String(r.points));
    t.push([chalk.white(r.label), icon, pts]);
  });

  console.log(t.toString());
}

// --- Progress Bar ---
function progressBar(pct, width) {
  if (!width) width = 30;
  var filled = Math.round((pct / 100) * width);
  var empty  = width - filled;
  var bar    = chalk.green('#'.repeat(filled)) + chalk.gray('-'.repeat(empty));
  var label  = pct < 40 ? C.red(pct + '%') : pct < 80 ? C.yellow(pct + '%') : C.green(pct + '%');
  return '[' + bar + '] ' + label;
}

// --- Log line ---
function log(level, msg) {
  var ts = chalk.gray('[' + timestamp() + ']');
  switch (level) {
    case 'ok':   console.log(ts + ' [OK]  ' + chalk.white(msg)); break;
    case 'fail': console.log(ts + ' [FAIL] ' + chalk.red(msg)); break;
    case 'warn': console.log(ts + ' [WARN] ' + chalk.yellow(msg)); break;
    case 'info': console.log(ts + ' [INFO] ' + chalk.cyan(msg)); break;
    case 'step': console.log(ts + '        ' + chalk.gray(msg)); break;
    default:     console.log(ts + '        ' + chalk.white(msg));
  }
}

// --- Leaderboard Table ---
function leaderboard(entries, currentUser) {
  var Table = require('cli-table3');
  var t = new Table({
    head: [
      chalk.bold.cyan('Rank'),
      chalk.bold.cyan('User'),
      chalk.bold.cyan('Score'),
      chalk.bold.cyan('Cases'),
      chalk.bold.cyan('Level'),
    ],
    style: { head: [], border: ['gray'] },
    colAligns: ['right', 'left', 'right', 'right', 'left'],
    chars: {
      top: '-', 'top-mid': '+', 'top-left': '+', 'top-right': '+',
      bottom: '-', 'bottom-mid': '+', 'bottom-left': '+', 'bottom-right': '+',
      left: '|', 'left-mid': '+', mid: '-', 'mid-mid': '+',
      right: '|', 'right-mid': '+', middle: '|',
    },
  });

  entries.slice(0, 25).forEach(function(e, i) {
    var rank = i + 1;
    var medal = rank === 1 ? ' 1' : rank === 2 ? ' 2' : rank === 3 ? ' 3' : ' ' + rank;
    var isMe  = e.user === currentUser;
    var row   = [
      isMe ? chalk.bold.cyan(medal) : chalk.gray(medal),
      isMe ? chalk.bold.cyan(e.user + ' <') : chalk.white(e.user),
      isMe ? chalk.bold.cyan(String(e.score)) : chalk.white(String(e.score)),
      chalk.gray(String(e.cases || 0)),
      chalk.gray(e.level || '-'),
    ];
    t.push(row);
  });

  console.log('\n' + t.toString());
}

// --- Hint Box ---
function hint(n, text) {
  var content = 'HINT #' + n + '  (-5 pts)\n\n  ' + text;
  var box = boxen(content, {
    padding: { top: 0, bottom: 0, left: 1, right: 2 },
    borderStyle: 'double',
    borderColor: 'yellow',
  });
  console.log('\n' + box + '\n');
}

// --- Error ---
function error(msg, detail) {
  var lines = ['ERROR  ' + msg];
  if (detail) lines.push('\n  ' + detail);
  var box = boxen(lines.join(''), {
    padding: { top: 0, bottom: 0, left: 1, right: 2 },
    borderStyle: 'single',
    borderColor: 'red',
  });
  console.error('\n' + box + '\n');
}

// --- Success ---
function success(msg) {
  var box = boxen('[OK]  ' + msg, {
    padding: { top: 0, bottom: 0, left: 1, right: 2 },
    borderStyle: 'single',
    borderColor: 'green',
  });
  console.log('\n' + box + '\n');
}

// --- Timestamp ---
function timestamp() {
  return new Date().toTimeString().slice(0, 8);
}

module.exports = {
  C,
  banner,
  separator,
  alert,
  infoBox,
  statusTable,
  progressBar,
  log,
  leaderboard,
  hint,
  error,
  success,
  timestamp,
};
