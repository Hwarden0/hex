'use strict';

const { normalizeAnswer, ipEqual, withinTolerance, parseInt2 } = require('../utils/format');

// Check a single objective answer against validation rule
function checkObjective(given, rule) {
  if (given === undefined || given === null || given === '') {
    return { correct: false, partial: false, reason: 'No answer provided' };
  }

  const g = normalizeAnswer(given);

  switch (rule.type) {
    case 'ip':
      return { correct: ipEqual(g, rule.value), partial: false };

    case 'string': {
      const expected = normalizeAnswer(rule.value);
      if (g === expected) return { correct: true, partial: false };
      const aliases = (rule.aliases || []).map(normalizeAnswer);
      if (aliases.includes(g)) return { correct: true, partial: false };
      return { correct: false, partial: false };
    }

    case 'integer': {
      const n = parseInt2(g);
      if (n === null) return { correct: false, partial: false, reason: 'Not a number' };
      const tol = rule.tolerance || 0;
      if (tol > 0) {
        return { correct: withinTolerance(n, rule.value, tol), partial: false };
      }
      return { correct: n === rule.value, partial: false };
    }

    case 'boolean_text': {
      const aliases = (rule.aliases || []).map(normalizeAnswer);
      return { correct: aliases.includes(g) || g === normalizeAnswer(rule.value), partial: false };
    }

    case 'set': {
      // Given may be comma-separated
      const givenSet  = g.split(/[\s,]+/).map((s) => s.trim()).filter(Boolean).sort().join(',');
      const aliases   = (rule.aliases || []).map(normalizeAnswer);
      if (aliases.map((a) => a.split(/[\s,]+/).sort().join(',')).includes(givenSet)) {
        return { correct: true, partial: false };
      }
      const expected  = (rule.value || []).map(normalizeAnswer).sort().join(',');
      return { correct: givenSet === expected, partial: false };
    }

    case 'ordered_list': {
      const givenList   = g.split(/[\s,]+/).map((s) => s.trim()).filter(Boolean).join(',');
      const expected    = (rule.value || []).map(normalizeAnswer).join(',');
      const aliases     = (rule.aliases || []).map(normalizeAnswer);
      return {
        correct: givenList === expected || aliases.includes(givenList),
        partial: false,
      };
    }

    case 'time_hhmm': {
      // Accept HH:MM format, within tolerance_minutes
      const tolMin = rule.tolerance_minutes || 0;
      const [rH, rM] = rule.value.split(':').map(Number);
      const [gH, gM] = g.replace(/[^0-9:]/g, '').split(':').map(Number);
      if (isNaN(gH) || isNaN(gM)) return { correct: false, partial: false };
      const diff = Math.abs((gH * 60 + gM) - (rH * 60 + rM));
      return { correct: diff <= tolMin, partial: false };
    }

    case 'set_partial': {
      // Partial credit for getting at least min_match items
      const givenItems = g.split(/[\s,\-]+/).map((s) => s.trim().toLowerCase()).filter(Boolean);
      const expected   = (rule.value || []).map((s) => s.toLowerCase());
      const minMatch   = rule.min_match || expected.length;
      const matches    = givenItems.filter((i) => expected.some((e) => e.includes(i) || i.includes(e)));
      if (matches.length >= expected.length) return { correct: true, partial: false };
      if (matches.length >= minMatch)        return { correct: false, partial: true };
      return { correct: false, partial: false };
    }

    default:
      return { correct: normalizeAnswer(given) === normalizeAnswer(rule.value), partial: false };
  }
}

// Validate all answers for a case and return scored results
function validateAll(answers, validation) {
  const results = {};
  let totalScore = 0;

  for (const [key, rule] of Object.entries(validation.objectives || {})) {
    const given  = answers[key];
    const result = checkObjective(given, rule);
    const pts    = result.correct ? rule.weight
                 : result.partial ? Math.round(rule.weight * 0.5)
                 : 0;
    results[key] = { ...result, points: pts, maxPoints: rule.weight };
    totalScore  += pts;
  }

  return { results, totalScore };
}

// Check if query patterns were covered
function checkQueryPatterns(queriesUsed, patterns) {
  if (!patterns || patterns.length === 0) return true;
  return patterns.every((p) =>
    queriesUsed.some((q) => q.toLowerCase().includes(p.toLowerCase()))
  );
}

module.exports = { checkObjective, validateAll, checkQueryPatterns };
