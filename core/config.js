'use strict';

const path = require('path');
const fse  = require('fs-extra');
const { hexDir, configPath } = require('../storage/paths');

const DEFAULTS = {
  splunk: {
    host: '127.0.0.1',
    port: 8089,
    username: 'admin',
    password: 'changeme',
    scheme: 'https',
    verifySSL: false,
    index: 'hex_lab',
  },
  user: {
    name: null,
    githubUser: null,
  },
  initialized: false,
  version: '1.0.0',
};

function load() {
  try {
    if (fse.existsSync(configPath())) {
      const raw = fse.readJsonSync(configPath());
      return Object.assign({}, DEFAULTS, raw, {
        splunk: Object.assign({}, DEFAULTS.splunk, raw.splunk || {}),
        user:   Object.assign({}, DEFAULTS.user,   raw.user   || {}),
      });
    }
  } catch (_) {}
  return Object.assign({}, DEFAULTS);
}

function save(cfg) {
  fse.ensureDirSync(hexDir());
  fse.writeJsonSync(configPath(), cfg, { spaces: 2 });
}

function get(key) {
  const cfg = load();
  return key.split('.').reduce((o, k) => (o && o[k] !== undefined ? o[k] : undefined), cfg);
}

function set(key, value) {
  const cfg = load();
  const keys = key.split('.');
  let obj = cfg;
  for (let i = 0; i < keys.length - 1; i++) {
    if (!obj[keys[i]]) obj[keys[i]] = {};
    obj = obj[keys[i]];
  }
  obj[keys[keys.length - 1]] = value;
  save(cfg);
}

function splunkUrl(path_ = '') {
  const cfg = load();
  const base = `${cfg.splunk.scheme}://${cfg.splunk.host}:${cfg.splunk.port}`;
  return path_ ? `${base}${path_}` : base;
}

module.exports = { load, save, get, set, splunkUrl, DEFAULTS };
