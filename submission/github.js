'use strict';

// ─── GitHub Submission Module — API-only, no git binary required ─────────────
// This module provides the GitHub submission interface used by the CLI.
// All GitHub interactions go through github-api.js using the REST API.

const chalk    = require('chalk');
const githubApi = require('./github-api');

// Re-export the high-level submission function
const { submitToLeaderboard, loadToken, clearToken, LEADERBOARD_OWNER, LEADERBOARD_REPO } = githubApi;

// Check if GitHub submission is available (always true — no binary dependencies)
function gitAvailable() {
  return true;
}

// Legacy compatibility — not used anymore but kept for any external callers
async function initRepo() {
  return null;
}

async function createSubmissionBranch(user, caseId, submissionData) {
  // This is now handled by submitToLeaderboard
  return { dir: null, branch: null, filePath: `submissions/${user}/${caseId}.json` };
}

async function pushAndPR(user, caseId) {
  // This is now handled by submitToLeaderboard
  return { pushed: false, error: 'Use submitToLeaderboard() instead' };
}

function prInstructions(user, caseId, filePath) {
  return githubApi.manualInstructions({ user, case: caseId });
}

// Clear cached GitHub token (for logout/reset)
function logoutGitHub() {
  clearToken();
}

// Check if a GitHub token is cached
function hasCachedToken() {
  return loadToken() !== null;
}

// Get the cached GitHub username
function getCachedGitHubUser() {
  const token = loadToken();
  return token ? token.user : null;
}

module.exports = {
  gitAvailable,
  initRepo,
  createSubmissionBranch,
  pushAndPR,
  prInstructions,
  REPO_URL: `https://github.com/${LEADERBOARD_OWNER}/${LEADERBOARD_REPO}`,

  // New API
  submitToLeaderboard,
  logoutGitHub,
  hasCachedToken,
  getCachedGitHubUser,
  clearToken,

  // Low-level access (for testing)
  githubApi,
};
