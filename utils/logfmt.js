'use strict';

// ─── Structured Log Format Utilities ─────────────────────────────────────────
// Produces key=value log lines parseable by Splunk auto-extraction.
// Example: src_ip=10.0.0.100 dest_ip=10.0.0.1 http_method=POST status=200

const { syslogTs, addSeconds } = require('./time');

// ─── Random / pick helpers ───────────────────────────────────────────────────
function randInt(min, max) { return min + Math.floor(Math.random() * (max - min)); }
function pick(arr) { return arr[randInt(0, arr.length)]; }

// ─── IP pools ────────────────────────────────────────────────────────────────
const LEGIT_INTERNAL = [
  '10.0.0.5','10.0.0.6','10.0.0.7','10.0.0.8','10.0.0.9',
  '10.0.0.11','10.0.0.12','10.0.0.13','10.0.0.14','10.0.0.15',
  '192.168.1.50','192.168.1.51','192.168.1.52','192.168.1.53',
  '172.16.0.10','172.16.0.11','172.16.0.20','172.16.0.21',
  '10.10.0.5','10.10.0.6','10.10.0.7','10.10.0.8',
];
const LEGIT_EXTERNAL = [
  '8.8.8.8','1.1.1.1','93.184.216.34','104.21.12.54',
  '151.101.1.69','172.217.14.206','13.107.42.14','140.82.121.4',
  '52.84.12.54','34.120.54.55','23.185.0.2','199.232.69.194',
];
const ATTACKER_IPS = [
  '40.80.148.42','185.220.101.42','45.142.212.100','198.51.100.23',
  '203.0.113.50','91.215.85.10','77.247.181.163','185.56.80.65',
];

// ─── User agent pools ────────────────────────────────────────────────────────
const NORMAL_UAS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64; rv:121.0) Gecko/20100101 Firefox/121.0',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) AppleWebKit/605.1.15',
  'Mozilla/5.0 (iPad; CPU OS 17_2 like Mac OS X) AppleWebKit/605.1.15',
];
const TOOL_UAS = [
  'sqlmap/1.7.8#stable (https://sqlmap.org)',
  'curl/7.68.0',
  'python-requests/2.31.0',
  'Nikto/2.1.6',
  'Go-http-client/1.1',
  'Mozilla/5.0 (compatible; Nmap Scripting Engine; https://nmap.org/book/nse.html)',
];

// ─── Username pools ──────────────────────────────────────────────────────────
const COMMON_USERS = [
  'alice','bob','carol','dave','eve','frank','grace','hank',
  'irene','jack','karen','leo','maria','nate','olivia','paul',
  'quinn','rachel','steve','tina','ursula','victor','wendy','xander',
];
const SERVICE_USERS = ['appuser','deploy','monitor','backup','jenkins','ansible','nagios','zabbix'];
const ADMIN_USERS = ['sysadmin','root','admin','administrator','netops','secops'];
const BRUTE_FORCE_USERS = ['root','admin','ubuntu','oracle','postgres','pi','test','guest','administrator','support','user','mysql','www-data','ftpuser'];

// ─── Key=Value formatter ─────────────────────────────────────────────────────
// Converts an object to a space-separated key=value string.
// Values containing spaces, =, or " are quoted.
function kv(obj) {
  return Object.entries(obj).map(([k, v]) => {
    const s = String(v);
    if (s.includes(' ') || s.includes('=') || s.includes('"')) {
      return `${k}="${s.replace(/"/g, '\\"')}"`;
    }
    return `${k}=${s}`;
  }).join(' ');
}

// ─── Structured log line generators ──────────────────────────────────────────

/**
 * stream_http — structured web request log
 * fields: { src_ip, dest_ip, http_method, uri, status, bytes, user_agent, referer, content_type, response_time_ms }
 */
