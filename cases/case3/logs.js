'use strict';

const { syslogTs, ago, addSeconds } = require('../../utils/time');

// Case 3: Suspicious User Activity (Multi-Service)
// dbadmin accesses SSH + MySQL + FTP during off-hours starting at 02:14

function generate() {
  const base = new Date();
  base.setHours(2, 14, 0, 0);

  const HOST = 'db-server-01';
  const SRC  = '10.0.0.88';

  const authEvents = [];
  const mysqlEvents = [];
  const ftpEvents   = [];

  // ── SSH login at 02:14 ────────────────────────────────────────────────────────
  authEvents.push(`${syslogTs(base)} ${HOST} sshd[8800]: Accepted password for dbadmin from ${SRC} port 55200 ssh2`);
  authEvents.push(`${syslogTs(addSeconds(base, 2))} ${HOST} sshd[8800]: pam_unix(sshd:session): session opened for user dbadmin by (uid=0)`);

  // ── MySQL activity ────────────────────────────────────────────────────────────
  let t = addSeconds(base, 45);
  mysqlEvents.push(`${syslogTs(t)} ${HOST} mysqld: [Note] Access denied for user 'root'@'localhost' (using password: YES)`);
  t = addSeconds(t, 10);
  mysqlEvents.push(`${syslogTs(t)} ${HOST} mysqld: [Note] Connect: dbadmin@localhost on customer_db`);
  t = addSeconds(t, 5);
  mysqlEvents.push(`${syslogTs(t)} ${HOST} mysqld: Query  SELECT * FROM customers`);
  t = addSeconds(t, 3);
  mysqlEvents.push(`${syslogTs(t)} ${HOST} mysqld: Query  SELECT * FROM orders WHERE year=2024`);
  t = addSeconds(t, 8);
  mysqlEvents.push(`${syslogTs(t)} ${HOST} mysqld: Query  SELECT email, credit_card FROM customers LIMIT 10000`);
  t = addSeconds(t, 12);
  mysqlEvents.push(`${syslogTs(t)} ${HOST} mysqld: [Note] Aborted connection 1024 to db: 'customer_db' user: 'dbadmin'`);

  // ── FTP upload (data exfil) ───────────────────────────────────────────────────
  t = addSeconds(base, 240);
  ftpEvents.push(`${syslogTs(t)} ${HOST} vsftpd[9100]: CONNECT: Client "10.0.0.88"`);
  t = addSeconds(t, 3);
  ftpEvents.push(`${syslogTs(t)} ${HOST} vsftpd[9100]: OK LOGIN: Client "10.0.0.88", anon_password "dbadmin@"`);
  t = addSeconds(t, 5);
  ftpEvents.push(`${syslogTs(t)} ${HOST} vsftpd[9100]: OK UPLOAD: Client "10.0.0.88", "/outbox/customer_export.csv", 4831200 bytes`);
  t = addSeconds(t, 8);
  ftpEvents.push(`${syslogTs(t)} ${HOST} vsftpd[9100]: OK UPLOAD: Client "10.0.0.88", "/outbox/orders_export.csv", 2194032 bytes`);
  t = addSeconds(t, 5);
  ftpEvents.push(`${syslogTs(t)} ${HOST} vsftpd[9100]: OK DISCONNECT: Client "10.0.0.88"`);

  // ── SSH logout ────────────────────────────────────────────────────────────────
  t = addSeconds(base, 520);
  authEvents.push(`${syslogTs(t)} ${HOST} sshd[8800]: pam_unix(sshd:session): session closed for user dbadmin`);

  // ── Normal daytime activity for other users ───────────────────────────────────
  const normalStart = ago(base, { hours: 6 });
  let normalT = new Date(normalStart);
  const normalUsers = ['appuser', 'replication', 'monitor'];
  while (normalT < addSeconds(base, 7200)) {
    if (normalT.getHours() >= 8 && normalT.getHours() <= 18) {
      const u = normalUsers[Math.floor(Math.random() * normalUsers.length)];
      authEvents.push(`${syslogTs(normalT)} ${HOST} sshd[${8000 + Math.floor(Math.random() * 500)}]: Accepted password for ${u} from 10.0.0.${10 + Math.floor(Math.random() * 20)} port ${49000 + Math.floor(Math.random() * 5000)} ssh2`);
    }
    normalT = addSeconds(normalT, 600 + Math.floor(Math.random() * 600));
  }

  authEvents.sort();
  mysqlEvents.sort();
  ftpEvents.sort();

  return [
    { events: authEvents,  sourcetype: 'auth',  host: HOST },
    { events: mysqlEvents, sourcetype: 'mysql', host: HOST },
    { events: ftpEvents,   sourcetype: 'ftp',   host: HOST },
  ];
}

module.exports = { generate };
