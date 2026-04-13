'use strict';

const { signSubmission } = require('../utils/hash');
const { formatFull }     = require('../utils/time');
const store = require('../storage/store');

// Generate a submission JSON object
function generate({ user, caseId, score, elapsedSeconds, answers, queriesUsed, flags = [] }) {
  const submission = {
    user,
    case:         caseId,
    score,
    time:         elapsedSeconds,
    answers:      { ...answers },
    queries_used: queriesUsed || [],
    timestamp:    new Date().toISOString(),
    verified:     flags.length === 0,
    flags:        flags.length > 0 ? flags : undefined,
  };

  // Tamper-evident signature
  submission.sig = signSubmission(submission);

  return submission;
}

// Save submission locally
function save(user, caseId, submission) {
  store.saveSubmission(user, caseId, submission);

  // Also record score
  store.saveScore(caseId, {
    score:     submission.score,
    time:      submission.time,
    timestamp: submission.timestamp,
    verified:  submission.verified,
  });

  return submission;
}

// Get the filepath where a submission will be written for the PR
function submissionFilename(user, caseId) {
  return `submissions/${user}/${caseId}.json`;
}

module.exports = { generate, save, submissionFilename };
