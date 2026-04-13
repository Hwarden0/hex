'use strict';

const { syslogTs, ago, addSeconds } = require('../../utils/time');

// Case 8: Lateral Movement
// svc_account hops: attacker -> web-server-01 -> db-server-01 -> admin-server-01
// Each hop comes from the IP of the previous host

function generate() {
  const base = new Date();
  base.setHours(20, 5, 0, 0);

  const ATTACKER_IP  = '10.0.0.42';
  const WEB_IP       = '10.0.0.80';
  const DB_IP        = '10.0.0.81';
  const ADMIN_IP     = '10.0.0.82';

  const WEB_HOST   = 'web-server-01';
  const DB_HOST    = 'db-server-01';
  const ADMIN_HOST = 'admin-server-01';

  const webEvents   = [];
  const dbEvents    = [];
  const adminEvents = [];

  const LEGIT_USERS = ['appuser', 'deploy', 'monitor', 'backup'];

  // ── Initial compromise: attacker logs into web-server-01 as svc_account ──────
  let t = new Date(base);
  webEvents.push(`${syslogTs(t)} ${WEB_HOST} sshd[10100]: Accepted publickey for svc_account from ${ATTACKER_IP} port 55500 ssh2`);
  t = addSeconds(t, 2);
  webEvents.push(`${syslogTs(t)} ${WEB_HOST} sshd[10100]: pam_unix(sshd:session): session opened for user svc_account by (uid=2001)`);

  // Some commands run on web
  t = addSeconds(t, 15);
  webEvents.push(`${syslogTs(t)} ${WEB_HOST} sudo[10150]: svc_account : NOPASSWD command: /usr/bin/ssh`);

  // ── Pivot 1: web-server-01 → db-server-01 ────────────────────────────────────
  t = addSeconds(base, 120);
  dbEvents.push(`${syslogTs(t)} ${DB_HOST} sshd[11200]: Accepted publickey for svc_account from ${WEB_IP} port 43210 ssh2`);
  t = addSeconds(t, 2);
  dbEvents.push(`${syslogTs(t)} ${DB_HOST} sshd[11200]: pam_unix(sshd:session): session opened for user svc_account by (uid=2001)`);

  t = addSeconds(t, 30);
  dbEvents.push(`${syslogTs(t)} ${DB_HOST} sudo[11250]: svc_account : NOPASSWD command: /bin/cat /etc/shadow`);
  t = addSeconds(t, 5);
  dbEvents.push(`${syslogTs(t)} ${DB_HOST} sudo[11251]: svc_account : NOPASSWD command: /usr/bin/ssh ${ADMIN_IP}`);

  // ── Pivot 2: db-server-01 → admin-server-01 ──────────────────────────────────
  t = addSeconds(base, 480);
  adminEvents.push(`${syslogTs(t)} ${ADMIN_HOST} sshd[12300]: Accepted publickey for svc_account from ${DB_IP} port 60123 ssh2`);
  t = addSeconds(t, 2);
  adminEvents.push(`${syslogTs(t)} ${ADMIN_HOST} sshd[12300]: pam_unix(sshd:session): session opened for user svc_account by (uid=2001)`);

  t = addSeconds(t, 20);
  adminEvents.push(`${syslogTs(t)} ${ADMIN_HOST} sudo[12350]: svc_account : TTY=pts/0 ; PWD=/home/svc_account ; USER=root ; COMMAND=/bin/bash`);
  t = addSeconds(t, 5);
  adminEvents.push(`${syslogTs(t)} ${ADMIN_HOST} useradd[12400]: new user: name=svc_backup, UID=0, GID=0, home=/root, shell=/bin/bash`);

  // ── Legitimate background traffic on each host ────────────────────────────────
  const allHosts = [
    { host: WEB_HOST,   events: webEvents },
    { host: DB_HOST,    events: dbEvents },
    { host: ADMIN_HOST, events: adminEvents },
  ];
  for (const { host, events } of allHosts) {
    let bgT = ago(base, { hours: 4 });
    while (bgT < new Date(base).setHours(23, 59, 59, 999)) {
      const u = LEGIT_USERS[Math.floor(Math.random() * LEGIT_USERS.length)];
      const ip = `10.0.0.${10 + Math.floor(Math.random() * 20)}`;
      events.push(`${syslogTs(bgT)} ${host} sshd[${8000 + Math.floor(Math.random() * 1000)}]: Accepted password for ${u} from ${ip} port ${49000 + Math.floor(Math.random() * 5000)} ssh2`);
      bgT = addSeconds(bgT, 300 + Math.floor(Math.random() * 600));
    }
    events.sort();
  }

  return [
    { events: webEvents,   sourcetype: 'auth', host: WEB_HOST },
    { events: dbEvents,    sourcetype: 'auth', host: DB_HOST },
    { events: adminEvents, sourcetype: 'auth', host: ADMIN_HOST },
  ];
}

module.exports = { generate };
