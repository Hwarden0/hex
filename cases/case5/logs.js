'use strict';

// Case 5: Privilege Escalation via sudo vim (GTFOBins)
// ~4,000 events. webuser runs sudo vim, spawns root shell via :!/bin/bash.
// Answers discoverable via: stats count by user where "sudo" AND euid=0 | sort -count
// Sourcetypes: auth, sudo, audit

const { syslogTs, ago, addSeconds } = require('../../utils/time');
const {
  randInt, pick, LEGIT_INTERNAL, COMMON_USERS, SERVICE_USERS,
  kv, auth, audit, cron, authBackground,
} = require('../../utils/logfmt');

function generate() {
  const base = new Date();
  base.setHours(16, 45, 0, 0);

  const HOST     = 'web-server-02';
  const HOST_IP  = '10.0.0.50';
  const ATK_IP   = '10.0.0.42';
  const USER     = 'webuser';

  // ── Auth events ───────────────────────────────────────────────────────────
  const authEvents = [];

  // Background: 8 hours of normal auth (~3,000 events)
  const bgStart = ago(base, { hours: 8 });
  authEvents.push(...authBackground({
    start: bgStart, end: addSeconds(base, 3600), count: 3000,
    destIp: HOST_IP,
    users: [...COMMON_USERS.slice(0, 10), ...SERVICE_USERS],
  }));

  // Attacker SSH as webuser
  const webPid = randInt(10000, 65000);
  authEvents.push(auth(base, {
    src_ip: ATK_IP,
    dest_ip: HOST_IP,
    user: USER,
    action: 'login_success',
    status: 'success',
    service: 'sshd',
    auth_method: 'publickey',
    session_id: `sess_${webPid}`,
  }));

  // webuser logout
  authEvents.push(auth(addSeconds(base, 600), {
    src_ip: ATK_IP,
    dest_ip: HOST_IP,
    user: USER,
    action: 'logout',
    status: 'success',
    service: 'sshd',
    session_id: `sess_${webPid}`,
  }));

  // Backdoor user created (the evidence)
  authEvents.push(auth(addSeconds(base, 145), {
    src_ip: '127.0.0.1',
    dest_ip: HOST_IP,
    user: 'backdoor',
    action: 'account_created',
    status: 'success',
    service: 'useradd',
  }));

  // ── Sudo events ──────────────────────────────────────────────────────────
  const sudoEvents = [];

  // Background sudo noise (~300 events)
  const legitSudoCmds = [
    '/usr/bin/systemctl restart nginx',
    '/usr/bin/systemctl status apache2',
    '/usr/sbin/logrotate /etc/logrotate.conf',
    '/usr/bin/apt-get update',
    '/usr/bin/tail -100 /var/log/syslog',
    '/usr/bin/journalctl -u nginx --no-pager',
  ];
  let sudoT = ago(base, { hours: 8 });
  while (sudoT < addSeconds(base, 3600)) {
    if (Math.random() < 0.15) {
      sudoEvents.push(cron(sudoT, {
        user: pick([...COMMON_USERS.slice(0, 10), ...SERVICE_USERS]),
        command: pick(legitSudoCmds),
        status: 'success',
      }));
    }
    sudoT = addSeconds(sudoT, randInt(60, 300));
  }

  // THE SIGNAL: sudo vim /etc/passwd
  sudoEvents.push(cron(addSeconds(base, 90), {
    user: USER,
    command: 'sudo vim /etc/passwd',
    status: 'success',
  }));
  // Session opened
  sudoEvents.push(cron(addSeconds(base, 91), {
    user: 'root',
    command: `pam_unix(sudo:session): session opened for user root by ${USER}(uid=1005)`,
    status: 'success',
  }));

  // Session closed
  sudoEvents.push(cron(addSeconds(base, 300), {
    user: 'root',
    command: `pam_unix(sudo:session): session closed for user root`,
    status: 'success',
  }));

  // ── Audit events ─────────────────────────────────────────────────────────
  const auditEvents = [];

  // Background audit: normal syscall activity (~1,200 events)
  const normalSyscalls = ['openat', 'read', 'write', 'stat', 'access', 'getdents'];
  let atT = ago(base, { hours: 8 });
  while (atT < addSeconds(base, 3600)) {
    if (Math.random() < 0.25) {
      auditEvents.push(audit(atT, {
        type: 'SYSCALL',
        syscall: pick(normalSyscalls),
        pid: randInt(1000, 65000),
        user: pick(SERVICE_USERS),
        euid: 1000,
        comm: pick(['bash', 'nginx', 'php-fpm', 'node']),
        exe: pick(['/bin/bash', '/usr/sbin/nginx', '/usr/bin/php-fpm', '/usr/bin/node']),
        key: 'normal',
      }));
    }
    atT = addSeconds(atT, randInt(30, 120));
  }

  // THE SIGNAL: vim spawns shell with euid=0
  const ats1 = Math.floor(base.getTime() / 1000) + '.' + randInt(100, 999);
  const aserial1 = randInt(4500, 5000);
  auditEvents.push(audit(addSeconds(base, 105), {
    type: 'SYSCALL',
    syscall: 'execve',
    pid: randInt(10000, 65000),
    ppid: webPid,
    user: USER,
    euid: 0,
    comm: 'vim',
    exe: '/usr/bin/vim',
    key: 'escalation',
    command_line: 'vim /etc/passwd',
  }));

  // bash spawned from vim
  auditEvents.push(audit(addSeconds(base, 120), {
    type: 'SYSCALL',
    syscall: 'execve',
    pid: randInt(10000, 65000),
    user: 'root',
    euid: 0,
    comm: 'bash',
    exe: '/bin/bash',
    key: 'shell_spawn',
    command_line: '/bin/bash -i',
  }));

  // Root commands executed
  auditEvents.push(audit(addSeconds(base, 125), {
    type: 'SYSCALL',
    syscall: 'execve',
    pid: randInt(10000, 65000),
    user: 'root',
    euid: 0,
    comm: 'id',
    exe: '/usr/bin/id',
    key: 'escalation',
  }));
  auditEvents.push(audit(addSeconds(base, 128), {
    type: 'SYSCALL',
    syscall: 'openat',
    pid: randInt(10000, 65000),
    user: 'root',
    euid: 0,
    comm: 'cat',
    exe: '/bin/cat',
    key: 'sensitive_file',
    path: '/etc/shadow',
  }));

  // Backdoor user creation audit trail
  auditEvents.push(audit(addSeconds(base, 145), {
    type: 'ADD_USER',
    syscall: 'execve',
    pid: randInt(10000, 65000),
    user: 'root',
    euid: 0,
    comm: 'useradd',
    exe: '/usr/sbin/useradd',
    key: 'user_creation',
    command_line: `useradd -o -u 0 -g 0 -M -d /root -s /bin/bash backdoor`,
  }));

  authEvents.sort();
  sudoEvents.sort();
  auditEvents.sort();

  return [
    { events: authEvents, sourcetype: 'auth', host: HOST },
    { events: sudoEvents, sourcetype: 'sudo', host: HOST },
    { events: auditEvents, sourcetype: 'audit', host: HOST },
  ];
}

module.exports = { generate };
