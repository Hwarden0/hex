'use strict';

const checker  = require('../validation/checker');
const { getLevelName } = require('./levels');

// Time bonuses: faster = more bonus points
function timeFactor(elapsedSeconds, estimatedSeconds) {
  if (elapsedSeconds <= 0 || estimatedSeconds <= 0) return 1.0;
  const ratio = elapsedSeconds / (estimatedSeconds * 60);
  if (ratio <= 0.5)  return 1.20; // under 50% of estimated time: +20%
  if (ratio <= 0.75) return 1.10; // under 75%: +10%
  if (ratio <= 1.0)  return 1.00; // on time: no modifier
  if (ratio <= 1.5)  return 0.95; // up to 50% over: -5%
  return 0.90;                    // way over: -10%
}

// Hint penalty: -5 points per hint used
function hintPenalty(hintsUsed) {
  return (hintsUsed || []).length * 5;
}

// Calculate final score for a case submission
function calculate({ answers, validation, elapsedSeconds, hintsUsed, estimatedTime }) {
  const { results, totalScore } = checker.validateAll(answers, validation);
  const maxScore = Object.values(validation.objectives || {}).reduce((s, r) => s + r.weight, 0);

  // Raw percentage
  const rawPct = maxScore > 0 ? (totalScore / maxScore) * 100 : 0;

  // Time factor
  const tf = timeFactor(elapsedSeconds, estimatedTime || 30);

  // Apply time factor to base score
  const adjusted = Math.min(100, rawPct * tf);

  // Hint penalty
  const penalty = hintPenalty(hintsUsed);

  // Final score (0–100)
  const final = Math.max(0, Math.round(adjusted - penalty));

  return {
    objectiveResults: results,
    rawScore:    Math.round(rawPct),
    adjustedScore: Math.round(adjusted),
    hintPenalty:   penalty,
    finalScore:    final,
    timeFactor:    tf,
    level:         getLevelName(final),
    breakdown: {
      objectives:  totalScore,
      maxObjectives: maxScore,
      timeModifier: `${tf >= 1 ? '+' : ''}${Math.round((tf - 1) * 100)}%`,
      hintDeductions: `-${penalty}pts`,
    },
  };
}

module.exports = { calculate, timeFactor, hintPenalty };
