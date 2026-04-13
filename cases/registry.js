'use strict';

const path = require('path');
const fse  = require('fs-extra');
const { assetPath } = require('../utils/paths');

const CASE_IDS = ['case1','case2','case3','case4','case5','case6','case7','case8','case9','case10'];

function caseDir(id) {
  return assetPath(path.join('cases', id));
}

function readJson(id, file) {
  const p = path.join(caseDir(id), file);
  if (!fse.existsSync(p)) return null;
  return fse.readJsonSync(p);
}

function get(id) {
  if (!CASE_IDS.includes(id)) return null;
  const metadata   = readJson(id, 'metadata.json');
  const scenario   = readJson(id, 'scenario.json');
  const validation = readJson(id, 'validation.json');
  if (!metadata || !scenario) return null;
  return { ...metadata, scenario, validation };
}

function list() {
  return CASE_IDS;
}

function listAll() {
  return CASE_IDS.map(get).filter(Boolean);
}

function getScenario(id) {
  return readJson(id, 'scenario.json');
}

function getSolution(id) {
  return readJson(id, 'solution.json');
}

function getValidation(id) {
  return readJson(id, 'validation.json');
}

function exists(id) {
  return CASE_IDS.includes(id) && fse.existsSync(caseDir(id));
}

module.exports = { get, list, listAll, getScenario, getSolution, getValidation, exists, CASE_IDS };
