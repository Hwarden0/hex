'use strict';

var axios = require('axios');
var https = require('https');
var net = require('net');
var config = require('../core/config');

var agent = new https.Agent({ rejectUnauthorized: false, family: 4 });
var _sessionKey = null;

function baseURL() {
  return config.splunkUrl();
}

function headers(extra) {
  if (!extra) extra = {};
  var h = { 'Content-Type': 'application/x-www-form-urlencoded' };
  if (_sessionKey) h['Authorization'] = 'Splunk ' + _sessionKey;
  return Object.assign({}, h, extra);
}

async function login() {
  var cfg = config.load();
  var params = new URLSearchParams({
    username: cfg.splunk.username,
    password: cfg.splunk.password,
    output_mode: 'json',
  });
  var res = await axios.post(baseURL() + '/services/auth/login', params.toString(), {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    httpsAgent: agent,
    timeout: 10000,
  });
  _sessionKey = res.data.sessionKey;
  return _sessionKey;
}

async function ensureAuth() {
  if (!_sessionKey) await login();
}

async function ping() {
  var cfg = config.load();
  return new Promise(function(resolve) {
    var sock = net.connect({
      host: cfg.splunk.host,
      port: cfg.splunk.port,
      timeout: 3000,
      family: 4,
    });
    sock.on('connect', function() {
      sock.end();
      resolve(true);
    });
    sock.on('error', function() {
      resolve(false);
    });
    sock.on('timeout', function() {
      sock.destroy();
      resolve(false);
    });
  });
}

async function authenticate() {
  try {
    await login();
    return true;
  } catch (err) {
    if (err.response && err.response.status === 401) return false;
    throw err;
  }
}

async function indexExists(name) {
  await ensureAuth();
  try {
    var res = await axios.get(baseURL() + '/services/data/indexes/' + name + '?output_mode=json', {
      headers: headers(),
      httpsAgent: agent,
      timeout: 8000,
    });
    return res.status === 200;
  } catch (err) {
    if (err.response && err.response.status === 404) return false;
    throw err;
  }
}

async function createIndex(name) {
  await ensureAuth();
  var params = new URLSearchParams({ name: name, output_mode: 'json' });
  await axios.post(baseURL() + '/services/data/indexes', params.toString(), {
    headers: headers(),
    httpsAgent: agent,
    timeout: 15000,
  });
}

async function ensureIndex(name) {
  if (!(await indexExists(name))) {
    await createIndex(name);
    await new Promise(function(r) { setTimeout(r, 2000); });
  }
}

async function ingestEvents(events, opts) {
  if (!opts) opts = {};
  await ensureAuth();
  var cfg = config.load();
  var idx = opts.index || cfg.splunk.index;
  var src = opts.host || 'hex-lab';
  var st = opts.sourcetype || 'hex_generic';

  for (var i = 0; i < events.length; i++) {
    var line = events[i];
    // Strip syslog timestamp prefix so Splunk assigns current time.
    // Splunk free license drops events with future timestamps, so
    // we remove the timestamp and let Splunk use the ingestion time.
    line = line.replace(
      /^[A-Z][a-z]{2}\s+\d{1,2}\s+\d{2}:\d{2}:\d{2}\s+/,
      ''
    );
    var params = new URLSearchParams({
      index: idx,
      sourcetype: st,
      host: src,
    });
    try {
      await axios.post(
        baseURL() + '/services/receivers/simple?' + params.toString(),
        line,
        {
          headers: Object.assign({}, headers(), { 'Content-Type': 'text/plain' }),
          httpsAgent: agent,
          timeout: 15000,
        }
      );
    } catch (e) {
      if (process.env.HEX_DEBUG) {
        console.error('Ingest error at event ' + i + ': ' + e.message);
      }
    }
    if ((i + 1) % 50 === 0 && i < events.length - 1) {
      await new Promise(function(r) { setTimeout(r, 200); });
    }
  }
}

async function search(spl, opts) {
  if (!opts) opts = {};
  var earliestTime = opts.earliestTime || '-24h';
  var latestTime = opts.latestTime || 'now';
  var maxResults = opts.maxResults || 100;
  await ensureAuth();
  var jobParams = new URLSearchParams({
    search: 'search ' + spl,
    output_mode: 'json',
    earliest_time: earliestTime,
    latest_time: latestTime,
  });
  var jobRes = await axios.post(baseURL() + '/services/search/jobs', jobParams.toString(), {
    headers: headers(),
    httpsAgent: agent,
    timeout: 15000,
  });
  var sid = jobRes.data.sid;
  for (var attempt = 0; attempt < 60; attempt++) {
    await new Promise(function(r) { setTimeout(r, 1000); });
    var statusRes = await axios.get(
      baseURL() + '/services/search/jobs/' + sid + '?output_mode=json',
      { headers: headers(), httpsAgent: agent, timeout: 10000 }
    );
    var entry = statusRes.data.entry[0];
    var content = entry.content;
    if (content.dispatchState === 'DONE') {
      var resultRes = await axios.get(
        baseURL() + '/services/search/jobs/' + sid + '/results?output_mode=json&count=' + maxResults,
        { headers: headers(), httpsAgent: agent, timeout: 10000 }
      );
      return resultRes.data.results || [];
    }
    if (content.dispatchState === 'FAILED') {
      throw new Error('Search job failed: ' + content.messages);
    }
  }
  throw new Error('Search job timed out');
}

async function countEvents(index, sourcetypePrefix) {
  var spl = 'index=' + index + ' sourcetype="' + sourcetypePrefix + '*" | stats count';
  try {
    var results = await search(spl, { earliestTime: '-365d' });
    if (results.length > 0) return parseInt(results[0].count || '0', 10);
    return 0;
  } catch (e) {
    return 0;
  }
}

module.exports = {
  login: login,
  ping: ping,
  authenticate: authenticate,
  indexExists: indexExists,
  createIndex: createIndex,
  ensureIndex: ensureIndex,
  ingestEvents: ingestEvents,
  search: search,
  countEvents: countEvents,
};
