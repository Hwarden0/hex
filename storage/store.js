'use strict';

const fse  = require('fs-extra');
const path = require('path');
const { hexDir, sessionsDir, submissionsDir, userPath, scoresPath, sessionPath, submissionPath } = require('./paths');

// ─── Bootstrap ────────────────────────────────────────────────────────────────
function ensureDirs() {
  fse.ensureDirSync(hexDir());
  fse.ensureDirSync(sessionsDir());
  fse.ensureDirSync(submissionsDir());
}

// ─── User ─────────────────────────────────────────────────────────────────────
function getUser() {
  try { return fse.readJsonSync(userPath()); } catch (_) { return null; }
}

function saveUser(data) {
  ensureDirs();
  fse.writeJsonSync(userPath(), data, { spaces: 2 });
}

// ─── Scores ───────────────────────────────────────────────────────────────────
function getScores() {
  try { return fse.readJsonSync(scoresPath()); } catch (_) { return {}; }
}

function saveScore(caseId, scoreData) {
  ensureDirs();
  const scores = getScores();
  scores[caseId] = { ...scoreData, updatedAt: new Date().toISOString() };
  fse.writeJsonSync(scoresPath(), scores, { spaces: 2 });
}

// ─── Sessions ─────────────────────────────────────────────────────────────────
function getSession(caseId) {
  try { return fse.readJsonSync(sessionPath(caseId)); } catch (_) { return null; }
}

function saveSession(caseId, data) {
  ensureDirs();
  fse.writeJsonSync(sessionPath(caseId), data, { spaces: 2 });
}

function deleteSession(caseId) {
  try { fse.removeSync(sessionPath(caseId)); } catch (_) {}
}

function listSessions() {
  try {
    return fse.readdirSync(sessionsDir())
      .filter((f) => f.endsWith('.json'))
      .map((f) => f.replace('.json', ''));
  } catch (_) { return []; }
}

// ─── Submissions ──────────────────────────────────────────────────────────────
function getSubmission(user, caseId) {
  try { return fse.readJsonSync(submissionPath(user, caseId)); } catch (_) { return null; }
}

function saveSubmission(user, caseId, data) {
  ensureDirs();
  const dir = path.join(submissionsDir(), user);
  fse.ensureDirSync(dir);
  fse.writeJsonSync(submissionPath(user, caseId), data, { spaces: 2 });
}

// ─── Reset ────────────────────────────────────────────────────────────────────
function resetCase(caseId) {
  deleteSession(caseId);
  const scores = getScores();
  delete scores[caseId];
  fse.writeJsonSync(scoresPath(), scores, { spaces: 2 });
}

function resetAll() {
  fse.removeSync(sessionsDir());
  fse.removeSync(scoresPath());
  ensureDirs();
}

module.exports = {
  ensureDirs,
  getUser,
  saveUser,
  getScores,
  saveScore,
  getSession,
  saveSession,
  deleteSession,
  listSessions,
  getSubmission,
  saveSubmission,
  resetCase,
  resetAll,
};
