'use strict';

// Case 9: C2 Beaconing Detection
// ~10,000 events. workstation-05 (10.0.1.50) beacons to C2 every ~60s with ±2s jitter.
// Answers discoverable via: timechart count by dest_ip span=1m → regular 60s spikes
// Sourcetypes: firewall, stream_http, suricata

const { syslogTs, ago, addSeconds } = require('../../utils/time');
const {
  randInt, pick, LEGIT_INTERNAL, LEGIT_EXTERNAL, COMMON_USERS, NORMAL_UAS,
  kv, firewall, streamHttp, suricata, fwBackground, httpBackground, SURICATA_SIGS,
} = require('../../utils/logfmt');

function generate() {
  const base = new Date();
  base.setHours(8, 0, 0, 0);

  const HOST     = 'fw-edge-01';
  const INFECTED = '10.0.1.50';
  const C2_IP    = '45.142.212.100';
  const C2_PORT  = 8080;

  // ── Firewall events (primary) ────────────────────────────────────────────
  const fwEvents = [];

  // Background: 6 hours of normal outbound traffic (~7,000 events)
  const bgStart = ago(base, { hours: 2 });
  const bgEnd = addSeconds(base, 14400); // 4 hours of beacon + 2 hours before
  fwEvents.push(...fwBackground({
    start: bgStart, end: bgEnd, count: 7000,
  }));

  // Infected workstation normal traffic (blends in with everyone else)
  let normalT = ago(base, { hours: 2 });
  while (normalT < bgEnd) {
    const dst = pick(LEGIT_EXTERNAL);
    fwEvents.push(firewall(normalT, {
      src_ip: INFECTED,
      dest_ip: dst,
      dest_port: pick([80, 443, 443, 443, 53]),
      proto: pick([80, 443].includes(dst) ? 'TCP' : 'UDP'),
      action: 'allow',
      bytes: randInt(64, 1400),
      direction: 'outbound',
      src_port: randInt(40000, 65000),
    }));
    normalT = addSeconds(normalT, randInt(10, 90));
  }

  // ── THE SIGNAL: Beacon traffic (every 60 ± 2 seconds from 08:00) ─────────
  let beaconT = new Date(base);
  const beaconEnd = addSeconds(base, 14400); // 4 hours
  while (beaconT < beaconEnd) {
    const jitter = randInt(-2, 3); // ±2s
    const pktLen = randInt(210, 260); // small C2 check-in
    const respLen = randInt(48, 96); // short acknowledgement

    fwEvents.push(firewall(beaconT, {
      src_ip: INFECTED,
      dest_ip: C2_IP,
      dest_port: C2_PORT,
      proto: 'TCP',
      action: 'allow',
      bytes: pktLen,
      direction: 'outbound',
      src_port: 54321,
      flags: 'ACK PSH',
    }));
    fwEvents.push(firewall(addSeconds(beaconT, 1), {
      src_ip: C2_IP,
      dest_ip: INFECTED,
      dest_port: 54321,
      proto: 'TCP',
      action: 'allow',
      bytes: respLen,
      direction: 'inbound',
      src_port: C2_PORT,
      flags: 'ACK',
    }));

    beaconT = addSeconds(beaconT, 60 + jitter);
  }

  // ── HTTP events (web traffic from infected host) ─────────────────────────
  const httpEvents = [];

  // Normal web traffic from infected workstation (~1,000 events)
  const bgStart2 = ago(base, { hours: 2 });
  httpEvents.push(...httpBackground({
    start: bgStart2, end: bgEnd, count: 1000,
    destIp: INFECTED,
  }));

  // Occasional HTTP to C2 domain (disguised as normal web traffic)
  let c2HttpT = new Date(base);
  while (c2HttpT < beaconEnd) {
    const jitter = randInt(-2, 3);
    httpEvents.push(streamHttp(c2HttpT, {
      src_ip: INFECTED,
      dest_ip: C2_IP,
      http_method: 'POST',
      uri: `/api/v1/health?token=${randInt(100000, 999999)}`,
      status: 200,
      bytes: randInt(200, 500),
      user_agent: pick(NORMAL_UAS),
      response_time_ms: randInt(100, 500),
    }));
    c2HttpT = addSeconds(c2HttpT, 60 + jitter);
  }

  // ── Suricata IDS alerts ──────────────────────────────────────────────────
  const suricataEvents = [];

  // Background IDS noise (~20 events)
  for (let i = 0; i < 20; i++) {
    const nt = addSeconds(ago(base, { hours: 2 }), randInt(0, 21600));
    suricataEvents.push(suricata(nt, {
      src_ip: pick(LEGIT_INTERNAL),
      dest_ip: pick(LEGIT_EXTERNAL),
      dest_port: randInt(1, 65535),
      proto: 'TCP',
      action: 'alert',
      signature: 'ET SCAN Possible Port Scan',
      severity: 'low',
      category: 'attempted-recon',
      sid: 2001216,
    }));
  }

  // THE SIGNAL: IDS detects C2 beacon pattern
  const sig = SURICATA_SIGS.c2_beacon;
  // Alerts fire periodically as the pattern persists
  const alertIntervals = [1800, 3600, 7200, 10800, 14400];
  for (const interval of alertIntervals) {
    suricataEvents.push(suricata(addSeconds(base, interval), {
      src_ip: INFECTED,
      dest_ip: C2_IP,
      dest_port: C2_PORT,
      proto: 'TCP',
      action: 'alert',
      ...sig,
    }));
  }

  fwEvents.sort();
  httpEvents.sort();
  suricataEvents.sort();

  return [
    { events: fwEvents, sourcetype: 'firewall', host: HOST },
    { events: httpEvents, sourcetype: 'stream_http', host: 'web-proxy-01' },
    { events: suricataEvents, sourcetype: 'suricata', host: HOST },
  ];
}

module.exports = { generate };
