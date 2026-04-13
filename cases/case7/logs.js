'use strict';

const { syslogTs, ago, addSeconds } = require('../../utils/time');

// Case 7: Suspicious Outbound Traffic
// 10.0.0.25 exfiltrates ~1.5GB to 185.220.101.42:4444 over TCP

function generate() {
  const base = new Date();
  base.setHours(3, 10, 0, 0);

  const HOST     = 'firewall-01';
  const INTERNAL = '10.0.0.25';
  const EXTERNAL = '185.220.101.42';
  const EXT_PORT = 4444;

  const fwEvents = [];

  // ── Normal internal traffic (01:00–03:09) ────────────────────────────────────
  const legitimateFlows = [
    { src: '10.0.0.10', dst: '8.8.8.8',       dpt: 53,  len: 80  },
    { src: '10.0.0.11', dst: '1.1.1.1',        dpt: 53,  len: 80  },
    { src: '10.0.0.12', dst: '93.184.216.34',  dpt: 443, len: 1400 },
    { src: '10.0.0.15', dst: '151.101.1.69',   dpt: 443, len: 1400 },
    { src: '10.0.0.20', dst: '52.84.12.54',    dpt: 443, len: 1400 },
  ];

  let bgT = ago(base, { hours: 2, minutes: 10 });
  while (bgT < base) {
    const f   = legitimateFlows[Math.floor(Math.random() * legitimateFlows.length)];
    const pid = 1000 + Math.floor(Math.random() * 200);
    fwEvents.push(`${syslogTs(bgT)} ${HOST} kernel: [${pid}.000] iptables: IN= OUT=eth0 SRC=${f.src} DST=${f.dst} LEN=${f.len} TTL=64 ID=12345 PROTO=TCP SPT=${40000 + Math.floor(Math.random() * 10000)} DPT=${f.dpt} WINDOW=65535 ACK SYN`);
    bgT = addSeconds(bgT, 10 + Math.floor(Math.random() * 30));
  }

  // ── Exfiltration session (03:10 – 03:52) ─────────────────────────────────────
  // ~1.5GB = ~1072 packets of ~1440 bytes each (simplified)
  // Actual: stream represented by flow records with cumulative bytes
  let t = new Date(base);
  let totalBytes = 0;
  const TARGET_BYTES = 1547862400;
  const CHUNK_SIZE   = 1440;
  const PKTS_NEEDED  = Math.ceil(TARGET_BYTES / CHUNK_SIZE);

  // Instead of millions of log lines, use flow summaries every 30 seconds
  const FLOWS_TOTAL = 84; // 42 minutes * 2 per minute
  const BYTES_PER_FLOW = Math.floor(TARGET_BYTES / FLOWS_TOTAL);

  for (let i = 0; i < FLOWS_TOTAL; i++) {
    const bytes = i === FLOWS_TOTAL - 1
      ? TARGET_BYTES - (BYTES_PER_FLOW * (FLOWS_TOTAL - 1))
      : BYTES_PER_FLOW + Math.floor(Math.random() * 50000 - 25000);
    const pid = 2000 + i;
    fwEvents.push(`${syslogTs(t)} ${HOST} kernel: [${pid}.001] iptables: IN= OUT=eth0 SRC=${INTERNAL} DST=${EXTERNAL} LEN=${bytes} TTL=64 ID=${10000 + i} PROTO=TCP SPT=${50000} DPT=${EXT_PORT} WINDOW=65535 ACK`);
    t = addSeconds(t, 30);
  }

  // Add connection establishment
  const connT = new Date(base);
  fwEvents.unshift(`${syslogTs(connT)} ${HOST} kernel: [1999.000] iptables: IN= OUT=eth0 SRC=${INTERNAL} DST=${EXTERNAL} LEN=60 TTL=64 ID=9999 PROTO=TCP SPT=50000 DPT=${EXT_PORT} WINDOW=65535 SYN`);

  // ── Post-exfil connection teardown ────────────────────────────────────────────
  const endT = addSeconds(base, FLOWS_TOTAL * 30 + 5);
  fwEvents.push(`${syslogTs(endT)} ${HOST} kernel: [3999.000] iptables: IN= OUT=eth0 SRC=${INTERNAL} DST=${EXTERNAL} LEN=40 TTL=64 ID=10100 PROTO=TCP SPT=50000 DPT=${EXT_PORT} WINDOW=0 FIN ACK`);

  fwEvents.sort();
  return [{ events: fwEvents, sourcetype: 'firewall', host: HOST }];
}

module.exports = { generate };
