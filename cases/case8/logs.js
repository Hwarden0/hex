'use strict';

// Case 8: Lateral Movement via SSH Key Hopping
// ~5,000 events. svc_account hops: attacker → web → db → admin.
// Answers discoverable via: stats dc(host) by user | sort -dc
// Sourcetypes: auth, sysmon, sudo

const { syslogTs, ago, addSeconds } = require('../../utils/time');
const {
  randInt, pick, LEGIT_INTERNAL, COMMON_USERS, SERVICE_USERS, ADMIN_USERS,
  kv, auth, sysmon, cron, authBackground, SURICATA_SIGS,
} = require('../../utils/logfmt');

function generate() {
  const base = new Date();
  base.setHours(20, 5, 0, 0);

  const ATTACKER_IP = '10.0.0.42';
  const WEB_IP      = '10.0.0.80';
  const DB_IP       = '10.0.0.81';
  const ADMIN_IP    = '10.0.0.82';

  const WEB_HOST   = 'web-server-01';
  const DB_HOST    = 'db-server-01';
  const ADMIN_HOST = 'admin-server-01';

  const USER = 'svc_account';

  // ── Auth events (all hosts combined) ─────────────────────────────────────
  const authEvents = [];

  // Background: 8 hours of normal auth across all hosts (~3,000 events)
  const bgStart = ago(base, { hours: 8 });
  authEvents.push(...authBackground({
    start: bgStart, end: addSeconds(base, 7200), count: 3000,
    destIp: pick([WEB_IP, DB_IP, ADMIN_IP]),
    users: [...COMMON_USERS.slice(0, 10), ...SERVICE_USERS],
  }));

  // ── HOP 1: attacker → web-server-01 at 20:05 ────────────────────────────
  const webPid = randInt(10000, 65000);
  authEvents.push(auth(base, {
    src_ip: ATTACKER_IP,
    dest_ip: WEB_IP,
    user: USER,
    action: 'login_success',
    status: 'success',
    service: 'sshd',
    auth_method: 'publickey',
    session_id: `sess_${webPid}`,
  }));

  authEvents.push(auth(addSeconds(base, 18), {
    src_ip: '127.0.0.1',
    dest_ip: WEB_IP,
    user: USER,
    action: 'login_success',
    status: 'success',
    service: 'sudo',
    auth_method: 'sudo',
  }));

  // ── HOP 2: web-server-01 → db-server-01 at 20:07 ────────────────────────
  const dbPid = randInt(10000, 65000);
  authEvents.push(auth(addSeconds(base, 120), {
    src_ip: WEB_IP,
    dest_ip: DB_IP,
    user: USER,
    action: 'login_success',
    status: 'success',
    service: 'sshd',
    auth_method: 'publickey',
    session_id: `sess_${dbPid}`,
  }));

  authEvents.push(auth(addSeconds(base, 145), {
    src_ip: '127.0.0.1',
    dest_ip: DB_IP,
    user: USER,
    action: 'login_success',
    status: 'success',
    service: 'sudo',
    auth_method: 'sudo',
  }));

  // ── HOP 3: db-server-01 → admin-server-01 at 20:13 ──────────────────────
  const adminPid = randInt(10000, 65000);
  authEvents.push(auth(addSeconds(base, 480), {
    src_ip: DB_IP,
    dest_ip: ADMIN_IP,
    user: USER,
    action: 'login_success',
    status: 'success',
    service: 'sshd',
    auth_method: 'publickey',
    session_id: `sess_${adminPid}`,
  }));

  // Backdoor created on admin server
  authEvents.push(auth(addSeconds(base, 495), {
    src_ip: '127.0.0.1',
    dest_ip: ADMIN_IP,
    user: 'svc_backup',
    action: 'account_created',
    status: 'success',
    service: 'useradd',
  }));

  // Session closures
  authEvents.push(auth(addSeconds(base, 900), {
    src_ip: ATTACKER_IP,
    dest_ip: WEB_IP,
    user: USER,
    action: 'logout',
    status: 'success',
    service: 'sshd',
  }));

  // ── Sysmon events ───────────────────────────────────────────────────────
  const sysmonEvents = [];

  // Background Sysmon (~800 events)
  const bgProcesses = [
    'C:\\Windows\\System32\\svchost.exe',
    'C:\\Windows\\System32\\lsass.exe',
    'C:\\Windows\\System32\\csrss.exe',
    'C:\\Program Files\\Chrome\\chrome.exe',
    'C:\\Windows\\System32\\explorer.exe',
  ];
  let smT = ago(base, { hours: 8 });
  while (smT < addSeconds(base, 7200)) {
    sysmonEvents.push(sysmon(smT, {
      event_id: 1,
      process: pick(bgProcesses),
      user: pick([...COMMON_USERS.slice(0, 8), 'SYSTEM']),
      parent_process: 'C:\\Windows\\System32\\services.exe',
    }));
    smT = addSeconds(smT, randInt(30, 120));
  }

  // THE SIGNAL: lateral movement process traces
  sysmonEvents.push(sysmon(addSeconds(base, 20), {
    event_id: 1,
    process: 'C:\\Windows\\System32\\ssh.exe',
    user: USER,
    parent_process: 'C:\\Windows\\System32\\cmd.exe',
    command_line: `ssh -i /home/${USER}/.ssh/id_rsa ${USER}@${DB_IP}`,
    dest_ip: DB_IP,
    dest_port: 22,
  }));
  sysmonEvents.push(sysmon(addSeconds(base, 130), {
    event_id: 1,
    process: 'C:\\Windows\\System32\\ssh.exe',
    user: USER,
    parent_process: 'C:\\Windows\\System32\\cmd.exe',
    command_line: `ssh ${USER}@${ADMIN_IP}`,
    dest_ip: ADMIN_IP,
    dest_port: 22,
  }));

  // ── Sudo events ──────────────────────────────────────────────────────────
  const sudoEvents = [];

  // Background sudo (~200 events)
  const legitSudoCmds = [
    '/usr/bin/systemctl restart nginx',
    '/usr/bin/systemctl status apache2',
    '/usr/sbin/logrotate /etc/logrotate.conf',
    '/usr/bin/apt-get update',
    '/usr/bin/tail -100 /var/log/syslog',
  ];
  let sudoT = ago(base, { hours: 8 });
  while (sudoT < addSeconds(base, 7200)) {
    if (Math.random() < 0.1) {
      sudoEvents.push(cron(sudoT, {
        user: pick([...COMMON_USERS.slice(0, 10), ...SERVICE_USERS]),
        command: pick(legitSudoCmds),
        status: 'success',
      }));
    }
    sudoT = addSeconds(sudoT, randInt(120, 600));
  }

  // THE SIGNAL: sudo commands during lateral movement
  sudoEvents.push(cron(addSeconds(base, 18), {
    user: USER,
    command: 'cat /etc/hosts',
    status: 'success',
  }));
  sudoEvents.push(cron(addSeconds(base, 23), {
    user: USER,
    command: `ssh -i /home/${USER}/.ssh/id_rsa ${USER}@${DB_IP}`,
    status: 'success',
  }));
  sudoEvents.push(cron(addSeconds(base, 145), {
    user: USER,
    command: 'cat /etc/shadow',
    status: 'success',
  }));
  sudoEvents.push(cron(addSeconds(base, 153), {
    user: USER,
    command: `ssh ${USER}@${ADMIN_IP}`,
    status: 'success',
  }));
  sudoEvents.push(cron(addSeconds(base, 490), {
    user: USER,
    command: '/bin/bash',
    status: 'success',
  }));

  authEvents.sort();
  sysmonEvents.sort();
  sudoEvents.sort();

  return [
    { events: authEvents, sourcetype: 'auth', host: WEB_HOST },
    { events: sysmonEvents, sourcetype: 'sysmon', host: WEB_HOST },
    { events: sudoEvents, sourcetype: 'sudo', host: WEB_HOST },
  ];
}

module.exports = { generate };
