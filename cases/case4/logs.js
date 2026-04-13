'use strict';

const { syslogTs, ago, addSeconds } = require('../../utils/time');

// Case 4: Password Spraying Attack
// 10.0.0.200 tries "Winter2024!" against 45 accounts (1-2 attempts each)
// No successful logins

function generate() {
  const base = new Date();
  base.setHours(9, 0, 0, 0);

  const HOST     = 'ldap-dc01';
  const ATTACKER = '10.0.0.200';
  const PASSWORD = 'Winter2024!';

  // 45 target accounts
  const ACCOUNTS = [];
  const firstNames = ['john', 'jane', 'mike', 'sarah', 'david', 'lisa', 'chris', 'emily', 'james', 'ashley',
                      'robert', 'jessica', 'daniel', 'amanda', 'ryan', 'stephanie', 'matthew', 'nicole',
                      'andrew', 'heather', 'joshua', 'amber', 'justin', 'megan', 'brandon', 'rachel',
                      'tyler', 'lauren', 'samuel', 'brittany', 'kevin', 'kayla', 'eric', 'alexis',
                      'nathan', 'alyssa', 'zachary', 'courtney', 'jacob', 'crystal', 'adam', 'tiffany',
                      'steven', 'vanessa', 'timothy'];
  for (let i = 0; i < 45; i++) {
    ACCOUNTS.push(`${firstNames[i]}.${String.fromCharCode(97 + (i % 26))}`);
  }

  const LEGIT_IPS   = ['10.0.0.5', '10.0.0.6', '10.0.0.7', '10.0.0.8', '10.0.0.9'];
  const events = [];
  let t = new Date(base);

  // ── Background traffic (08:00–08:59) ────────────────────────────────────────
  let bgT = ago(base, { hours: 1 });
  while (bgT < base) {
    const user = ACCOUNTS[Math.floor(Math.random() * 20)]; // Only some users
    const ip   = LEGIT_IPS[Math.floor(Math.random() * LEGIT_IPS.length)];
    const port = 49000 + Math.floor(Math.random() * 5000);
    const pid  = 7000 + Math.floor(Math.random() * 500);
    events.push(`${syslogTs(bgT)} ${HOST} sshd[${pid}]: Accepted password for ${user} from ${ip} port ${port} ssh2`);
    bgT = addSeconds(bgT, 90 + Math.floor(Math.random() * 200));
  }

  // ── Spray attack (09:00–09:22) — 1-2 attempts per account ───────────────────
  t = addSeconds(base, 5);
  for (const user of ACCOUNTS) {
    const attempts = 1 + Math.floor(Math.random() * 2);
    for (let i = 0; i < attempts; i++) {
      const port = 52000 + Math.floor(Math.random() * 3000);
      const pid  = 8000 + Math.floor(Math.random() * 500);
      events.push(`${syslogTs(t)} ${HOST} sshd[${pid}]: Failed password for ${user} from ${ATTACKER} port ${port} ssh2`);
      t = addSeconds(t, 15 + Math.floor(Math.random() * 20));
    }
    // Small delay between accounts
    t = addSeconds(t, 5 + Math.floor(Math.random() * 10));
  }

  // ── Legitimate logins continue ───────────────────────────────────────────────
  let postT = new Date(base);
  const postEnd = addSeconds(base, 7200);
  while (postT < postEnd) {
    const user = ACCOUNTS[Math.floor(Math.random() * 15)];
    const ip   = LEGIT_IPS[Math.floor(Math.random() * LEGIT_IPS.length)];
    const port = 49000 + Math.floor(Math.random() * 5000);
    const pid  = 7000 + Math.floor(Math.random() * 500);
    events.push(`${syslogTs(postT)} ${HOST} sshd[${pid}]: Accepted password for ${user} from ${ip} port ${port} ssh2`);
    postT = addSeconds(postT, 120 + Math.floor(Math.random() * 300));
  }

  events.sort();
  return [{ events, sourcetype: 'auth', host: HOST }];
}

module.exports = { generate };
