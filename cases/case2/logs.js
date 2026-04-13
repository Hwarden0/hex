'use strict';

// Case 2: Credential Stuffing — Login Correlation
// ~5,000 events. Attacker sweeps accounts, only jsmith compromised.
// Answers discoverable via: stats count by src_ip where http_method=POST uri="/login" | sort -count
// Sourcetypes: stream_http, auth, suricata

const { syslogTs, ago, addSeconds } = require('../../utils/time');
const {
  randInt, pick, LEGIT_INTERNAL, COMMON_USERS, NORMAL_UAS, TOOL_UAS,
  kv, streamHttp, auth, suricata, httpBackground, authBackground, SURICATA_SIGS,
} = require('../../utils/logfmt');

function generate() {
  const base = new Date();
  base.setHours(10, 15, 0, 0);

  const HOST    = 'auth-server-01';
  const HOST_IP = '10.0.0.20';
  const ATK_IP  = '10.0.0.55';
  const VICTIM  = 'jsmith';
  const ACCOUNTS = ['jsmith', 'mwilliams', 'tjohnson', 'agarcia', 'klee', 'rbrown', 'cdavis'];

  // ── HTTP events (web login portal) ────────────────────────────────────────
  const httpEvents = [];

  // Dense background: 3 hours of normal web traffic (~3,500 events)
  const bgStart = ago(base, { hours: 3 });
  const bgPaths = ['/index.html', '/dashboard', '/api/v1/users', '/api/v1/settings', '/about', '/help', '/api/v1/metrics', '/css/main.css', '/js/bundle.js', '/images/avatar.png'];
  httpEvents.push(...httpBackground({
    start: bgStart, end: addSeconds(base, 3600), count: 3500,
    destIp: HOST_IP, paths: bgPaths,
  }));

  // ── Credential stuffing sweep via POST /login ─────────────────────────────
  let t = addSeconds(base, 30);
  const sweepAccounts = ['mwilliams', 'tjohnson', 'agarcia', 'klee', 'rbrown'];

  // Sweep: 1-3 attempts per account, rapid-fire
  for (const user of sweepAccounts) {
    const tries = randInt(1, 3);
    for (let i = 0; i < tries; i++) {
      httpEvents.push(streamHttp(t, {
        src_ip: ATK_IP,
        dest_ip: HOST_IP,
        http_method: 'POST',
        uri: '/login',
        status: 401,
        bytes: randInt(120, 300),
        user_agent: pick(TOOL_UAS),
        form_data: `username=${user}&passwd=leaked_pass_${randInt(1000, 9999)}`,
        response_time_ms: randInt(50, 200),
      }));
      t = addSeconds(t, randInt(3, 10));
    }
    t = addSeconds(t, randInt(2, 5));
  }

  // ── 5 failures against jsmith ────────────────────────────────────────────
  for (let i = 0; i < 5; i++) {
    httpEvents.push(streamHttp(t, {
      src_ip: ATK_IP,
      dest_ip: HOST_IP,
      http_method: 'POST',
      uri: '/login',
      status: 401,
      bytes: randInt(120, 300),
      user_agent: pick(TOOL_UAS),
      form_data: `username=jsmith&passwd=leaked_pass_${randInt(1000, 9999)}`,
      response_time_ms: randInt(50, 200),
    }));
    t = addSeconds(t, randInt(5, 12));
  }

  // ── jsmith login success ─────────────────────────────────────────────────
  httpEvents.push(streamHttp(t, {
    src_ip: ATK_IP,
    dest_ip: HOST_IP,
    http_method: 'POST',
    uri: '/login',
    status: 200,
    bytes: randInt(2000, 4000),
    user_agent: pick(TOOL_UAS),
    form_data: `username=jsmith&passwd=correct_password`,
    cookie: `session_id=sess_${randInt(100000, 999999)}`,
    response_time_ms: randInt(100, 300),
  }));

  // ── Post-compromise HTTP activity ────────────────────────────────────────
  const compT = new Date(t);
  // jsmith downloads sensitive data
  httpEvents.push(streamHttp(addSeconds(compT, 120), {
    src_ip: ATK_IP,
    dest_ip: HOST_IP,
    http_method: 'GET',
    uri: '/api/v1/admin/export/users',
    status: 200,
    bytes: randInt(50000, 150000),
    user_agent: pick(TOOL_UAS),
    cookie: `session_id=sess_${randInt(100000, 999999)}`,
    response_time_ms: randInt(500, 2000),
  }));
  // Password change
  httpEvents.push(streamHttp(addSeconds(compT, 300), {
    src_ip: ATK_IP,
    dest_ip: HOST_IP,
    http_method: 'POST',
    uri: '/api/v1/users/jsmith/password',
    status: 200,
    bytes: randInt(100, 300),
    user_agent: pick(TOOL_UAS),
    cookie: `session_id=sess_${randInt(100000, 999999)}`,
    form_data: `new_password=hacked_${randInt(1000,9999)}`,
  }));

  // Normal POST traffic as red herring (legitimate logins)
  let postT = ago(base, { hours: 1 });
  while (postT < addSeconds(base, 3600)) {
    if (Math.random() < 0.15) {
      const success = Math.random() < 0.85;
      httpEvents.push(streamHttp(postT, {
        src_ip: pick(LEGIT_INTERNAL),
        dest_ip: HOST_IP,
        http_method: 'POST',
        uri: '/login',
        status: success ? 200 : 401,
        bytes: randInt(200, 3000),
        user_agent: pick(NORMAL_UAS),
        form_data: `username=${pick(COMMON_USERS)}&passwd=***`,
      }));
    }
    postT = addSeconds(postT, randInt(30, 120));
  }

  // ── Auth events (SSH layer — same host) ──────────────────────────────────
  const authEvents = [];
  authEvents.push(...authBackground({
    start: ago(base, { hours: 3 }), end: addSeconds(base, 3600), count: 500,
    destIp: HOST_IP,
  }));

  // Post-compromise: jsmith SSH session from attacker IP
  const sshT = addSeconds(compT, 600);
  authEvents.push(auth(sshT, {
    src_ip: ATK_IP,
    dest_ip: HOST_IP,
    user: 'jsmith',
    action: 'login_success',
    status: 'success',
    service: 'sshd',
    auth_method: 'password',
  }));
  authEvents.push(auth(addSeconds(sshT, 480), {
    src_ip: ATK_IP,
    dest_ip: HOST_IP,
    user: 'jsmith',
    action: 'logout',
    status: 'success',
    service: 'sshd',
  }));

  // ── Suricata IDS alerts ──────────────────────────────────────────────────
  const suricataEvents = [];
  const sig = SURICATA_SIGS.credential_stuffing;

  // Alerts fire at different stages of the attack
  const alertTimes = [
    addSeconds(base, 120),  // After sweep detected
    addSeconds(base, 200),  // After jsmith failures
    addSeconds(compT, 60),  // After compromise
  ];
  for (const at of alertTimes) {
    suricataEvents.push(suricata(at, {
      src_ip: ATK_IP,
      dest_ip: HOST_IP,
      dest_port: 443,
      proto: 'TCP',
      action: 'alert',
      ...sig,
    }));
  }

  // Background IDS noise
  for (let i = 0; i < 8; i++) {
    const nt = addSeconds(ago(base, { hours: 3 }), randInt(0, 18000));
    suricataEvents.push(suricata(nt, {
      src_ip: pick(LEGIT_INTERNAL),
      dest_ip: HOST_IP,
      dest_port: randInt(1, 65535),
      proto: 'TCP',
      action: 'alert',
      signature: 'ET SCAN Possible Port Scan',
      severity: 'low',
      category: 'attempted-recon',
      sid: 2001216,
    }));
  }

  httpEvents.sort();
  authEvents.sort();
  suricataEvents.sort();

  return [
    { events: httpEvents, sourcetype: 'stream_http', host: HOST },
    { events: authEvents, sourcetype: 'auth', host: HOST },
    { events: suricataEvents, sourcetype: 'suricata', host: HOST },
  ];
}

module.exports = { generate };
