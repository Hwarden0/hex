'use strict';

const { syslogTs, ago, addSeconds } = require('../../utils/time');

// Case 5: Privilege Escalation via Sudo Abuse
// webuser SSHs in, then uses vim sudo misconfiguration to spawn root shell

function generate() {
  const base = new Date();
  base.setHours(16, 45, 0, 0);

  const HOST     = 'web-server-02';
  const ATTACKER = '10.0.0.42';

  const authEvents   = [];
  const sudoEvents   = [];
  const auditEvents  = [];

  // ── Initial SSH login as webuser ────────────────────────────────────────────
  let t = new Date(base);
  authEvents.push(`${syslogTs(t)} ${HOST} sshd[14200]: Accepted publickey for webuser from ${ATTACKER} port 56123 ssh2`);
  t = addSeconds(t, 2);
  authEvents.push(`${syslogTs(t)} ${HOST} sshd[14200]: pam_unix(sshd:session): session opened for user webuser by (uid=1005)`);

  // ── sudo vim escalation ──────────────────────────────────────────────────────
  t = addSeconds(base, 90);
  sudoEvents.push(`${syslogTs(t)} ${HOST} sudo: webuser : TTY=pts/2 ; PWD=/home/webuser ; USER=root ; COMMAND=/usr/bin/vim /etc/passwd`);
  t = addSeconds(t, 15);
  // vim spawns shell via :!/bin/bash
  auditEvents.push(`${syslogTs(t)} ${HOST} audit[1]: type=EXECVE msg=audit(${Date.now() / 1000 | 0}.012:102): argc=2 a0="/bin/bash" a1="-i"`);
  auditEvents.push(`${syslogTs(t)} ${HOST} audit[1]: type=SYSCALL msg=audit(${Date.now() / 1000 | 0}.012:102): arch=x86_64 syscall=execve success=yes exit=0 ppid=14203 pid=14250 uid=0 gid=0 euid=0 egid=0 tty=pts2 ses=44 comm="bash" exe="/bin/bash"`);

  // ── Actions taken as root ────────────────────────────────────────────────────
  t = addSeconds(base, 120);
  auditEvents.push(`${syslogTs(t)} ${HOST} audit[1]: type=SYSCALL msg=audit(...): exe="/usr/bin/id" uid=0`);
  t = addSeconds(t, 5);
  auditEvents.push(`${syslogTs(t)} ${HOST} audit[1]: type=SYSCALL msg=audit(...): exe="/usr/bin/whoami" uid=0`);
  t = addSeconds(t, 8);
  auditEvents.push(`${syslogTs(t)} ${HOST} audit[1]: type=PATH msg=audit(...): item=0 name="/etc/shadow" inode=524294 dev=08:01 mode=0640 ouid=0 ogid=42 rdev=00:00`);
  t = addSeconds(t, 3);
  auditEvents.push(`${syslogTs(t)} ${HOST} audit[1]: type=SYSCALL msg=audit(...): exe="/bin/cat" uid=0 a0="/etc/shadow"`);
  t = addSeconds(t, 12);
  // Add new user
  authEvents.push(`${syslogTs(t)} ${HOST} useradd[14300]: new user: name=backdoor, UID=0, GID=0, home=/root, shell=/bin/bash`);
  authEvents.push(`${syslogTs(addSeconds(t, 2))} ${HOST} passwd[14301]: password changed for backdoor`);

  // ── Logout ────────────────────────────────────────────────────────────────────
  t = addSeconds(base, 600);
  authEvents.push(`${syslogTs(t)} ${HOST} sshd[14200]: pam_unix(sshd:session): session closed for user webuser`);

  // ── Normal background activity ────────────────────────────────────────────────
  const normalUsers = ['appuser', 'deploy', 'monitor'];
  let bgT = ago(base, { hours: 3 });
  while (bgT < addSeconds(base, 3600)) {
    if (Math.abs(bgT - base) > 30000) { // Not during incident window
      const u = normalUsers[Math.floor(Math.random() * normalUsers.length)];
      authEvents.push(`${syslogTs(bgT)} ${HOST} sshd[${9000 + Math.floor(Math.random() * 1000)}]: Accepted password for ${u} from 10.0.0.${10 + Math.floor(Math.random() * 10)} port ${49000 + Math.floor(Math.random() * 5000)} ssh2`);
    }
    bgT = addSeconds(bgT, 300 + Math.floor(Math.random() * 600));
  }

  authEvents.sort();
  sudoEvents.sort();
  auditEvents.sort();

  return [
    { events: authEvents,  sourcetype: 'auth',  host: HOST },
    { events: sudoEvents,  sourcetype: 'sudo',  host: HOST },
    { events: auditEvents, sourcetype: 'audit', host: HOST },
  ];
}

module.exports = { generate };
