'use strict';

const { syslogTs, ago, addSeconds } = require('../../utils/time');

// Case 9: Beaconing / C2 Detection
// workstation-05 (10.0.1.50) beacons to 45.142.212.100:8080 every ~60 seconds

function generate() {
  const base = new Date();
  base.setHours(8, 0, 0, 0);

  const HOST       = 'fw-edge-01';
  const INFECTED   = '10.0.1.50';
  const C2_IP      = '45.142.212.100';
  const C2_PORT    = 8080;
  const INTERVAL   = 60; // seconds
  const JITTER     = 2;  // ±2 seconds jitter

  const fwEvents   = [];

  // ── Legitimate traffic (multiple workstations) ────────────────────────────────
  const workstations = [
    { ip: '10.0.1.51', name: 'workstation-01' },
    { ip: '10.0.1.52', name: 'workstation-02' },
    { ip: '10.0.1.53', name: 'workstation-03' },
    { ip: '10.0.1.54', name: 'workstation-04' },
  ];
  const legitimateDsts = [
    { ip: '8.8.8.8',         port: 53  },
    { ip: '1.1.1.1',         port: 53  },
    { ip: '93.184.216.34',   port: 443 },
    { ip: '104.21.12.54',    port: 443 },
    { ip: '151.101.1.69',    port: 443 },
    { ip: '172.217.14.206',  port: 80  },
  ];

  let bgT = ago(base, { hours: 2 });
  const bgEnd = addSeconds(base, 14400); // +4 hours
  while (bgT < bgEnd) {
    const ws  = workstations[Math.floor(Math.random() * workstations.length)];
    const dst = legitimateDsts[Math.floor(Math.random() * legitimateDsts.length)];
    const len = 64 + Math.floor(Math.random() * 1400);
    fwEvents.push(`${syslogTs(bgT)} ${HOST} kernel: [123.456] iptables: IN=eth1 OUT=eth0 SRC=${ws.ip} DST=${dst.ip} LEN=${len} TTL=64 PROTO=TCP SPT=${40000 + Math.floor(Math.random() * 15000)} DPT=${dst.port}`);
    bgT = addSeconds(bgT, 5 + Math.floor(Math.random() * 30));
  }

  // ── Infected host normal traffic ──────────────────────────────────────────────
  let normalT = ago(base, { hours: 2 });
  while (normalT < bgEnd) {
    const dst = legitimateDsts[Math.floor(Math.random() * legitimateDsts.length)];
    const len = 64 + Math.floor(Math.random() * 800);
    fwEvents.push(`${syslogTs(normalT)} ${HOST} kernel: [124.000] iptables: IN=eth1 OUT=eth0 SRC=${INFECTED} DST=${dst.ip} LEN=${len} TTL=64 PROTO=TCP SPT=${40000 + Math.floor(Math.random() * 15000)} DPT=${dst.port}`);
    normalT = addSeconds(normalT, 15 + Math.floor(Math.random() * 60));
  }

  // ── Beacon traffic (every 60 ± 2 seconds from 08:00 onwards) ─────────────────
  let beaconT = new Date(base);
  const beaconEnd = addSeconds(base, 14400);
  while (beaconT < beaconEnd) {
    const jitter = Math.floor(Math.random() * (JITTER * 2 + 1)) - JITTER;
    const len = 200 + Math.floor(Math.random() * 100); // Small C2 check-in packet

    // Outbound beacon
    fwEvents.push(`${syslogTs(beaconT)} ${HOST} kernel: [${Date.now() % 99999}.001] iptables: IN=eth1 OUT=eth0 SRC=${INFECTED} DST=${C2_IP} LEN=${len} TTL=64 PROTO=TCP SPT=54321 DPT=${C2_PORT} ACK PSH`);

    // C2 response (slightly after)
    const respT = addSeconds(beaconT, 1);
    fwEvents.push(`${syslogTs(respT)} ${HOST} kernel: [${Date.now() % 99999}.002] iptables: IN=eth0 OUT=eth1 SRC=${C2_IP} DST=${INFECTED} LEN=${50 + Math.floor(Math.random() * 50)} TTL=64 PROTO=TCP SPT=${C2_PORT} DPT=54321 ACK PSH`);

    beaconT = addSeconds(beaconT, INTERVAL + jitter);
  }

  fwEvents.sort();
  return [{ events: fwEvents, sourcetype: 'firewall', host: HOST }];
}

module.exports = { generate };
