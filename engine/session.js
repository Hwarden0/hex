'use strict';

const store    = require('../storage/store');
const registry = require('../cases/registry');

// ─── Create a new session ─────────────────────────────────────────────────────
function create(caseId) {
  const caseObj = registry.get(caseId);
  if (!caseObj) throw new Error(`Unknown case: ${caseId}`);

  const session = {
    caseId,
    startedAt:   new Date().toISOString(),
    hintsUsed:   [],
    queriesUsed: [],
    answers:     {},
    partial:     {},
    status:      'active', // active | submitted | abandoned
  };

  store.saveSession(caseId, session);
  return session;
}

// ─── Load an active session ───────────────────────────────────────────────────
function load(caseId) {
  return store.getSession(caseId);
}

// ─── Update session ───────────────────────────────────────────────────────────
function update(caseId, delta) {
  const session = load(caseId);
  if (!session) throw new Error(`No active session for ${caseId}`);
  const updated = Object.assign({}, session, delta);
  store.saveSession(caseId, updated);
  return updated;
}

// ─── Record a hint ────────────────────────────────────────────────────────────
function recordHint(caseId, hintIndex) {
  const session = load(caseId);
  if (!session) return;
  if (!session.hintsUsed.includes(hintIndex)) {
    session.hintsUsed.push(hintIndex);
    store.saveSession(caseId, session);
  }
}

// ─── Record a query ───────────────────────────────────────────────────────────
function recordQuery(caseId, spl) {
  const session = load(caseId);
  if (!session) return;
  session.queriesUsed = session.queriesUsed || [];
  if (!session.queriesUsed.includes(spl)) {
    session.queriesUsed.push(spl);
    store.saveSession(caseId, session);
  }
}

// ─── Check if session is active ───────────────────────────────────────────────
function isActive(caseId) {
  const s = load(caseId);
  return s && s.status === 'active';
}

// ─── Get elapsed seconds ──────────────────────────────────────────────────────
function elapsed(caseId) {
  const s = load(caseId);
  if (!s) return 0;
  return Math.floor((Date.now() - new Date(s.startedAt).getTime()) / 1000);
}

// ─── Mark session complete ────────────────────────────────────────────────────
function complete(caseId, answers) {
  return update(caseId, { status: 'submitted', answers, completedAt: new Date().toISOString() });
}

// ─── Abandon session ──────────────────────────────────────────────────────────
function abandon(caseId) {
  return update(caseId, { status: 'abandoned' });
}

module.exports = { create, load, update, recordHint, recordQuery, isActive, elapsed, complete, abandon };
