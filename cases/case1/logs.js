'use strict';

const { syslogTs, ago, addSeconds } = require('../../utils/time');

// Case 1: SSH Brute Force Attack
// Scenario: 10.0.0.100 launches a brute force against prod-server-01 SSH
// - 247 failed attempts targeting root/admin/ubuntu
// - No successful login from attacker
// - Legitimate logins from other IPs throughout

function generate() {
  const base = new Date();
  base.setHours(14, 23, 0, 0);

  const ATTACKER = '10.0.0.100';
  const TARGET   = 'prod-server-01';
  const LEGIT_IPS = ['10.0.0.5', '10.0.0.6', '10.0.0.7', '192.168.1.50'];
  const LEGIT_USERS = ['alice', 'bob', 'sysadmin', 'deploy'];
  const BRUTE_USERS = ['root', 'admin', 'ubuntu', 'root', 'root', 'administrator', 'root', 'test', 'root'];

  const events = [];
  let t = new Date(base);

  // ── Background traffic before attack (13:00–14:22) ──────────────────────────
  const bgStart = ago(base, { hours: 1, minutes: 23 });
  let bgT = new Date(bgStart);
  while (bgT < base) {
    const user = LEGIT_USERS[Math.floor(Math.random() * LEGIT_USERS.length)];
    const ip   = LEGIT_IPS[Math.floor(Math.random() * LEGIT_IPS.length)];
    const port = 49000 + Math.floor(Math.random() * 10000);
    const pid  = 10000 + Math.floor(Math.random() * 2000);
    events.push(`${syslogTs(bgT)} ${TARGET} sshd[${pid}]: Accepted password for ${user} from ${ip} port ${port} ssh2`);
    bgT = addSeconds(bgT, 60 + Math.floor(Math.random() * 300));
  }

  // ── Attack window (14:23:01 – 14:31:47) ─────────────────────────────────────
  // 247 failed attempts at ~0.5 sec intervals
  t = new Date(base);
  t = addSeconds(t, 1);
  for (let i = 0; i < 247; i++) {
    const user = BRUTE_USERS[i % BRUTE_USERS.length];
    const port = 54000 + i;
    const pid  = 12340 + Math.floor(i / 5);
    events.push(`${syslogTs(t)} ${TARGET} sshd[${pid}]: Failed password for ${user} from ${ATTACKER} port ${port} ssh2`);
    t = addSeconds(t, 1 + Math.floor(Math.random() * 2));
  }

  // One legitimate successful login during attack (red herring)
  const legitDuring = addSeconds(base, 150);
  events.push(`${syslogTs(legitDuring)} ${TARGET} sshd[11500]: Accepted password for sysadmin from 10.0.0.6 port 51234 ssh2`);

  // ── Post-attack normal traffic ────────────────────────────────────────────────
  const attackEnd = addSeconds(base, 490);
  let postT = new Date(attackEnd);
  const postEnd = addSeconds(base, 3600);
  while (postT < postEnd) {
    const user = LEGIT_USERS[Math.floor(Math.random() * LEGIT_USERS.length)];
    const ip   = LEGIT_IPS[Math.floor(Math.random() * LEGIT_IPS.length)];
    const port = 49000 + Math.floor(Math.random() * 10000);
    const pid  = 13000 + Math.floor(Math.random() * 2000);
    events.push(`${syslogTs(postT)} ${TARGET} sshd[${pid}]: Accepted password for ${user} from ${ip} port ${port} ssh2`);
    postT = addSeconds(postT, 90 + Math.floor(Math.random() * 300));
  }

  // Sort by timestamp
  events.sort();

  return [
    { events, sourcetype: 'auth', host: TARGET }
  ];
}

module.exports = { generate };
