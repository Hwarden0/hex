'use strict';

const registry  = require('../cases/registry');
const checker   = require('../validation/checker');
const session   = require('./session');

// Build a progress report for a case session
function report(caseId) {
  const caseObj = registry.get(caseId);
  const s       = session.load(caseId);
  if (!caseObj || !s) return null;

  const validation = caseObj.validation;
  const objectives = caseObj.scenario.objectives || [];
  const answers    = s.answers || {};

  const rows = objectives.map((obj) => {
    const rule  = validation ? validation.objectives[obj.answer_key] : null;
    const given = answers[obj.answer_key];
    let done    = false;
    let partial = null;

    if (rule && given !== undefined) {
      const result = checker.checkObjective(given, rule);
      done    = result.correct;
      partial = result.partial ? Math.round(obj.points * 0.5) : null;
    }

    return {
      label:   obj.label,
      done,
      partial,
      points:  obj.points,
    };
  });

  const completedPoints = rows.reduce((sum, r) => {
    if (r.done)         return sum + r.points;
    if (r.partial)      return sum + r.partial;
    return sum;
  }, 0);

  const totalPoints = rows.reduce((sum, r) => sum + r.points, 0);
  const pct         = totalPoints > 0 ? Math.round((completedPoints / totalPoints) * 100) : 0;

  return {
    rows,
    completedPoints,
    totalPoints,
    pct,
    hintsUsed:   s.hintsUsed || [],
    elapsed:     session.elapsed(caseId),
    status:      s.status,
  };
}

module.exports = { report };
