'use strict';

// Pad a number to 2 digits
const pad2 = (n) => String(n).padStart(2, '0');

// Format seconds into human-readable duration
function formatDuration(seconds) {
  if (seconds < 60)  return `${seconds}s`;
  if (seconds < 3600) {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}m ${s}s`;
  }
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${h}h ${m}m`;
}

// Format a Date or ISO string to HH:MM:SS
function formatTime(d) {
  const dt = d instanceof Date ? d : new Date(d);
  return `${pad2(dt.getHours())}:${pad2(dt.getMinutes())}:${pad2(dt.getSeconds())}`;
}

// Format a Date or ISO string to full timestamp
function formatFull(d) {
  const dt = d instanceof Date ? d : new Date(d);
  return dt.toISOString().replace('T', ' ').slice(0, 19);
}

// Seconds elapsed since a timestamp string
function elapsedSince(isoStr) {
  return Math.floor((Date.now() - new Date(isoStr).getTime()) / 1000);
}

// Generate a syslog-style timestamp for a Date
function syslogTs(d) {
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const dt = d instanceof Date ? d : new Date(d);
  const day = String(dt.getDate()).padStart(2, ' ');
  return `${months[dt.getMonth()]} ${day} ${pad2(dt.getHours())}:${pad2(dt.getMinutes())}:${pad2(dt.getSeconds())}`;
}

// Build a Date N hours/minutes in the past from a base date
function ago(base, { hours = 0, minutes = 0, seconds = 0 } = {}) {
  const d = new Date(base);
  d.setTime(d.getTime() - ((hours * 3600 + minutes * 60 + seconds) * 1000));
  return d;
}

// Add N seconds to a date
function addSeconds(d, s) {
  return new Date(d.getTime() + s * 1000);
}

module.exports = { formatDuration, formatTime, formatFull, elapsedSince, syslogTs, ago, addSeconds, pad2 };
