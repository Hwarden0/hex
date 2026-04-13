'use strict';

const { syslogTs, ago, addSeconds } = require('../../utils/time');

// Case 2: Failed vs Successful Login Correlation
// Scenario: 10.0.0.55 attempts credential stuffing against multiple accounts.
// Only jsmith is successfully compromised after 5 failed attempts.

function generate() {
  const base = new Date();
  base.setHours(10, 15, 0, 0);

  const HOST     = 'auth-server-01';
  const ATTACKER = '10.0.0.55';
  const LEGIT    = ['10.0.0.10', '10.0.0.11', '10.0.0.12', '192.168.1.20'];
  const USERS    = ['jsmith', 'mwilliams', 'tjohnson', 'agarcia', 'klee', 'rbrown', 'cdavis'];

  const events = [];

  // ── Normal background logins (08:00–10:14) ───────────────────────────────────
  let t = ago(base, { hours: 2, minutes: 15 });
  const bgEnd = new Date(base);
  while (t < bgEnd) {
    const user = USERS[Math.floor(Math.random() * USERS.length)];
    const ip   = LEGIT[Math.floor(Math.random() * LEGIT.length)];
    const port = 48000 + Math.floor(Math.random() * 10000);
    const pid  = 9000 + Math.floor(Math.random() * 1000);
    events.push(`${syslogTs(t)} ${HOST} sshd[${pid}]: Accepted password for ${user} from ${ip} port ${port} ssh2`);
    t = addSeconds(t, 120 + Math.floor(Math.random() * 300));
  }

  // ── Attacker attempts credential stuffing ────────────────────────────────────
  // Tries each user with 1-2 attempts, looking for valid credentials
  t = new Date(base);
  t = addSeconds(t, 30);

  for (const user of ['mwilliams', 'tjohnson', 'agarcia']) {
    for (let i = 0; i < 2; i++) {
      const port = 50000 + Math.floor(Math.random() * 5000);
      const pid  = 11000 + Math.floor(Math.random() * 500);
      events.push(`${syslogTs(t)} ${HOST} sshd[${pid}]: Failed password for ${user} from ${ATTACKER} port ${port} ssh2`);
      t = addSeconds(t, 8 + Math.floor(Math.random() * 15));
    }
  }

  // ── 5 failed attempts against jsmith, then success ───────────────────────────
  for (let i = 0; i < 5; i++) {
    const port = 51000 + i;
    const pid  = 11500;
    events.push(`${syslogTs(t)} ${HOST} sshd[${pid}]: Failed password for jsmith from ${ATTACKER} port ${port} ssh2`);
    t = addSeconds(t, 10 + Math.floor(Math.random() * 5));
  }
  // Successful login!
  t = addSeconds(t, 12);
  events.push(`${syslogTs(t)} ${HOST} sshd[11501]: Accepted password for jsmith from ${ATTACKER} port 51005 ssh2`);

  // ── Legitimate logins continue in parallel ───────────────────────────────────
  let postT = addSeconds(base, 60);
  const postEnd = addSeconds(base, 3600);
  while (postT < postEnd) {
    const user = USERS[Math.floor(Math.random() * USERS.length)];
    const ip   = LEGIT[Math.floor(Math.random() * LEGIT.length)];
    const port = 48000 + Math.floor(Math.random() * 10000);
    const pid  = 9000 + Math.floor(Math.random() * 1000);
    events.push(`${syslogTs(postT)} ${HOST} sshd[${pid}]: Accepted password for ${user} from ${ip} port ${port} ssh2`);
    postT = addSeconds(postT, 150 + Math.floor(Math.random() * 300));
  }

  events.sort();
  return [{ events, sourcetype: 'auth', host: HOST }];
}

module.exports = { generate };
