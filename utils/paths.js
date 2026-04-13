'use strict';

const path = require('path');

// In a pkg binary, __dirname becomes a virtual snapshot path.
// We need to resolve assets relative to the binary location.
function assetPath(relativePath) {
  // When packaged with pkg, the snapshot filesystem uses /snapshot/project/...
  // process.pkg.entrypoint tells us where the binary was extracted
  if (process.pkg) {
    // Entry point is the bundled bin/hex.js path inside the snapshot
    const entrypoint = process.argv[1] || '';
    // Find the project root from the entrypoint
    const projectRoot = path.dirname(path.dirname(entrypoint));
    return path.join(projectRoot, relativePath);
  }

  // Development mode: resolve from the actual __dirname of this file
  const projectRoot = path.join(__dirname, '..');
  return path.join(projectRoot, relativePath);
}

// Preload all case log generators at startup so pkg can bundle them.
// This avoids dynamic require() which pkg cannot statically analyze.
function preloadCaseLogGenerators() {
  const generators = {};
  const caseIds = ['case1','case2','case3','case4','case5','case6','case7','case8','case9','case10'];
  for (const id of caseIds) {
    try {
      const p = assetPath(path.join('cases', id, 'logs.js'));
      generators[id] = require(p);
    } catch (err) {
      // In dev mode, fall back to direct require
      try {
        generators[id] = require(path.join(__dirname, '..', 'cases', id, 'logs.js'));
      } catch (_) {
        generators[id] = null;
      }
    }
  }
  return generators;
}

module.exports = { assetPath, preloadCaseLogGenerators };
