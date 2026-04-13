'use strict';

const path = require('path');
const os   = require('os');
const { assetPath } = require('../utils/paths');

const HEX_DIR     = path.join(os.homedir(), '.hex');
const SESSIONS_DIR = path.join(HEX_DIR, 'sessions');
const SUBMISSIONS_DIR = path.join(HEX_DIR, 'submissions');

const hexDir        = ()       => HEX_DIR;
const sessionsDir   = ()       => SESSIONS_DIR;
const submissionsDir = ()      => SUBMISSIONS_DIR;
const configPath    = ()       => path.join(HEX_DIR, 'config.json');
const userPath      = ()       => path.join(HEX_DIR, 'user.json');
const scoresPath    = ()       => path.join(HEX_DIR, 'scores.json');
const sessionPath   = (caseId) => path.join(SESSIONS_DIR, `${caseId}.json`);
const submissionPath = (user, caseId) => path.join(SUBMISSIONS_DIR, user, `${caseId}.json`);
const casesDir      = ()       => assetPath('cases');
const caseDir       = (id)     => assetPath(path.join('cases', id));

module.exports = {
  hexDir,
  sessionsDir,
  submissionsDir,
  configPath,
  userPath,
  scoresPath,
  sessionPath,
  submissionPath,
  casesDir,
  caseDir,
};
