'use strict';

// Case 3: Suspicious Off-Hours User Activity (Insider Threat)
// ~4,000 events. dbadmin accesses sensitive data at 02:14, exfiltrates via FTP.
// Answers discoverable via: stats count by user where _time < 06:00 AND _time > 22:00
// Sourcetypes: auth, mysql, ftp

const { syslogTs, ago, addSeconds } = require('../../utils/time');
const {
  randInt, pick, LEGIT_INTERNAL, COMMON_USERS, SERVICE_USERS,
  kv, auth, mysql, ftp, authBackground,
} = require('../../utils/logfmt');

function generate() {
  const base = new Date();
  base.setHours(2, 14, 0, 0);

  const HOST    = 'db-server-01';
  const HOST_IP = '10.0.0.30';
  const SRC     = '10.0.0.88';
  const USER    = 'dbadmin';

  // ── Auth events ───────────────────────────────────────────────────────────
  const authEvents = [];

  // Background: 24 hours of normal auth activity (~2,500 events)
  const bgStart = ago(base, { hours: 24 });
  authEvents.push(...authBackground({
    start: bgStart, end: addSeconds(base, 7200), count: 2500,
    destIp: HOST_IP,
    users: ['appuser', 'replication', 'monitor', 'backup', 'deploy'],
  }));

  // dbadmin SSH login at 02:14 (off-hours — the signal)
  const dbPid = randInt(10000, 65000);
  authEvents.push(auth(base, {
    src_ip: SRC,
    dest_ip: HOST_IP,
    user: USER,
    action: 'login_success',
    status: 'success',
    service: 'sshd',
    auth_method: 'password',
    session_id: `sess_${dbPid}`,
  }));

  // Logout after activity
  authEvents.push(auth(addSeconds(base, 520), {
    src_ip: SRC,
    dest_ip: HOST_IP,
    user: USER,
    action: 'logout',
    status: 'success',
    service: 'sshd',
    session_id: `sess_${dbPid}`,
  }));

  // ── MySQL events ─────────────────────────────────────────────────────────
  const mysqlEvents = [];

  // Background: normal daytime queries (~1,200 events)
  const normalQueries = [
    'SELECT id, name, status FROM orders WHERE status=\'pending\' LIMIT 100',
    'SELECT COUNT(*) FROM sessions WHERE last_seen > NOW() - INTERVAL 1 HOUR',
    'UPDATE sessions SET last_seen=NOW() WHERE user_id=' + randInt(1, 9999),
    'SELECT product_id, price FROM inventory WHERE stock < 10',
    'INSERT INTO audit_log (user_id, action, ts) VALUES (' + randInt(1, 500) + ', \'login\', NOW())',
  ];
  let mqT = ago(base, { hours: 10 });
  while (mqT < base) {
    const hr = mqT.getHours();
    if (hr >= 8 && hr <= 20) {
      mysqlEvents.push(mysql(mqT, {
        src_ip: pick(['10.0.0.10', '10.0.0.11', '10.0.0.12']),
        user: pick(['appuser', 'replication', 'monitor']),
        db: 'webapp',
        query: pick(normalQueries),
        query_time: (Math.random() * 0.5).toFixed(4),
        rows_sent: randInt(1, 100),
        rows_examined: randInt(50, 500),
        status: 'ok',
      }));
    } else {
      mysqlEvents.push(mysql(mqT, {
        src_ip: '127.0.0.1',
        user: 'replication',
        db: 'webapp',
        query: 'Slave I/O thread: connected to master replication@10.0.0.10:3306',
        status: 'ok',
      }));
    }
    mqT = addSeconds(mqT, randInt(15, 90));
  }

  // ── dbadmin suspicious queries at 02:14 ──────────────────────────────────
  let qT = addSeconds(base, 30);
  const connId = randInt(5000, 9999);

  mysqlEvents.push(mysql(qT, {
    src_ip: '127.0.0.1',
    user: 'root',
    db: 'customer_db',
    query: 'Access denied for user root@localhost',
    status: 'error',
  }));
  qT = addSeconds(qT, 8);
  mysqlEvents.push(mysql(qT, {
    src_ip: '127.0.0.1',
    user: USER,
    db: 'customer_db',
    query: 'CONNECT dbadmin@localhost on customer_db',
    status: 'ok',
  }));
  qT = addSeconds(qT, 3);
  mysqlEvents.push(mysql(qT, {
    src_ip: '127.0.0.1',
    user: USER,
    db: 'customer_db',
    query: 'SHOW TABLES',
    status: 'ok',
    rows_sent: randInt(20, 50),
  }));
  qT = addSeconds(qT, 2);
  mysqlEvents.push(mysql(qT, {
    src_ip: '127.0.0.1',
    user: USER,
    db: 'customer_db',
    query: 'SELECT COUNT(*) FROM customers',
    status: 'ok',
    rows_sent: 1,
  }));
  qT = addSeconds(qT, 4);
  mysqlEvents.push(mysql(qT, {
    src_ip: '127.0.0.1',
    user: USER,
    db: 'customer_db',
    query: 'SELECT * FROM customers LIMIT 10',
    status: 'ok',
    rows_sent: 10,
  }));
  qT = addSeconds(qT, 6);
  // THE SIGNAL: sensitive data access
  mysqlEvents.push(mysql(qT, {
    src_ip: '127.0.0.1',
    user: USER,
    db: 'customer_db',
    query: 'SELECT email, credit_card, billing_address FROM customers LIMIT 10000',
    status: 'ok',
    query_time: '3.482',
    rows_sent: 10000,
    rows_examined: 10000,
  }));
  qT = addSeconds(qT, 5);
  mysqlEvents.push(mysql(qT, {
    src_ip: '127.0.0.1',
    user: USER,
    db: 'customer_db',
    query: 'SELECT email, credit_card, billing_address FROM customers WHERE id > 10000 LIMIT 10000',
    status: 'ok',
    query_time: '4.123',
    rows_sent: 10000,
    rows_examined: 10000,
  }));
  qT = addSeconds(qT, 9);
  mysqlEvents.push(mysql(qT, {
    src_ip: '127.0.0.1',
    user: USER,
    db: 'customer_db',
    query: 'SELECT order_id, user_id, total, payment_method FROM orders',
    status: 'ok',
    query_time: '2.891',
    rows_sent: 50000,
    rows_examined: 50000,
  }));
  qT = addSeconds(qT, 4);
  mysqlEvents.push(mysql(qT, {
    src_ip: '127.0.0.1',
    user: USER,
    db: 'customer_db',
    query: 'QUIT',
    status: 'ok',
  }));

  // ── FTP events — data exfiltration ───────────────────────────────────────
  const ftpEventsArr = [];

  // Background: normal FTP activity (~150 events)
  let ftpBgT = ago(base, { hours: 24 });
  const normalFtpFiles = ['/inbox/daily_report.csv', '/inbox/log_archive.tar.gz', '/outbox/backup_daily.sql', '/inbox/config_update.yaml'];
  while (ftpBgT < base) {
    if (Math.random() < 0.3) {
      const ftpSrc = pick(LEGIT_INTERNAL);
      ftpEventsArr.push(ftp(ftpBgT, {
        src_ip: ftpSrc,
        user: pick(['backup', 'deploy', 'appuser']),
        action: 'download',
        file: pick(normalFtpFiles),
        bytes: randInt(1000, 500000),
        status: 'ok',
      }));
    }
    ftpBgT = addSeconds(ftpBgT, randInt(300, 900));
  }

  // dbadmin FTP exfil at 02:18
  let ftpT = addSeconds(base, 240);
  ftpEventsArr.push(ftp(ftpT, {
    src_ip: SRC,
    user: USER,
    action: 'login',
    status: 'ok',
  }));
  ftpT = addSeconds(ftpT, 4);
  ftpEventsArr.push(ftp(ftpT, {
    src_ip: SRC,
    user: USER,
    action: 'upload',
    file: '/outbox/customer_export_part1.csv',
    bytes: 4831200,
    status: 'ok',
  }));
  ftpT = addSeconds(ftpT, 8);
  ftpEventsArr.push(ftp(ftpT, {
    src_ip: SRC,
    user: USER,
    action: 'upload',
    file: '/outbox/customer_export_part2.csv',
    bytes: 5012480,
    status: 'ok',
  }));
  ftpT = addSeconds(ftpT, 6);
  ftpEventsArr.push(ftp(ftpT, {
    src_ip: SRC,
    user: USER,
    action: 'upload',
    file: '/outbox/orders_export.csv',
    bytes: 2194032,
    status: 'ok',
  }));
  ftpT = addSeconds(ftpT, 3);
  ftpEventsArr.push(ftp(ftpT, {
    src_ip: SRC,
    user: USER,
    action: 'logout',
    status: 'ok',
  }));

  authEvents.sort();
  mysqlEvents.sort();
  ftpEventsArr.sort();

  return [
    { events: authEvents, sourcetype: 'auth', host: HOST },
    { events: mysqlEvents, sourcetype: 'mysql', host: HOST },
    { events: ftpEventsArr, sourcetype: 'ftp', host: HOST },
  ];
}

module.exports = { generate };
