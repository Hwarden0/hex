'use strict';

const path  = require('path');
const fse   = require('fs-extra');
const os    = require('os');
const { execSync } = require('child_process');
const store  = require('../storage/store');
const levels = require('../scoring/levels');

const REPO_URL   = 'https://github.com/hex-soc/hex-leaderboard';
const CACHE_DIR  = path.join(os.homedir(), '.hex', 'leaderboard-cache');
const CACHE_FILE = path.join(CACHE_DIR, 'leaderboard.json');
const CACHE_TTL  = 3600 * 1000; // 1 hour

// Try to fetch leaderboard from the remote repo submissions directory
async function fetchRemote() {
  try {
    const repoDir = path.join(os.homedir(), '.hex', 'leaderboard-repo');
    const subDir  = path.join(repoDir, 'submissions');

    if (!fse.existsSync(subDir)) return null;

    const entries = buildFromDir(subDir);
    fse.ensureDirSync(CACHE_DIR);
    fse.writeJsonSync(CACHE_FILE, { entries, updatedAt: new Date().toISOString() }, { spaces: 2 });
    return entries;
  } catch (_) {
    return null;
  }
}

// Build leaderboard from local submissions directory
function buildFromDir(subDir) {
  const board = {};

  try {
    const users = fse.readdirSync(subDir);
    for (const user of users) {
      const userDir = path.join(subDir, user);
      if (!fse.statSync(userDir).isDirectory()) continue;

      const files = fse.readdirSync(userDir).filter((f) => f.endsWith('.json'));
      let totalScore = 0;
      let caseCount  = 0;

      for (const file of files) {
        try {
          const sub = fse.readJsonSync(path.join(userDir, file));
          if (sub.score !== undefined) {
            totalScore += sub.score;
            caseCount++;
          }
        } catch (_) {}
      }

      if (caseCount > 0) {
        const avg = Math.round(totalScore / caseCount);
        board[user] = {
          user,
          score:  avg,
          total:  totalScore,
          cases:  caseCount,
          level:  levels.getLevelName(avg),
        };
      }
    }
  } catch (_) {}

  return Object.values(board).sort((a, b) => b.score - a.score);
}

// Get leaderboard (from cache or local submissions)
async function get() {
  // Try cache first
  if (fse.existsSync(CACHE_FILE)) {
    try {
      const cached = fse.readJsonSync(CACHE_FILE);
      const age    = Date.now() - new Date(cached.updatedAt).getTime();
      if (age < CACHE_TTL && cached.entries) return cached.entries;
    } catch (_) {}
  }

  // Try remote
  const remote = await fetchRemote();
  if (remote) return remote;

  // Fall back to local submissions
  const localSubDir = path.join(os.homedir(), '.hex', 'submissions');
  return buildFromDir(localSubDir);
}

module.exports = { get, fetchRemote, buildFromDir };