function streamHttp(ts, f) {
  const obj = {
    src_ip: f.src_ip || pick(LEGIT_INTERNAL),
    dest_ip: f.dest_ip || '10.0.0.1',
    http_method: f.http_method || 'GET',
    uri: f.uri || '/index.html',
    status: f.status || 200,
    bytes: f.bytes || randInt(200, 15000),
    user_agent: f.user_agent || pick(NORMAL_UAS),
  };
  if (f.referer) obj.referer = f.referer;
  if (f.content_type) obj.content_type = f.content_type;
  if (f.response_time_ms) obj.response_time_ms = f.response_time_ms;
  if (f.form_data) obj.form_data = f.form_data;
  if (f.cookie) obj.cookie = f.cookie;
  return `${syslogTs(ts)} web-proxy-01 stream_http ${kv(obj)}`;
}

/**
 * suricata — structured IDS/IPS alert
 * fields: { src_ip, dest_ip, dest_port, proto, action, signature, severity, category, sid }
 */
function suricata(ts, f) {
  const obj = {
    src_ip: f.src_ip,
    dest_ip: f.dest_ip || '10.0.0.1',
    dest_port: f.dest_port || 0,
    proto: f.proto || 'TCP',
    action: f.action || 'alert',
    signature: f.signature,
    severity: f.severity || 'medium',
    category: f.category || 'generic',
    sid: f.sid || randInt(2000000, 2999999),
  };
  return `${syslogTs(ts)} ids-sensor-01 suricata ${kv(obj)}`;
}

/**
 * auth — structured authentication log
 * fields: { src_ip, dest_ip, user, action, status, auth_method, service, dest_port }
 * action: login_success, login_failure, logout, password_change, account_locked, session_open, session_close
 */
function auth(ts, f) {
  const obj = {
    src_ip: f.src_ip || pick(LEGIT_INTERNAL),
    dest_ip: f.dest_ip || '10.0.0.1',
    user: f.user || pick(COMMON_USERS),
    action: f.action || 'login_failure',
    status: f.status || (f.action === 'login_success' ? 'success' : 'failure'),
    service: f.service || 'sshd',
  };
  if (f.auth_method) obj.auth_method = f.auth_method;
  if (f.dest_port) obj.dest_port = f.dest_port;
  if (f.session_id) obj.session_id = f.session_id;
  if (f.account_locked) obj.account_locked = f.account_locked;
  if (f.failure_reason) obj.failure_reason = f.failure_reason;
  return `${syslogTs(ts)} auth-server-01 auth ${kv(obj)}`;
}

/**
 * wineventlog — structured Windows security event
 * fields: { event_id, src_ip, user, logon_type, status, domain, process, target }
 */
function winEventLog(ts, f) {
  const obj = {
    event_id: f.event_id || 4625,
    src_ip: f.src_ip || pick(LEGIT_INTERNAL),
    user: f.user || pick(COMMON_USERS),
    logon_type: f.logon_type || 3,
    status: f.status || (f.event_id === 4624 ? 'success' : 'failure'),
    domain: f.domain || 'CORP',
  };
  if (f.process) obj.process = f.process;
  if (f.target) obj.target = f.target;
  if (f.status_code) obj.status_code = f.status_code;
  if (f.sub_status) obj.sub_status = f.sub_status;
  if (f.workstation) obj.workstation = f.workstation;
  return `${syslogTs(ts)} dc01 wineventlog ${kv(obj)}`;
}

/**
 * sysmon — structured Sysmon process/network event
 * fields: { event_id, process, command_line, user, src_ip, dest_ip, dest_port, hash }
 */
function sysmon(ts, f) {
  const obj = {
    event_id: f.event_id || 1,
    process: f.process || 'cmd.exe',
    user: f.user || pick(COMMON_USERS),
  };
  if (f.command_line) obj.command_line = f.command_line;
  if (f.parent_process) obj.parent_process = f.parent_process;
  if (f.src_ip) obj.src_ip = f.src_ip;
  if (f.dest_ip) obj.dest_ip = f.dest_ip;
  if (f.dest_port) obj.dest_port = f.dest_port;
  if (f.hash) obj.hash = f.hash;
  if (f.image) obj.image = f.image;
  return `${syslogTs(ts)} dc01 sysmon ${kv(obj)}`;
}

