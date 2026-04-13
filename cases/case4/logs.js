'use strict';

// Case 4: Password Spraying — Windows AD
// ~5,000 events. Attacker tries one password across 45 accounts. No success.
// Answers discoverable via: stats dc(user) by src_ip where event_id=4625 | sort -dc
// Sourcetypes: wineventlog, auth, sysmon

const { syslogTs, ago, addSeconds } = require('../../utils/time');
const {
  randInt, pick, LEGIT_INTERNAL, COMMON_USERS, ADMIN_USERS,
  kv, winEventLog, auth, sysmon, winAuthBackground, authBackground,
} = require('../../utils/logfmt');

function generate() {
  const base = new Date();
  base.setHours(9, 0, 0, 0);

  const HOST     = 'ldap-dc01';
  const HOST_IP  = '10.0.0.1';
  const ATK_IP   = '10.0.0.200';
  const DOMAIN   = 'CORP';

  // Generate 45 unique account names
  const firstNames = ['john','jane','mike','sarah','david','lisa','chris','emily','james','ashley',
    'robert','jessica','daniel','amanda','ryan','stephanie','matthew','nicole',
    'andrew','heather','joshua','amber','justin','megan','brandon','rachel',
    'tyler','lauren','samuel','brittany','kevin','kayla','eric','alexis',
    'nathan','alyssa','zachary','courtney','jacob','crystal','adam','tiffany',
    'steven','vanessa','timothy'];
  const ACCOUNTS = firstNames.map((n, i) => `${n}.${String.fromCharCode(97 + (i % 26))}`);

  // ── Windows Event Log (primary) ──────────────────────────────────────────
  const winEvents = [];

  // Background: 3 hours of normal AD auth (~3,000 events)
  const bgStart = ago(base, { hours: 3 });
  winEvents.push(...winAuthBackground({
    start: bgStart, end: addSeconds(base, 7200), count: 3000,
  }));

  // Password spray: low-and-slow across 45 accounts
  let t = addSeconds(base, 10);
  for (const user of ACCOUNTS) {
    const tries = randInt(1, 3);
    for (let i = 0; i < tries; i++) {
      winEvents.push(winEventLog(t, {
        event_id: 4625,
        src_ip: ATK_IP,
        user: `${user}@${DOMAIN}.local`,
        logon_type: 3,
        status: 'failure',
        domain: DOMAIN,
        status_code: '0xC000006D',
        sub_status: '0xC000006A',
        workstation: '-',
      }));
      t = addSeconds(t, randInt(12, 28));
    }
    t = addSeconds(t, randInt(3, 8));
  }

  // ── Sysmon events ────────────────────────────────────────────────────────
  const sysmonEvents = [];

  // Background Sysmon: normal process creation (~800 events)
  const bgProcesses = [
    'C:\\Windows\\System32\\svchost.exe',
    'C:\\Windows\\System32\\lsass.exe',
    'C:\\Windows\\System32\\csrss.exe',
    'C:\\Windows\\System32\\winlogon.exe',
    'C:\\Windows\\System32\\services.exe',
    'C:\\Program Files\\Microsoft AD Health\\AgentMonitor.exe',
    'C:\\Windows\\System32\\taskeng.exe',
  ];
  let smT = ago(base, { hours: 3 });
  while (smT < addSeconds(base, 7200)) {
    sysmonEvents.push(sysmon(smT, {
      event_id: 1,
      process: pick(bgProcesses),
      user: 'SYSTEM',
      parent_process: 'C:\\Windows\\System32\\services.exe',
    }));
    smT = addSeconds(smT, randInt(10, 60));
  }

  // Sysmon: attacker host process (network connection from attacker)
  sysmonEvents.push(sysmon(addSeconds(base, 5), {
    event_id: 3,
    process: 'C:\\Windows\\System32\\lsass.exe',
    src_ip: ATK_IP,
    dest_ip: HOST_IP,
    dest_port: 445,
    user: 'SYSTEM',
  }));
  sysmonEvents.push(sysmon(addSeconds(base, 15), {
    event_id: 3,
    process: 'C:\\Windows\\System32\\lsass.exe',
    src_ip: ATK_IP,
    dest_ip: HOST_IP,
    dest_port: 445,
    user: 'SYSTEM',
  }));

  // ── Auth events (SSH fallback on DC) ─────────────────────────────────────
  const authEvents = [];
  authEvents.push(...authBackground({
    start: ago(base, { hours: 3 }), end: addSeconds(base, 7200), count: 200,
    destIp: HOST_IP,
  }));

  winEvents.sort();
  sysmonEvents.sort();
  authEvents.sort();

  return [
    { events: winEvents, sourcetype: 'wineventlog', host: HOST },
    { events: sysmonEvents, sourcetype: 'sysmon', host: HOST },
    { events: authEvents, sourcetype: 'auth', host: HOST },
  ];
}

module.exports = { generate };
