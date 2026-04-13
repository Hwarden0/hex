'use strict';

// Case 10: Multi-Stage Attack — Full Kill Chain (APT Simulation)
// ~15,000 events. SQLi → Webshell → PrivEsc → Lateral Movement → Exfiltration.
// Answers require multiple SPL queries across sourcetypes.
// Sourcetypes: stream_http, auth, audit, mysql, firewall, suricata

const { syslogTs, ago, addSeconds } = require('../../utils/time');
const {
  randInt, pick, LEGIT_INTERNAL, LEGIT_EXTERNAL, COMMON_USERS, SERVICE_USERS,
  NORMAL_UAS, TOOL_UAS, BRUTE_FORCE_USERS,
  kv, streamHttp, auth, audit, mysql, firewall, suricata,
  httpBackground, authBackground, fwBackground, SURICATA_SIGS,
} = require('../../utils/logfmt');

function generate() {
  const base = new Date();
  base.setHours(22, 0, 0, 0);

  const ATK_IP     = '185.220.101.55';
  const EXFIL_IP   = '185.220.101.55';
  const WEB_HOST   = 'web-app-01';
  const WEB_IP     = '10.0.0.90';
  const DB_HOST    = 'db-server-02';
  const DB_IP      = '10.0.0.91';
  const ADMIN_HOST = 'mgmt-server-01';
  const ADMIN_IP   = '10.0.0.92';

  // ── HTTP events ───────────────────────────────────────────────────────────
  const httpEvents = [];

  // Dense background: 6 hours of normal web traffic (~5,000 events)
  const bgStart = ago(base, { hours: 6 });
  const bgPaths = ['/index.html', '/login.php', '/dashboard', '/api/v1/users', '/api/v1/settings', '/about', '/help', '/css/style.css', '/js/bundle.js', '/api/v1/health', '/images/logo.png'];
  httpEvents.push(...httpBackground({
    start: bgStart, end: addSeconds(base, 7200), count: 5000,
    destIp: WEB_IP, paths: bgPaths,
  }));

  // ════════════════════════════════════════════════════════
  // STAGE 1: SQL Injection (22:00–22:08)
  // ════════════════════════════════════════════════════════
  let t = new Date(base);
  httpEvents.push(streamHttp(t, {
    src_ip: ATK_IP, dest_ip: WEB_IP, http_method: 'GET',
    uri: '/login.php?user=admin&pass=test', status: 200, bytes: 1843,
    user_agent: 'sqlmap/1.7.8',
  }));
  t = addSeconds(t, 2);
  httpEvents.push(streamHttp(t, {
    src_ip: ATK_IP, dest_ip: WEB_IP, http_method: 'GET',
    uri: "/login.php?user=admin'--", status: 500, bytes: 12,
    user_agent: 'sqlmap/1.7.8',
  }));
  t = addSeconds(t, 1);
  httpEvents.push(streamHttp(t, {
    src_ip: ATK_IP, dest_ip: WEB_IP, http_method: 'GET',
    uri: "/login.php?user=admin'+OR+'1'='1", status: 200, bytes: 5234,
    user_agent: 'sqlmap/1.7.8',
  }));
  t = addSeconds(t, 2);
  httpEvents.push(streamHttp(t, {
    src_ip: ATK_IP, dest_ip: WEB_IP, http_method: 'GET',
    uri: '/login.php?user=1+UNION+SELECT+username,password,3+FROM+users--', status: 200, bytes: 8823,
    user_agent: 'sqlmap/1.7.8',
  }));
  t = addSeconds(t, 3);
  httpEvents.push(streamHttp(t, {
    src_ip: ATK_IP, dest_ip: WEB_IP, http_method: 'GET',
    uri: '/login.php?user=1+UNION+SELECT+table_name,2,3+FROM+information_schema.tables--', status: 200, bytes: 31204,
    user_agent: 'sqlmap/1.7.8',
  }));
  t = addSeconds(t, 4);
  httpEvents.push(streamHttp(t, {
    src_ip: ATK_IP, dest_ip: WEB_IP, http_method: 'GET',
    uri: '/login.php?user=1+UNION+SELECT+username,password,email+FROM+users--', status: 200, bytes: 48829,
    user_agent: 'sqlmap/1.7.8',
  }));

  // ════════════════════════════════════════════════════════
  // STAGE 2: Webshell Upload + RCE (22:10–22:15)
  // ════════════════════════════════════════════════════════
  t = addSeconds(base, 600);
  httpEvents.push(streamHttp(t, {
    src_ip: ATK_IP, dest_ip: WEB_IP, http_method: 'POST',
    uri: '/admin/upload.php', status: 200, bytes: 38,
    user_agent: 'Mozilla/5.0',
    referer: `http://${WEB_HOST}/admin/`,
  }));
  t = addSeconds(t, 5);
  httpEvents.push(streamHttp(t, {
    src_ip: ATK_IP, dest_ip: WEB_IP, http_method: 'GET',
    uri: '/uploads/image.php.jpg?cmd=id', status: 200, bytes: 32,
    user_agent: 'curl/7.68.0',
  }));
  t = addSeconds(t, 2);
  httpEvents.push(streamHttp(t, {
    src_ip: ATK_IP, dest_ip: WEB_IP, http_method: 'GET',
    uri: '/uploads/image.php.jpg?cmd=whoami', status: 200, bytes: 9,
    user_agent: 'curl/7.68.0',
  }));
  t = addSeconds(t, 3);
  httpEvents.push(streamHttp(t, {
    src_ip: ATK_IP, dest_ip: WEB_IP, http_method: 'GET',
    uri: '/uploads/image.php.jpg?cmd=uname+-a', status: 200, bytes: 89,
    user_agent: 'curl/7.68.0',
  }));

  // Continued normal web traffic
  let postT = addSeconds(base, 60);
  while (postT < addSeconds(base, 7200)) {
    httpEvents.push(streamHttp(postT, {
      src_ip: pick(LEGIT_INTERNAL), dest_ip: WEB_IP,
      http_method: Math.random() < 0.85 ? 'GET' : 'POST',
      uri: pick(bgPaths), status: pick([200, 200, 200, 304, 404]),
      bytes: randInt(200, 15000), user_agent: pick(NORMAL_UAS),
    }));
    postT = addSeconds(postT, randInt(5, 45));
  }

  // ── MySQL events ─────────────────────────────────────────────────────────
  const mysqlEvents = [];

  // Background: normal DB queries (~1,500 events)
  const normalQueries = [
    'SELECT id, name, status FROM orders WHERE status=\'pending\' LIMIT 100',
    'SELECT COUNT(*) FROM sessions WHERE last_seen > NOW() - INTERVAL 1 HOUR',
    'UPDATE sessions SET last_seen=NOW() WHERE user_id=' + randInt(1, 9999),
    'SELECT product_id, price FROM inventory WHERE stock < 10',
  ];
  let mqT = ago(base, { hours: 6 });
  while (mqT < addSeconds(base, 7200)) {
    const hr = mqT.getHours();
    if (hr >= 8 && hr <= 22) {
      mysqlEvents.push(mysql(mqT, {
        src_ip: WEB_IP, user: 'appuser', db: 'webapp',
        query: pick(normalQueries), query_time: (Math.random() * 0.5).toFixed(4),
        rows_sent: randInt(1, 100), rows_examined: randInt(50, 500), status: 'ok',
      }));
    } else {
      mysqlEvents.push(mysql(mqT, {
        src_ip: '127.0.0.1', user: 'replication', db: 'webapp',
        query: 'Slave I/O thread: connected to master replication', status: 'ok',
      }));
    }
    mqT = addSeconds(mqT, randInt(10, 60));
  }

  // SQLi queries hitting the DB
  mysqlEvents.push(mysql(addSeconds(base, 8), {
    src_ip: WEB_IP, user: 'appuser', db: 'webapp',
    query: "SELECT username,password,email FROM users WHERE user='admin'--",
    status: 'ok', query_time: '0.023', rows_sent: 1,
  }));
  mysqlEvents.push(mysql(addSeconds(base, 10), {
    src_ip: WEB_IP, user: 'appuser', db: 'webapp',
    query: "SELECT username,password FROM users WHERE 1=1 OR '1'='1'",
    status: 'ok', query_time: '0.045', rows_sent: 500,
  }));
  mysqlEvents.push(mysql(addSeconds(base, 15), {
    src_ip: WEB_IP, user: 'appuser', db: 'webapp',
    query: 'SELECT table_name FROM information_schema.tables WHERE table_schema=\'webapp\'',
    status: 'ok', query_time: '0.012', rows_sent: 25,
  }));
  mysqlEvents.push(mysql(addSeconds(base, 20), {
    src_ip: WEB_IP, user: 'appuser', db: 'webapp',
    query: 'SELECT username,password,email FROM users',
    status: 'ok', query_time: '0.234', rows_sent: 500,
  }));

  // ── Auth events ──────────────────────────────────────────────────────────
  const authEvents = [];

  // Background auth (~2,000 events)
  authEvents.push(...authBackground({
    start: ago(base, { hours: 6 }), end: addSeconds(base, 7200), count: 2000,
    destIp: pick([WEB_IP, DB_IP, ADMIN_IP]),
    users: [...COMMON_USERS.slice(0, 10), ...SERVICE_USERS],
  }));

  // ════════════════════════════════════════════════════════
  // STAGE 3: Privilege Escalation (22:20–22:25)
  // ════════════════════════════════════════════════════════
  authEvents.push(auth(addSeconds(base, 1200), {
    src_ip: '127.0.0.1', dest_ip: WEB_IP, user: 'www-data',
    action: 'login_success', status: 'success', service: 'sudo', auth_method: 'sudo',
  }));
  // Backdoor user created
  authEvents.push(auth(addSeconds(base, 1210), {
    src_ip: '127.0.0.1', dest_ip: WEB_IP, user: 'backdoor_svc',
    action: 'account_created', status: 'success', service: 'useradd',
  }));
  authEvents.push(auth(addSeconds(base, 1212), {
    src_ip: '127.0.0.1', dest_ip: WEB_IP, user: 'backdoor_svc',
    action: 'password_change', status: 'success', service: 'passwd',
  }));

  // ════════════════════════════════════════════════════════
  // STAGE 4: Lateral Movement (22:30–22:50)
  // ════════════════════════════════════════════════════════
  authEvents.push(auth(addSeconds(base, 1800), {
    src_ip: WEB_IP, dest_ip: DB_IP, user: 'backdoor_svc',
    action: 'login_success', status: 'success', service: 'sshd', auth_method: 'publickey',
  }));
  authEvents.push(auth(addSeconds(base, 2700), {
    src_ip: DB_IP, dest_ip: ADMIN_IP, user: 'backdoor_svc',
    action: 'login_success', status: 'success', service: 'sshd', auth_method: 'publickey',
  }));

  // ── Audit events ─────────────────────────────────────────────────────────
  const auditEvents = [];

  // Background audit (~800 events)
  let atT = ago(base, { hours: 6 });
  while (atT < addSeconds(base, 7200)) {
    if (Math.random() < 0.1) {
      auditEvents.push(audit(atT, {
        type: 'SYSCALL', syscall: pick(['openat', 'read', 'write', 'stat']),
        pid: randInt(1000, 65000), user: pick(SERVICE_USERS), euid: randInt(33, 1000),
        comm: pick(['nginx', 'php-fpm', 'bash', 'cron']),
        exe: pick(['/usr/sbin/nginx', '/usr/bin/php-fpm', '/bin/bash']),
        key: 'normal',
      }));
    }
    atT = addSeconds(atT, randInt(20, 120));
  }

  // THE SIGNAL: webshell exec, priv esc, lateral movement
  auditEvents.push(audit(addSeconds(base, 720), {
    type: 'SYSCALL', syscall: 'execve', pid: randInt(10000, 65000),
    user: 'www-data', euid: 0, comm: 'php', exe: '/usr/bin/php',
    key: 'webshell_exec', command_line: 'php /uploads/image.php.jpg cmd=id',
  }));
  auditEvents.push(audit(addSeconds(base, 1200), {
    type: 'SYSCALL', syscall: 'execve', pid: randInt(10000, 65000),
    user: 'root', euid: 0, comm: 'bash', exe: '/bin/bash',
    key: 'privilege_escalation', command_line: 'python3 -c import os;os.system(\'/bin/bash\')',
  }));
  auditEvents.push(audit(addSeconds(base, 1205), {
    type: 'PATH', syscall: 'openat', pid: randInt(10000, 65000),
    user: 'root', euid: 0, comm: 'cat', exe: '/bin/cat',
    key: 'sensitive_file', path: '/etc/shadow',
  }));

  // ── Firewall events ──────────────────────────────────────────────────────
  const fwEvents = [];

  // Background firewall (~3,000 events)
  fwEvents.push(...fwBackground({
    start: ago(base, { hours: 6 }), end: addSeconds(base, 7200), count: 3000,
  }));

  // ════════════════════════════════════════════════════════
  // STAGE 5: Exfiltration (23:00–23:45)
  // ════════════════════════════════════════════════════════
  const FLOWS = 45;
  let exfilT = addSeconds(base, 3600);
  for (let i = 0; i < FLOWS; i++) {
    fwEvents.push(firewall(exfilT, {
      src_ip: DB_IP, dest_ip: EXFIL_IP, dest_port: 443,
      proto: 'TCP', action: 'allow', bytes: randInt(1000, 50000),
      direction: 'outbound', src_port: randInt(40000, 65000),
      flags: 'ACK PSH', session_id: `exfil_${i}`,
    }));
    exfilT = addSeconds(exfilT, 30);
  }

  // ── Suricata IDS alerts ──────────────────────────────────────────────────
  const suricataEvents = [];

  // Background IDS noise (~15 events)
  for (let i = 0; i < 15; i++) {
    const nt = addSeconds(ago(base, { hours: 6 }), randInt(0, 36000));
    suricataEvents.push(suricata(nt, {
      src_ip: pick(LEGIT_INTERNAL), dest_ip: pick(LEGIT_EXTERNAL),
      dest_port: randInt(1, 65535), proto: 'TCP', action: 'alert',
      signature: 'ET SCAN Possible Port Scan', severity: 'low',
      category: 'attempted-recon', sid: 2001216,
    }));
  }

  // THE SIGNAL: multiple IDS alerts across the kill chain
  const sig1 = SURICATA_SIGS.sql_injection;
  suricataEvents.push(suricata(addSeconds(base, 120), {
    src_ip: ATK_IP, dest_ip: WEB_IP, dest_port: 80, proto: 'TCP', action: 'alert', ...sig1,
  }));
  const sig2 = SURICATA_SIGS.webshell;
  suricataEvents.push(suricata(addSeconds(base, 630), {
    src_ip: ATK_IP, dest_ip: WEB_IP, dest_port: 80, proto: 'TCP', action: 'alert', ...sig2,
  }));
  const sig3 = SURICATA_SIGS.privilege_escalation;
  suricataEvents.push(suricata(addSeconds(base, 1200), {
    src_ip: WEB_IP, dest_ip: WEB_IP, dest_port: 0, proto: 'TCP', action: 'alert', ...sig3,
  }));
  const sig4 = SURICATA_SIGS.data_exfil;
  suricataEvents.push(suricata(addSeconds(base, 3600), {
    src_ip: DB_IP, dest_ip: EXFIL_IP, dest_port: 443, proto: 'TCP', action: 'alert', ...sig4,
  }));

  httpEvents.sort();
  mysqlEvents.sort();
  authEvents.sort();
  auditEvents.sort();
  fwEvents.sort();
  suricataEvents.sort();

  return [
    { events: httpEvents, sourcetype: 'stream_http', host: WEB_HOST },
    { events: authEvents, sourcetype: 'auth', host: WEB_HOST },
    { events: auditEvents, sourcetype: 'audit', host: WEB_HOST },
    { events: mysqlEvents, sourcetype: 'mysql', host: DB_HOST },
    { events: fwEvents, sourcetype: 'firewall', host: 'fw-core-01' },
    { events: suricataEvents, sourcetype: 'suricata', host: 'fw-core-01' },
  ];
}

module.exports = { generate };