/**
 * firewall — structured firewall log
 * fields: { src_ip, dest_ip, dest_port, proto, action, bytes, direction }
 */
function firewall(ts, f) {
  const obj = {
    src_ip: f.src_ip,
    dest_ip: f.dest_ip,
    dest_port: f.dest_port || 0,
    proto: f.proto || 'TCP',
    action: f.action || 'allow',
    bytes: f.bytes || randInt(40, 1500),
  };
  if (f.direction) obj.direction = f.direction;
  if (f.src_port) obj.src_port = f.src_port;
  if (f.rule) obj.rule = f.rule;
  if (f.session_id) obj.session_id = f.session_id;
  if (f.flags) obj.flags = f.flags;
  return `${syslogTs(ts)} fw-edge-01 firewall ${kv(obj)}`;
}

/**
 * dns — structured DNS query log
 * fields: { src_ip, query, query_type, response, response_code }
 */
function dns(ts, f) {
  const obj = {
    src_ip: f.src_ip || pick(LEGIT_INTERNAL),
    query: f.query || 'www.example.com',
    query_type: f.query_type || 'A',
  };
  if (f.response) obj.response = f.response;
  if (f.response_code) obj.response_code = f.response_code;
  return `${syslogTs(ts)} dns-server-01 dns ${kv(obj)}`;
}

/**
 * mysql — structured MySQL query log
 * fields: { src_ip, user, db, query, query_time, rows_sent, rows_examined }
 */
function mysql(ts, f) {
  const obj = {
    src_ip: f.src_ip || '127.0.0.1',
    user: f.user || 'appuser',
    db: f.db || 'webapp',
    query: f.query || 'SELECT 1',
  };
  if (f.query_time) obj.query_time = f.query_time;
  if (f.rows_sent) obj.rows_sent = f.rows_sent;
  if (f.rows_examined) obj.rows_examined = f.rows_examined;
  if (f.status) obj.status = f.status;
  return `${syslogTs(ts)} db-server-01 mysql ${kv(obj)}`;
}

/**
 * ftp — structured FTP log
 * fields: { src_ip, user, action, file, bytes, status }
 */
function ftp(ts, f) {
  const obj = {
    src_ip: f.src_ip,
    user: f.user || 'anonymous',
    action: f.action || 'upload',
  };
  if (f.file) obj.file = f.file;
  if (f.bytes) obj.bytes = f.bytes;
  if (f.status) obj.status = f.status;
  if (f.transfer_mode) obj.transfer_mode = f.transfer_mode;
  return `${syslogTs(ts)} ftp-server-01 ftp ${kv(obj)}`;
}

/**
 * audit — structured Linux audit log
 * fields: { type, syscall, pid, ppid, user, euid, comm, exe, key, path }
 */
function audit(ts, f) {
  const obj = {
    type: f.type || 'SYSCALL',
    syscall: f.syscall || 'execve',
    pid: f.pid || randInt(1000, 65000),
    user: f.user || 'root',
    euid: f.euid || 0,
  };
  if (f.ppid) obj.ppid = f.ppid;
  if (f.comm) obj.comm = f.comm;
  if (f.exe) obj.exe = f.exe;
  if (f.key) obj.key = f.key;
  if (f.path) obj.path = f.path;
  if (f.command_line) obj.command_line = f.command_line;
  return `${syslogTs(ts)} host-01 audit ${kv(obj)}`;
}

/**
 * cron — structured cron execution log
 * fields: { user, command, status, pid }
 */
function cron(ts, f) {
  const obj = {
    user: f.user || 'root',
    command: f.command || '/usr/bin/true',
    status: f.status || 'success',
  };
  if (f.pid) obj.pid = f.pid;
  if (f.output) obj.output = f.output;
  return `${syslogTs(ts)} host-01 cron ${kv(obj)}`;
}

