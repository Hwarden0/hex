'use strict';

const { elapsedSince } = require('../utils/time');
const store = require('../storage/store');

// Anti-cheat validation
// Returns { passed: bool, flags: string[] }
function validate(submission, session, validation) {
  const flags = [];

  // 1. Minimum time threshold
  const minTime = validation.anti_cheat?.min_time || validation.min_time_seconds || 60;
  const elapsed = session
    ? Math.floor((Date.now() - new Date(session.startedAt).getTime()) / 1000)
    : submission.time;

  if (elapsed < minTime) {
    flags.push(`FAST_SUBMISSION: Completed in ${elapsed}s (min: ${minTime}s)`);
  }

  // 2. All-correct too fast
  const allCorrectThreshold = validation.anti_cheat?.flag_if_all_correct_under || 60;
  const allCorrect = submission.score >= 95;
  if (allCorrect && elapsed < allCorrectThreshold) {
    flags.push(`SUSPICIOUS_PERFECT_SCORE: Perfect score in ${elapsed}s`);
  }

  // 3. Duplicate submission check (same case submitted multiple times very quickly)
  const scores = store.getScores();
  const existing = scores[submission.case];
  if (existing) {
    const timeSinceLast = elapsedSince(existing.updatedAt);
    if (timeSinceLast < 300) { // 5 minutes
      flags.push(`RAPID_RESUBMISSION: Same case submitted ${Math.floor(timeSinceLast)}s ago`);
    }
  }

  // 4. Check required fields are present
  const required = ['user', 'case', 'score', 'timestamp', 'answers'];
  for (const f of required) {
    if (!submission[f]) flags.push(`MISSING_FIELD: ${f}`);
  }

  const passed  = flags.length === 0;
  const warning = flags.length > 0 && flags.every((f) => f.startsWith('FAST'));

  return { passed: passed || warning, flags, warning };
}

module.exports = { validate };
