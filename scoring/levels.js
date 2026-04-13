'use strict';

const LEVELS = [
  { min: 0,   max: 39,  name: 'Beginner',          badge: '○' },
  { min: 40,  max: 59,  name: 'Junior Analyst',     badge: '◔' },
  { min: 60,  max: 79,  name: 'Intermediate',       badge: '◑' },
  { min: 80,  max: 94,  name: 'Senior Analyst',     badge: '◕' },
  { min: 95,  max: 100, name: 'Expert',             badge: '●' },
];

function getLevel(score) {
  return LEVELS.find((l) => score >= l.min && score <= l.max) || LEVELS[0];
}

function getLevelName(score) {
  return getLevel(score).name;
}

// Calculate overall level from all case scores
function overallLevel(scores) {
  const vals = Object.values(scores).map((s) => s.score || 0);
  if (vals.length === 0) return LEVELS[0];
  const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
  return getLevel(Math.round(avg));
}

module.exports = { LEVELS, getLevel, getLevelName, overallLevel };