/**
 * syslog — generic system log
 * fields: { host, service, message }
 */
function syslog(ts, f) {
  const obj = {
    host: f.host || 'host-01',
    service: f.service || 'systemd',
    message: f.message,
  };
  return `${syslogTs(ts)} ${f.host || 'host-01'} syslog ${kv(obj)}`;
}

// ─── Bulk event generators ───────────────────────────────────────────────────

/**
 * Generate N normal HTTP background events over a time range.
 * Returns array of event strings.
 */
function httpBackground({ start, end, count, destIp, paths, statusCodes } = {}) {
  const events = [];
  const dPaths = paths || ['/index.html', '/about.html', '/api/status', '/css/style.css', '/js/app.js', '/images/logo.png', '/api/v1/health', '/favicon.ico', '/api/v1/metrics'];
  const dCodes = statusCodes || [200, 200, 200, 200, 200, 200, 200, 304, 301, 404];
  const delta = (end.getTime() - start.getTime()) / (count || 2000);
  for (let i = 0; i < (count || 2000); i++) {
    const t = new Date(start.getTime() + delta * i + randInt(0, Math.floor(delta * 0.5)));
    events.push(streamHttp(t, {
      src_ip: pick(LEGIT_INTERNAL),
      dest_ip: destIp || '10.0.0.1',
      http_method: Math.random() < 0.85 ? 'GET' : 'POST',
      uri: pick(dPaths),
      status: pick(dCodes),
      bytes: randInt(200, 15000),
    }));
  }
  return events;
}

/**
 * Generate N normal SSH auth background events over a time range.
 */
function authBackground({ start, end, count, destIp, users, services } = {}) {
  const events = [];
  const dUsers = users || [...COMMON_USERS, ...SERVICE_USERS];
  const dServices = services || ['sshd'];
  const delta = (end.getTime() - start.getTime()) / (count || 1000);
  for (let i = 0; i < (count || 1000); i++) {
    const t = new Date(start.getTime() + delta * i + randInt(0, Math.floor(delta * 0.5)));
    // 90% success, 10% failure (typos, stale keys)
    const success = Math.random() < 0.9;
    events.push(auth(t, {
      src_ip: pick(LEGIT_INTERNAL),
      dest_ip: destIp || '10.0.0.1',
      user: pick(dUsers),
      action: success ? 'login_success' : 'login_failure',
      status: success ? 'success' : 'failure',
      service: pick(dServices),
      auth_method: 'password',
    }));
  }
  return events;
}

/**
 * Generate N normal firewall background events over a time range.
 */
function fwBackground({ start, end, count } = {}) {
  const events = [];
  const delta = (end.getTime() - start.getTime()) / (count || 3000);
  const commonDests = [
    { ip: '8.8.8.8', port: 53, proto: 'UDP' },
    { ip: '1.1.1.1', port: 53, proto: 'UDP' },
    { ip: '93.184.216.34', port: 443, proto: 'TCP' },
    { ip: '104.21.12.54', port: 443, proto: 'TCP' },
    { ip: '151.101.1.69', port: 443, proto: 'TCP' },
    { ip: '172.217.14.206', port: 80, proto: 'TCP' },
    { ip: '13.107.42.14', port: 443, proto: 'TCP' },
  ];
  for (let i = 0; i < (count || 3000); i++) {
    const t = new Date(start.getTime() + delta * i + randInt(0, Math.floor(delta * 0.3)));
    const dst = pick(commonDests);
    events.push(firewall(t, {
      src_ip: pick(LEGIT_INTERNAL),
      dest_ip: dst.ip,
      dest_port: dst.port,
      proto: dst.proto,
      action: 'allow',
      bytes: randInt(40, 1500),
      direction: 'outbound',
    }));
  }
  return events;
}

/**
 * Generate N normal Windows auth background events.
 */
