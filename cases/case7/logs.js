'use strict';

// Case 7: Suspicious Outbound Traffic / Data Exfiltration
// ~8,000 events. 10.0.0.25 exfiltrates ~1.5GB to external IP over 42 minutes.
// Answers discoverable via: stats sum(bytes) by dest_ip | sort -sum
// Sourcetypes: firewall, stream_http, sysmon

const { syslogTs, ago, addSeconds } = require('../../utils/time');
const {
  randInt, pick, LEGIT_INTERNAL, LEGIT_EXTERNAL, COMMON_USERS, SERVICE_USERS, NORMAL_UAS,
  kv, firewall, streamHttp, sysmon, fwBackground, httpBackground, SURICATA_SIGS,
} = require('../../utils/logfmt');

function generate() {
  const base = new Date();
  base.setHours(3, 10, 0, 0);

  const HOST     = 'fw-edge-01';
  const INTERNAL = '10.0.0.25';
  const EXTERNAL = '185.220.101.42';
  const EXT_PORT = 4444;

  // ── Firewall events (primary) ────────────────────────────────────────────
  const fwEvents = [];

  // Background: 4 hours of normal outbound traffic (~5,000 events)
  const bgStart = ago(base, { hours: 4 });
  fwEvents.push(...fwBackground({
    start: bgStart, end: addSeconds(base, 7200), count: 5000,
  }));

  // DNS lookup for C2 before connection (pre-exfil recon)
  const dnsT = addSeconds(base, -30);
  fwEvents.push(firewall(dnsT, {
    src_ip: INTERNAL,
    dest_ip: '8.8.8.8',
    dest_port: 53,
    proto: 'UDP',
    action: 'allow',
    bytes: 78,
    direction: 'outbound',
  }));

  // Connection SYN
  fwEvents.push(firewall(base, {
    src_ip: INTERNAL,
    dest_ip: EXTERNAL,
    dest_port: EXT_PORT,
    proto: 'TCP',
    action: 'allow',
    bytes: 60,
    direction: 'outbound',
    src_port: 50000,
    flags: 'SYN',
  }));
  // SYN-ACK
  fwEvents.push(firewall(addSeconds(base, 0), {
    src_ip: EXTERNAL,
    dest_ip: INTERNAL,
    dest_port: 50000,
    proto: 'TCP',
    action: 'allow',
    bytes: 60,
    direction: 'inbound',
    src_port: EXT_PORT,
    flags: 'SYN ACK',
  }));

  // ── Exfiltration flow records every 30s for 42 minutes ───────────────────
  const TARGET_BYTES = 1547862400;
  const FLOWS_TOTAL = 84;
  const BYTES_PER_FLOW = Math.floor(TARGET_BYTES / FLOWS_TOTAL);
  let exfilT = addSeconds(base, 1);
  let cumBytes = 0;
  for (let i = 0; i < FLOWS_TOTAL; i++) {
    const bytes = i === FLOWS_TOTAL - 1
      ? TARGET_BYTES - cumBytes
      : BYTES_PER_FLOW + randInt(-25000, 25000);
    cumBytes += bytes;
    fwEvents.push(firewall(exfilT, {
      src_ip: INTERNAL,
      dest_ip: EXTERNAL,
      dest_port: EXT_PORT,
      proto: 'TCP',
      action: 'allow',
      bytes: 1440,
      direction: 'outbound',
      src_port: 50000,
      flags: 'ACK PSH',
      session_id: `sess_${i}`,
    }));
    // Periodic ACKs inbound
    if (i % 5 === 0) {
      fwEvents.push(firewall(addSeconds(exfilT, 1), {
        src_ip: EXTERNAL,
        dest_ip: INTERNAL,
        dest_port: 50000,
        proto: 'TCP',
        action: 'allow',
        bytes: 40,
        direction: 'inbound',
        src_port: EXT_PORT,
        flags: 'ACK',
        session_id: `sess_${i}`,
      }));
    }
    exfilT = addSeconds(exfilT, 30);
  }

  // Connection teardown
  const endT = addSeconds(base, FLOWS_TOTAL * 30 + 5);
  fwEvents.push(firewall(endT, {
    src_ip: INTERNAL,
    dest_ip: EXTERNAL,
    dest_port: EXT_PORT,
    proto: 'TCP',
    action: 'allow',
    bytes: 40,
    direction: 'outbound',
    src_port: 50000,
    flags: 'FIN ACK',
  }));

  // ── HTTP events (web activity on internal host) ──────────────────────────
  const httpEvents = [];

  // Normal web traffic on the exfiltrating host (~1,500 events)
  const bgStart2 = ago(base, { hours: 4 });
  httpEvents.push(...httpBackground({
    start: bgStart2, end: addSeconds(base, 7200), count: 1500,
    destIp: INTERNAL,
  }));

  // ── Sysmon events (endpoint on exfiltrating host) ────────────────────────
  const sysmonEvents = [];

  // Background Sysmon (~800 events)
  const bgProcesses = [
    'C:\\Windows\\System32\\svchost.exe',
    'C:\\Windows\\System32\\lsass.exe',
    'C:\\Windows\\System32\\csrss.exe',
    'C:\\Program Files\\Chrome\\chrome.exe',
    'C:\\Program Files\\Outlook\\outlook.exe',
    'C:\\Windows\\System32\\explorer.exe',
  ];
  let smT = ago(base, { hours: 4 });
  while (smT < addSeconds(base, 7200)) {
    sysmonEvents.push(sysmon(smT, {
      event_id: 1,
      process: pick(bgProcesses),
      user: pick([...COMMON_USERS.slice(0, 8), 'SYSTEM']),
      parent_process: 'C:\\Windows\\System32\\services.exe',
    }));
    smT = addSeconds(smT, randInt(15, 90));
  }

  // THE SIGNAL: suspicious process on exfiltrating host (data staging)
  sysmonEvents.push(sysmon(addSeconds(base, -60), {
    event_id: 1,
    process: 'C:\\Users\\svc_export\\AppData\\Local\\Temp\\data_export.exe',
    user: 'svc_export',
    parent_process: 'C:\\Windows\\System32\\cmd.exe',
    command_line: 'data_export.exe --output \\\\tmp\\\\export.zip --compress',
    hash: 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4',
  }));

  fwEvents.sort();
  httpEvents.sort();
  sysmonEvents.sort();

  return [
    { events: fwEvents, sourcetype: 'firewall', host: HOST },
    { events: httpEvents, sourcetype: 'stream_http', host: 'web-proxy-01' },
    { events: sysmonEvents, sourcetype: 'sysmon', host: 'workstation-25' },
  ];
}

module.exports = { generate };
