'use strict';

// Case 1: SSH Brute Force Attack — Splunk BOTC-style
// ~5,000 events. Attacker IP buried in dense legitimate traffic (~5%).
// Answers discoverable via: stats count by src_ip where action=login_failure | sort -count
// Sourcetypes: auth, suricata, syslog

const { syslogTs, ago, addSeconds } = require('../../utils/time');
const {
  randInt, pick, LEGIT_INTERNAL, COMMON_USERS, SERVICE_USERS, BRUTE_FORCE_USERS,
  kv, auth, suricata, syslog, authBackground, SURICATA_SIGS,
} = require('../../utils/logfmt');

function generate() {
  const base = new Date();
  base.setHours(14, 23, 0, 0);

  const HOST    = 'prod-server-01';
  const HOST_IP = '10.0.0.1';

  // Attacker — looks identical to every other IP until aggregated
  const ATK_IP = '40.80.148.42';

  // ── Auth events ───────────────────────────────────────────────────────────
  const authEvents = [];

  // Dense background: 2 hours of normal SSH activity (~4,500 events)
  const bgStart = ago(base, { hours: 2, minutes: 23 });
  authEvents.push(...authBackground({
    start: bgStart, end: addSeconds(base, 3600), count: 4500,
    destIp: HOST_IP,
    users: [...COMMON_USERS, ...SERVICE_USERS],
  }));

  // ── Brute force attack: 247 rapid attempts from ATK_IP ────────────────────
  let t = addSeconds(base, 60);
  for (let i = 0; i < 247; i++) {
    const user = BRUTE_FORCE_USERS[i % BRUTE_FORCE_USERS.length];
    authEvents.push(auth(t, {
      src_ip: ATK_IP,
      dest_ip: HOST_IP,
      user,
      action: 'login_failure',
      status: 'failure',
      service: 'sshd',
      auth_method: 'password',
      failure_reason: 'invalid_credentials',
    }));
    t = addSeconds(t, randInt(1, 3));
  }

  // A few legitimate-looking failures from random IPs (red herrings)
  let redHerringT = ago(base, { hours: 2 });
  while (redHerringT < addSeconds(base, 3600)) {
    if (Math.random() < 0.08) {
      authEvents.push(auth(redHerringT, {
        src_ip: pick(LEGIT_INTERNAL),
        dest_ip: HOST_IP,
        user: pick([...COMMON_USERS, 'root', 'admin']),
        action: 'login_failure',
        status: 'failure',
        service: 'sshd',
        auth_method: 'publickey',
        failure_reason: 'key_mismatch',
      }));
    }
    redHerringT = addSeconds(redHerringT, randInt(30, 120));
  }

  // ── Suricata IDS alerts ───────────────────────────────────────────────────
  const suricataEvents = [];
  // IDS fires on brute force pattern — but alert doesn't name the attacker obviously
  // Multiple alerts fire for different threshold crossings
  const sig = SURICATA_SIGS.ssh_brute;
  const alertTimes = [
    addSeconds(base, 90),
    addSeconds(base, 150),
    addSeconds(base, 210),
    addSeconds(base, 300),
  ];
  for (const at of alertTimes) {
    suricataEvents.push(suricata(at, {
      src_ip: ATK_IP,
      dest_ip: HOST_IP,
      dest_port: 22,
      proto: 'TCP',
      action: 'alert',
      ...sig,
    }));
  }
  // Background noise IDS alerts (different IPs, lower severity)
  const noiseSigs = [SURICATA_SIGS.port_scan];
  for (let i = 0; i < 15; i++) {
    const nt = addSeconds(ago(base, { hours: 2 }), randInt(0, 14400));
    suricataEvents.push(suricata(nt, {
      src_ip: pick(LEGIT_INTERNAL),
      dest_ip: HOST_IP,
      dest_port: randInt(1, 65535),
      proto: 'TCP',
      action: 'alert',
      ...noiseSigs[0],
    }));
  }

  // ── Syslog system noise ──────────────────────────────────────────────────
  const syslogEvents = [];
  const noiseGenerators = [
    (t) => syslog(t, { host: HOST, service: 'systemd', message: `Started session ${randInt(100, 9999)} of user ${pick([...COMMON_USERS, ...SERVICE_USERS])}` }),
    (t) => syslog(t, { host: HOST, service: 'CRON', message: `(root) CMD (run-parts /etc/cron.hourly)` }),
    (t) => syslog(t, { host: HOST, service: 'sudo', message: `${pick(COMMON_USERS)} : TTY=pts/${randInt(0, 5)} ; PWD=/home/${pick(COMMON_USERS)} ; USER=root ; COMMAND=/usr/bin/systemctl status nginx` }),
    (t) => syslog(t, { host: HOST, service: 'rsyslogd', message: '[origin software="rsyslogd"] rsyslogd was HUPed' }),
    (t) => syslog(t, { host: HOST, service: 'kernel', message: `NET: Registered PF_KEY protocol family` }),
    (t) => syslog(t, { host: HOST, service: 'sshd', message: `Server listening on 0.0.0.0 port 22` }),
    (t) => syslog(t, { host: HOST, service: 'systemd-logind', message: `New session ${randInt(100, 9999)} of user ${pick(SERVICE_USERS)}` }),
  ];
  let noiseT = ago(base, { hours: 2, minutes: 23 });
  while (noiseT < addSeconds(base, 3600)) {
    if (Math.random() < 0.3) {
      syslogEvents.push(pick(noiseGenerators)(noiseT));
    }
    noiseT = addSeconds(noiseT, randInt(15, 60));
  }

  authEvents.sort();
  suricataEvents.sort();
  syslogEvents.sort();

  return [
    { events: authEvents, sourcetype: 'auth', host: HOST },
    { events: suricataEvents, sourcetype: 'suricata', host: HOST },
    { events: syslogEvents, sourcetype: 'syslog', host: HOST },
  ];
}

module.exports = { generate };
