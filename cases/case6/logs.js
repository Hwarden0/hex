'use strict';

// Case 6: Persistence via Malicious Cron Job (Web Shell)
// ~6,000 events. www-data exploits web shell, writes /etc/cron.d/.sysupdate.
// Answers discoverable via: stats count by uri | sort -count → ?cmd= stands out
// Sourcetypes: stream_http, audit, cron

const { syslogTs, ago, addSeconds } = require('../../utils/time');
const {
  randInt, pick, LEGIT_INTERNAL, COMMON_USERS, SERVICE_USERS, NORMAL_UAS, TOOL_UAS,
  kv, streamHttp, audit, cron, httpBackground, SURICATA_SIGS,
} = require('../../utils/logfmt');

function generate() {
  const base = new Date();
  base.setHours(11, 30, 0, 0);

  const HOST    = 'app-server-03';
  const HOST_IP = '10.0.0.1';
  const ATK_IP  = '185.220.101.42';

  // ── HTTP events ───────────────────────────────────────────────────────────
  const httpEvents = [];

  // Dense background: 3 hours of normal web traffic (~4,000 events)
  const bgStart = ago(base, { hours: 3 });
  const bgPaths = ['/index.php', '/about.php', '/products.php', '/contact.php', '/api/status', '/css/style.css', '/js/bundle.js', '/api/v1/health', '/images/logo.png', '/api/v1/metrics'];
  httpEvents.push(...httpBackground({
    start: bgStart, end: addSeconds(base, 3600), count: 4000,
    destIp: HOST_IP, paths: bgPaths,
  }));

  // ── Web shell exploitation at 11:30 ──────────────────────────────────────
  let t = new Date(base);
  httpEvents.push(streamHttp(t, {
    src_ip: ATK_IP,
    dest_ip: HOST_IP,
    http_method: 'GET',
    uri: '/uploads/shell.php?cmd=id',
    status: 200,
    bytes: 42,
    user_agent: 'curl/7.68.0',
  }));
  t = addSeconds(t, 3);
  httpEvents.push(streamHttp(t, {
    src_ip: ATK_IP,
    dest_ip: HOST_IP,
    http_method: 'GET',
    uri: '/uploads/shell.php?cmd=whoami',
    status: 200,
    bytes: 9,
    user_agent: 'curl/7.68.0',
  }));
  t = addSeconds(t, 2);
  httpEvents.push(streamHttp(t, {
    src_ip: ATK_IP,
    dest_ip: HOST_IP,
    http_method: 'GET',
    uri: '/uploads/shell.php?cmd=uname+-a',
    status: 200,
    bytes: 89,
    user_agent: 'curl/7.68.0',
  }));
  t = addSeconds(t, 3);
  httpEvents.push(streamHttp(t, {
    src_ip: ATK_IP,
    dest_ip: HOST_IP,
    http_method: 'POST',
    uri: '/uploads/shell.php',
    status: 200,
    bytes: 0,
    user_agent: 'curl/7.68.0',
    form_data: 'cmd=cat+/etc/passwd',
  }));

  // Continued normal web traffic after exploit
  let postT = addSeconds(base, 60);
  while (postT < addSeconds(base, 3600)) {
    const path = pick(bgPaths);
    httpEvents.push(streamHttp(postT, {
      src_ip: pick(LEGIT_INTERNAL),
      dest_ip: HOST_IP,
      http_method: Math.random() < 0.85 ? 'GET' : 'POST',
      uri: path,
      status: pick([200, 200, 200, 200, 304, 301, 404]),
      bytes: randInt(200, 15000),
      user_agent: pick(NORMAL_UAS),
    }));
    postT = addSeconds(postT, randInt(5, 45));
  }

  // ── Audit events ─────────────────────────────────────────────────────────
  const auditEvents = [];

  // Background audit: normal file activity (~500 events)
  let atT = ago(base, { hours: 3 });
  while (atT < addSeconds(base, 3600)) {
    if (Math.random() < 0.12) {
      auditEvents.push(audit(atT, {
        type: 'SYSCALL',
        syscall: pick(['openat', 'read', 'write', 'stat']),
        pid: randInt(1000, 65000),
        user: pick(SERVICE_USERS),
        euid: randInt(33, 1000),
        comm: pick(['nginx', 'php-fpm', 'bash', 'cron']),
        exe: pick(['/usr/sbin/nginx', '/usr/bin/php-fpm', '/bin/bash', '/usr/sbin/cron']),
        key: 'normal',
      }));
    }
    atT = addSeconds(atT, randInt(10, 60));
  }

  // THE SIGNAL: web shell writes malicious cron file
  let at = addSeconds(base, 18);
  auditEvents.push(audit(at, {
    type: 'SYSCALL',
    syscall: 'openat',
    pid: randInt(1000, 65000),
    user: 'www-data',
    euid: 33,
    comm: 'sh',
    exe: '/bin/sh',
    key: 'file_write',
    path: '/tmp/.backup.sh',
  }));

  at = addSeconds(base, 22);
  auditEvents.push(audit(at, {
    type: 'SYSCALL',
    syscall: 'openat',
    pid: randInt(1000, 65000),
    user: 'www-data',
    euid: 33,
    comm: 'sh',
    exe: '/bin/sh',
    key: 'cron_write',
    path: '/etc/cron.d/.sysupdate',
  }));

  // FIM alert for cron.d
  at = addSeconds(base, 25);
  auditEvents.push(audit(at, {
    type: 'FIM',
    syscall: 'openat',
    pid: randInt(1000, 65000),
    user: 'root',
    euid: 0,
    comm: 'aide',
    exe: '/usr/bin/aide',
    key: 'fim_alert',
    path: '/etc/cron.d/.sysupdate',
  }));

  // ── Cron events ──────────────────────────────────────────────────────────
  const cronEvents = [];

  // Background cron: normal cron jobs (~400 events)
  const normalCrons = [
    '(root) CMD (run-parts /etc/cron.hourly)',
    '(root) CMD (/usr/sbin/logrotate /etc/logrotate.conf)',
    '(www-data) CMD (/usr/bin/php /var/www/html/cron.php)',
    '(root) CMD (cd / && run-parts --report /etc/cron.daily)',
    '(root) CMD (/usr/local/bin/health-check.sh)',
    '(monitor) CMD (/usr/local/bin/collect-metrics.sh)',
  ];
  let cronT = ago(base, { hours: 3 });
  while (cronT < addSeconds(base, 3600)) {
    cronEvents.push(cron(cronT, {
      user: pick(['root', 'www-data', 'monitor']),
      command: pick(normalCrons),
      status: 'success',
    }));
    cronT = addSeconds(cronT, randInt(30, 120));
  }

  // THE SIGNAL: malicious cron executes every 5 min (3 executions)
  for (let i = 1; i <= 3; i++) {
    const execT = addSeconds(base, 300 * i);
    cronEvents.push(cron(execT, {
      user: 'root',
      command: '*/5 * * * * www-data /tmp/.backup.sh',
      status: 'success',
    }));
    cronEvents.push(cron(addSeconds(execT, 1), {
      user: 'www-data',
      command: '/tmp/.backup.sh',
      status: 'success',
    }));
  }

  httpEvents.sort();
  auditEvents.sort();
  cronEvents.sort();

  return [
    { events: httpEvents, sourcetype: 'stream_http', host: HOST },
    { events: auditEvents, sourcetype: 'audit', host: HOST },
    { events: cronEvents, sourcetype: 'cron', host: HOST },
  ];
}

module.exports = { generate };
