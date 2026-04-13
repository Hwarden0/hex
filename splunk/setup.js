'use strict';

const splunk  = require('./client');
const config  = require('../core/config');
const registry = require('../cases/registry');
const { preloadCaseLogGenerators } = require('../utils/paths');

// Static map of log generators — required for pkg bundling (no dynamic require)
const LOG_GENERATORS = preloadCaseLogGenerators();

// Full Splunk setup: ensure index exists and ingest all case logs
async function fullSetup(spinner) {
  const cfg = config.load();

  spinner.text = 'Authenticating with Splunk...';
  await splunk.login();

  spinner.text = `Creating index: ${cfg.splunk.index}`;
  await splunk.ensureIndex(cfg.splunk.index);

  spinner.text = 'Ingesting case log data...';
  const cases = registry.list();

  for (const caseId of cases) {
    spinner.text = `Ingesting logs: ${caseId}`;
    await ingestCase(caseId);
  }

  spinner.text = 'Validating ingestion...';
  await new Promise((r) => setTimeout(r, 3000)); // Let Splunk index

  const count = await splunk.countEvents(cfg.splunk.index, 'hex_');
  return count;
}

// Ingest logs for a single case
async function ingestCase(caseId) {
  const cfg    = config.load();
  const caseObj = registry.get(caseId);
  if (!caseObj) throw new Error(`Unknown case: ${caseId}`);

  const logGen = LOG_GENERATORS[caseId];
  if (!logGen) throw new Error(`No log generator for case: ${caseId}`);
  const logSets = logGen.generate();

  for (const { events, sourcetype, host } of logSets) {
    await splunk.ingestEvents(events, {
      index:      cfg.splunk.index,
      sourcetype: `hex_${caseId}_${sourcetype}`,
      host:       host || 'hex-lab',
    });
  }
}

// Check if a case's data is already ingested
async function caseIngested(caseId) {
  const cfg = config.load();
  const count = await splunk.countEvents(cfg.splunk.index, `hex_${caseId}_`);
  return count > 0;
}

// Re-ingest a single case (useful for reset)
async function reingestCase(caseId) {
  await splunk.login();
  const cfg = config.load();
  await splunk.ensureIndex(cfg.splunk.index);
  await ingestCase(caseId);
}

module.exports = { fullSetup, ingestCase, caseIngested, reingestCase };
