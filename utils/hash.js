'use strict';

const crypto = require('crypto');

function sha256(str) {
  return crypto.createHash('sha256').update(String(str)).digest('hex');
}

function shortHash(str, len = 8) {
  return sha256(str).slice(0, len);
}

// Simple tamper-evident signature for submission files
function signSubmission(data, secret = 'hex-soc-2024') {
  const payload = JSON.stringify({
    user: data.user,
    case: data.case,
    score: data.score,
    timestamp: data.timestamp,
    answers: data.answers,
  });
  return sha256(payload + secret).slice(0, 16);
}

function verifySubmission(data, secret = 'hex-soc-2024') {
  return signSubmission(data, secret) === data.sig;
}

module.exports = { sha256, shortHash, signSubmission, verifySubmission };
