'use strict';

const { syslogTs, ago, addSeconds } = require('../../utils/time');

// Case 6: Persistence via Cron Job
// www-data writes malicious cron entry after webshell exploitation

function generate() {
  const base = new Date();
  base.setHours(11, 30, 0, 0);

  const HOST = 'app-server-03';

  const authEvents  = [];
  const cronEvents  = [];
  const syslogEvents = [];
  const webEvents   = [];

  // ── Web shell access (Apache log) ────────────────────────────────────────────
  let t = new Date(base);
  webEvents.push(`185.220.101.42 - - [${t.toUTCString()}] "GET /uploads/shell.php?cmd=id HTTP/1.1" 200 42 "-" "curl/7.68.0"`);
  t = addSeconds(t, 3);
  webEvents.push(`185.220.101.42 - - [${t.toUTCString()}] "GET /uploads/shell.php?cmd=whoami HTTP/1.1" 200 9 "-" "curl/7.68.0"`);
  t = addSeconds(t, 2);
  webEvents.push(`185.220.101.42 - - [${t.toUTCString()}] "POST /uploads/shell.php HTTP/1.1" 200 0 "-" "curl/7.68.0"`);

  // ── cron.d file creation via www-data ────────────────────────────────────────
  t = addSeconds(base, 25);
  syslogEvents.push(`${syslogTs(t)} ${HOST} kernel: [12345.678] audit: type=PATH msg=audit(...): item=0 name="/tmp/.backup.sh" inode=123456 dev=08:01 mode=0755 ouid=33 ogid=33`);
  t = addSeconds(t, 2);
  syslogEvents.push(`${syslogTs(t)} ${HOST} kernel: [12347.901] audit: type=PATH msg=audit(...): item=0 name="/etc/cron.d/.sysupdate" inode=654321 dev=08:01 mode=0644 ouid=33 ogid=33`);
  t = addSeconds(t, 1);
  syslogEvents.push(`${syslogTs(t)} ${HOST} kernel: [12348.100] audit: type=SYSCALL msg=audit(...): arch=x86_64 syscall=openat success=yes exit=3 ppid=1000 pid=1001 uid=33 auid=33 comm="sh" exe="/bin/sh" key="cron_watch"`);

  // ── FIM alert for cron.d modification ────────────────────────────────────────
  t = addSeconds(base, 30);
  syslogEvents.push(`${syslogTs(t)} ${HOST} AIDE[9901]: Entry added: /etc/cron.d/.sysupdate`);
  syslogEvents.push(`${syslogTs(t)} ${HOST} AIDE[9901]: File: /etc/cron.d/.sysupdate, attributes: size=64, md5=a3f8b2c1d4e5f609`);

  // ── Cron executes payload ─────────────────────────────────────────────────────
  // 5 minutes later, every 5 minutes
  for (let i = 1; i <= 3; i++) {
    const cronT = addSeconds(base, 300 * i);
    cronEvents.push(`${syslogTs(cronT)} ${HOST} cron[8800]: (root) CMD (*/5 * * * * www-data /tmp/.backup.sh)`);
    cronEvents.push(`${syslogTs(addSeconds(cronT, 1))} ${HOST} cron[8801]: (www-data) CMD (/tmp/.backup.sh)`);
  }

  // ── Cron content visible in syslog ───────────────────────────────────────────
  t = addSeconds(base, 28);
  syslogEvents.push(`${syslogTs(t)} ${HOST} sh[1002]: /etc/cron.d/.sysupdate: */5 * * * * www-data /tmp/.backup.sh`);

  // ── Normal background cron jobs ───────────────────────────────────────────────
  const normalCrons = [
    '(root) CMD (/usr/sbin/logrotate /etc/logrotate.conf)',
    '(root) CMD (run-parts /etc/cron.hourly)',
    '(www-data) CMD (/usr/bin/php /var/www/html/cron.php)',
  ];
  let bgT = ago(base, { hours: 3 });
  while (bgT < addSeconds(base, 7200)) {
    const job = normalCrons[Math.floor(Math.random() * normalCrons.length)];
    cronEvents.push(`${syslogTs(bgT)} ${HOST} cron[${7000 + Math.floor(Math.random() * 1000)}]: ${job}`);
    bgT = addSeconds(bgT, 600 + Math.floor(Math.random() * 1200));
  }

  authEvents.sort();
  cronEvents.sort();
  syslogEvents.sort();
  webEvents.sort();

  return [
    { events: authEvents,   sourcetype: 'auth',    host: HOST },
    { events: cronEvents,   sourcetype: 'cron',    host: HOST },
    { events: syslogEvents, sourcetype: 'syslog',  host: HOST },
    { events: webEvents,    sourcetype: 'apache',  host: HOST },
  ];
}

module.exports = { generate };