function winAuthBackground({ start, end, count } = {}) {
  const events = [];
  const delta = (end.getTime() - start.getTime()) / (count || 1500);
  for (let i = 0; i < (count || 1500); i++) {
    const t = new Date(start.getTime() + delta * i + randInt(0, Math.floor(delta * 0.5)));
    const success = Math.random() < 0.92;
    const evtId = success ? 4624 : 4625;
    events.push(winEventLog(t, {
      event_id: evtId,
      src_ip: pick(LEGIT_INTERNAL),
      user: pick(COMMON_USERS),
      logon_type: pick([2, 3, 3, 3, 10]),
      status: success ? 'success' : 'failure',
      status_code: success ? '0x0' : '0xC000006D',
      sub_status: success ? '0x0' : pick(['0xC000006A', '0xC0000234', '0xC000006D']),
    }));
  }
  return events;
}

/**
 * Generate normal DNS background events.
 */
function dnsBackground({ start, end, count } = {}) {
  const events = [];
  const domains = [
    'www.google.com', 'api.github.com', 'cdn.jsdelivr.net', 'fonts.googleapis.com',
    'outlook.office365.com', 'slack.com', 'zoom.us', 'aws.amazon.com',
    'docs.microsoft.com', 'stackoverflow.com', 'registry.npmjs.org',
  ];
  const delta = (end.getTime() - start.getTime()) / (count || 500);
  for (let i = 0; i < (count || 500); i++) {
    const t = new Date(start.getTime() + delta * i + randInt(0, Math.floor(delta * 0.5)));
    events.push(dns(t, {
      src_ip: pick(LEGIT_INTERNAL),
      query: pick(domains),
      query_type: pick(['A', 'A', 'A', 'AAAA', 'CNAME']),
      response_code: 'NOERROR',
    }));
  }
  return events;
}

// ─── Suricata signature helpers ──────────────────────────────────────────────
const SURICATA_SIGS = {
  ssh_brute: {
    signature: 'ET SCAN Possible SSH Brute Force Attempt',
    severity: 'high',
    category: 'attempted-recon',
    sid: 2001219,
  },
  sql_injection: {
    signature: 'ET WEB_SERVER SQL Injection Attempt',
    severity: 'high',
    category: 'web-application-attack',
    sid: 2001907,
  },
  webshell: {
    signature: 'ET WEB_SERVER Web Shell Command Execution',
    severity: 'high',
    category: 'web-application-attack',
    sid: 2003318,
  },
  credential_stuffing: {
    signature: 'ET WEB_SERVER Multiple Failed Login Attempts',
    severity: 'medium',
    category: 'attempted-recon',
    sid: 2002891,
  },
  c2_beacon: {
    signature: 'ET TROJAN Possible C2 Beacon Activity',
    severity: 'high',
    category: 'command-and-control',
    sid: 2004567,
  },
  data_exfil: {
    signature: 'ET POLICY Large Outbound Data Transfer',
    severity: 'medium',
    category: 'policy-violation',
    sid: 2008901,
  },
  port_scan: {
    signature: 'ET SCAN Nmap SYN Scan Detected',
    severity: 'medium',
    category: 'attempted-recon',
    sid: 2001216,
  },
  privilege_escalation: {
    signature: 'ET POLICY Suspicious Privilege Escalation Activity',
    severity: 'high',
    category: 'attempted-admin',
    sid: 2005678,
  },
  lateral_movement: {
    signature: 'ET POLICY Lateral Movement via SSH',
    severity: 'high',
    category: 'lateral-movement',
    sid: 2006789,
  },
};

module.exports = {
  randInt, pick,
  LEGIT_INTERNAL, LEGIT_EXTERNAL, ATTACKER_IPS,
  COMMON_USERS, SERVICE_USERS, ADMIN_USERS, BRUTE_FORCE_USERS,
  NORMAL_UAS, TOOL_UAS,
  kv,
  streamHttp, suricata, auth, winEventLog, sysmon, firewall, dns, mysql, ftp, audit, cron, syslog,
  httpBackground, authBackground, fwBackground, winAuthBackground, dnsBackground,
  SURICATA_SIGS,
};
