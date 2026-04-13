'use strict';

const fs   = require('fs');
const path = require('path');
const { execSync, exec } = require('child_process');

const SPLUNK_PATHS = [
  '/opt/splunk',
  '/usr/local/splunk',
  path.join(require('os').homedir(), 'splunk'),
  '/Applications/Splunk',
  'C:\\Program Files\\Splunk',
  'C:\\Program Files (x86)\\Splunk',
];

// Find the splunk binary
function findSplunkBinary(base) {
  const candidates = [
    path.join(base, 'bin', 'splunk'),
    path.join(base, 'bin', 'splunk.exe'),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return null;
}

// Check all known paths for Splunk
function autoDetect() {
  for (const p of SPLUNK_PATHS) {
    if (fs.existsSync(p)) {
      const bin = findSplunkBinary(p);
      if (bin) return { home: p, binary: bin };
    }
  }
  return null;
}

// Validate a user-provided Splunk path
function validatePath(p) {
  if (!p) return null;
  const expanded = p.replace(/^~/, require('os').homedir());
  if (!fs.existsSync(expanded)) return null;

  // Maybe they gave the bin path directly
  if (fs.existsSync(path.join(expanded, 'bin', 'splunk'))) {
    return { home: expanded, binary: path.join(expanded, 'bin', 'splunk') };
  }

  // Maybe they gave the bin/splunk path itself
  if (fs.statSync(expanded).isFile()) {
    return { home: path.dirname(path.dirname(expanded)), binary: expanded };
  }

  return null;
}

// Get Splunk version
function getVersion(binary) {
  try {
    const out = execSync(`"${binary}" version --accept-license --answer-yes 2>/dev/null`, {
      timeout: 5000,
      stdio: ['pipe', 'pipe', 'pipe'],
    }).toString().trim();
    const m = out.match(/Splunk\s+([\d.]+)/);
    return m ? m[1] : 'unknown';
  } catch (_) {
    return 'unknown';
  }
}

// Check if Splunk process is running
function isRunning() {
  try {
    const out = execSync('pgrep -f splunkd 2>/dev/null || tasklist 2>nul | findstr splunkd', {
      timeout: 3000,
      stdio: ['pipe', 'pipe', 'pipe'],
    }).toString();
    return out.trim().length > 0;
  } catch (_) {
    return false;
  }
}

// Attempt to start Splunk
function start(binary) {
  return new Promise((resolve, reject) => {
    exec(
      `"${binary}" start --accept-license --answer-yes`,
      { timeout: 60000 },
      (err, stdout, stderr) => {
        if (err) reject(new Error(stderr || err.message));
        else resolve(stdout);
      }
    );
  });
}

module.exports = { autoDetect, validatePath, findSplunkBinary, getVersion, isRunning, start, SPLUNK_PATHS };
