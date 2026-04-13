'use strict';

const path  = require('path');
const fse   = require('fs-extra');
const os    = require('os');
const { execSync, exec } = require('child_process');
const store = require('../storage/store');

const REPO_URL    = 'https://github.com/hex-soc/hex-leaderboard';
const SUBMISSIONS_SUBDIR = 'submissions';

// Check if git is installed
function gitAvailable() {
  try {
    execSync('git --version', { stdio: 'pipe' });
    return true;
  } catch (_) {
    return false;
  }
}

// Resolve the local submissions repo path
function repoDir() {
  return path.join(os.homedir(), '.hex', 'leaderboard-repo');
}

// Initialize or update the local repo
async function initRepo() {
  const dir = repoDir();
  if (fse.existsSync(path.join(dir, '.git'))) {
    // Pull latest
    try {
      execSync('git pull --rebase origin main', { cwd: dir, stdio: 'pipe' });
    } catch (_) {
      // Ignore pull errors (offline mode, etc.)
    }
  } else {
    fse.ensureDirSync(dir);
    // Try to clone; if it fails (no network/perms), init locally
    try {
      execSync(`git clone ${REPO_URL} "${dir}"`, { stdio: 'pipe', timeout: 30000 });
    } catch (_) {
      execSync('git init', { cwd: dir, stdio: 'pipe' });
      execSync('git checkout -b main 2>/dev/null || true', { cwd: dir, stdio: 'pipe' });
    }
  }
  return dir;
}

// Create a submission PR branch and write the submission file
async function createSubmissionBranch(user, caseId, submissionData) {
  const dir    = await initRepo();
  const branch = `hex-submission-${user}-${caseId}`;

  // Ensure we are on main
  try { execSync('git checkout main', { cwd: dir, stdio: 'pipe' }); } catch (_) {}

  // Create/reset branch
  try {
    execSync(`git checkout -b ${branch}`, { cwd: dir, stdio: 'pipe' });
  } catch (_) {
    execSync(`git checkout ${branch}`, { cwd: dir, stdio: 'pipe' });
  }

  // Write submission file
  const subDir = path.join(dir, SUBMISSIONS_SUBDIR, user);
  fse.ensureDirSync(subDir);
  const filePath = path.join(subDir, `${caseId}.json`);
  fse.writeJsonSync(filePath, submissionData, { spaces: 2 });

  // Stage and commit
  execSync('git add .', { cwd: dir, stdio: 'pipe' });
  const msg = `feat(submission): ${user} submitted ${caseId} — score ${submissionData.score}`;
  execSync(`git commit -m "${msg}"`, { cwd: dir, stdio: 'pipe' });

  return { dir, branch, filePath };
}

// Push branch and return PR URL guidance
async function pushAndPR(user, caseId) {
  const dir    = repoDir();
  const branch = `hex-submission-${user}-${caseId}`;

  try {
    execSync(`git push origin ${branch} --force`, { cwd: dir, stdio: 'pipe', timeout: 30000 });
    const prUrl = `${REPO_URL}/compare/main...${branch}?expand=1`;
    return { pushed: true, prUrl };
  } catch (err) {
    return { pushed: false, error: err.message };
  }
}

// Manual instructions if push fails
function prInstructions(user, caseId, filePath) {
  const branch = `hex-submission-${user}-${caseId}`;
  return [
    `Your submission is ready at: ${filePath}`,
    '',
    `To create a Pull Request manually:`,
    `  1. Fork ${REPO_URL}`,
    `  2. Create branch: ${branch}`,
    `  3. Add your submission file: submissions/${user}/${caseId}.json`,
    `  4. Open a PR to main`,
  ];
}

module.exports = {
  gitAvailable,
  initRepo,
  createSubmissionBranch,
  pushAndPR,
  prInstructions,
  REPO_URL,
};
