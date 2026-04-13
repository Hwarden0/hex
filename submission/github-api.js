'use strict';

// ─── GitHub API Client — No git binary required ──────────────────────────────
// Uses GitHub's REST API for all operations:
//   - Device Authorization Flow for CLI auth
//   - Contents API for file creation
//   - Pull Requests API for PR creation
//
// No dependency on `git` or `gh` CLI tools.

const https   = require('https');
const http    = require('http');
const chalk   = require('chalk');

// ─── Configuration ───────────────────────────────────────────────────────────
const LEADERBOARD_OWNER = 'hex-soc';
const LEADERBOARD_REPO  = 'hex-leaderboard';
const DEVICE_CLIENT_ID  = 'Iv1.0000000000000000'; // GitHub OAuth App client_id
const TOKEN_PATH = require('../storage/paths').githubTokenPath();

// ─── HTTP helpers ────────────────────────────────────────────────────────────
function request(method, url, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const lib = parsed.protocol === 'https:' ? https : http;

    const options = {
      hostname: parsed.hostname,
      port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
      path: parsed.pathname + parsed.search,
      method,
      headers: {
        'User-Agent': 'HEX-SOC-CLI',
        'Accept': 'application/vnd.github+json',
        ...headers,
      },
    };

    if (body && typeof body === 'object') {
      const json = JSON.stringify(body);
      options.headers['Content-Type'] = 'application/json';
      options.headers['Content-Length'] = Buffer.byteLength(json);
    }

    const req = lib.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        let parsedBody;
        try { parsedBody = JSON.parse(data); } catch (_) { parsedBody = data; }
        resolve({ status: res.statusCode, headers: res.headers, data: parsedBody });
      });
    });

    req.on('error', reject);
    req.setTimeout(30000, () => { req.destroy(new Error('Request timeout')); });

    if (body && typeof body === 'object') {
      req.write(JSON.stringify(body));
    }
    req.end();
  });
}

function api(path, token, method = 'GET', body) {
  const headers = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return request(method, `https://api.github.com${path}`, body, headers);
}

// ─── Token storage ───────────────────────────────────────────────────────────
const fse = require('fs-extra');

function loadToken() {
  try { return fse.readJsonSync(TOKEN_PATH); } catch (_) { return null; }
}

function saveToken(token) {
  fse.ensureDirSync(require('path').dirname(TOKEN_PATH));
  fse.writeJsonSync(TOKEN_PATH, token, { spaces: 2 });
}

function clearToken() {
  try { fse.removeSync(TOKEN_PATH); } catch (_) {}
}

// ─── Device Authorization Flow ───────────────────────────────────────────────
// https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps#device-flow

async function startDeviceAuth() {
  // Check for existing token first
  const existing = loadToken();
  if (existing) {
    // Verify token is still valid
    const res = await api('/user', existing.access_token);
    if (res.status === 200) {
      return { token: existing.access_token, user: res.data.login };
    }
    // Token expired, clear it
    clearToken();
  }

  // Step 1: Request device code
  const res = await request(
    'POST',
    'https://github.com/login/device/code',
    { client_id: DEVICE_CLIENT_ID, scope: 'repo' },
    { 'Accept': 'application/json' }
  );

  if (res.status !== 200) {
    throw new Error(
      `Failed to start GitHub authentication (${res.status}).\n` +
      `Response: ${JSON.stringify(res.data)}`
    );
  }

  return {
    device_code: res.data.device_code,
    user_code: res.data.user_code,
    verification_uri: res.data.verification_uri,
    verification_uri_complete: res.data.verification_uri_complete,
    expires_in: res.data.expires_in,
    interval: res.data.interval || 5,
  };
}

async function pollDeviceToken(deviceCode, verificationUri, userCode, interval, timeout) {
  const startTime = Date.now();
  const pollInterval = interval * 1000;

  return new Promise((resolve, reject) => {
    const poll = async () => {
      // Check timeout
      if (Date.now() - startTime > (timeout || 900000)) {
        reject(new Error('Authentication timed out. Please try again.'));
        return;
      }

      try {
        const res = await request(
          'POST',
          'https://github.com/login/oauth/access_token',
          {
            client_id: DEVICE_CLIENT_ID,
            device_code: deviceCode,
            grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
          },
          { 'Accept': 'application/json' }
        );

        const data = res.data;

        if (data.access_token) {
          // Success — save token and return
          const userRes = await api('/user', data.access_token);
          const token = {
            access_token: data.access_token,
            user: userRes.data.login,
            expires_at: Date.now() + (data.expires_in || 0) * 1000,
          };
          saveToken(token);
          resolve({ token: data.access_token, user: userRes.data.login });
          return;
        }

        if (data.error === 'authorization_pending') {
          // User hasn't authorized yet — keep polling
          setTimeout(poll, pollInterval);
          return;
        }

        if (data.error === 'slow_down') {
          // GitHub asked us to slow down — increase interval
          setTimeout(poll, (data.interval || interval + 5) * 1000);
          return;
        }

        if (data.error === 'expired_token') {
          reject(new Error('The authorization code expired. Please try again.'));
          return;
        }

        if (data.error === 'access_denied') {
          reject(new Error('Authorization was denied. Please try again.'));
          return;
        }

        // Unknown error
        reject(new Error(`GitHub auth error: ${data.error} — ${data.error_description || 'unknown'}`));
      } catch (err) {
        reject(err);
      }
    };

    // Start polling after the first interval
    setTimeout(poll, pollInterval);
  });
}

// ─── Repo operations ─────────────────────────────────────────────────────────

async function getAuthenticatedUser(token) {
  const res = await api('/user', token);
  if (res.status !== 200) throw new Error(`Failed to get user info (${res.status})`);
  return res.data;
}

async function checkForkExists(token, owner, repo) {
  const user = await getAuthenticatedUser(token);
  const res = await api(`/repos/${user.login}/${repo}`, token);
  return res.status === 200;
}

async function createFork(token, owner, repo) {
  const res = await api(`/repos/${owner}/${repo}/forks`, token, 'POST', {});
  if (res.status !== 202 && res.status !== 200) {
    throw new Error(`Failed to fork repository (${res.status})`);
  }
  return res.data;
}

async function waitForFork(token, owner, repo, maxWait = 60000) {
  const user = await getAuthenticatedUser(token);
  const startTime = Date.now();

  while (Date.now() - startTime < maxWait) {
    const res = await api(`/repos/${user.login}/${repo}`, token);
    if (res.status === 200) return res.data;
    await sleep(3000);
  }
  throw new Error('Timed out waiting for fork to be ready');
}

async function getDefaultBranchSha(token, owner, repo) {
  const res = await api(`/repos/${owner}/${repo}/branches/main`, token);
  if (res.status === 200) return res.data.commit.sha;
  // Fallback: try master
  const res2 = await api(`/repos/${owner}/${repo}/branches/master`, token);
  if (res2.status === 200) return res2.data.commit.sha;
  throw new Error('Could not find main or master branch');
}

async function createBranch(token, owner, repo, branch, sha) {
  const ref = `refs/heads/${branch}`;
  const res = await api(`/repos/${owner}/${repo}/git/refs`, token, 'POST', {
    ref,
    sha,
  });
  if (res.status !== 201) {
    throw new Error(`Failed to create branch '${branch}' (${res.status}): ${JSON.stringify(res.data)}`);
  }
  return res.data;
}

async function createOrUpdateFile(token, owner, repo, path, content, branch, message, sha) {
  const body = {
    message,
    content: Buffer.from(content).toString('base64'),
    branch,
  };
  if (sha) body.sha = sha;

  const res = await api(`/repos/${owner}/${repo}/contents/${path}`, token, 'PUT', body);
  if (res.status !== 200 && res.status !== 201) {
    throw new Error(`Failed to create file '${path}' (${res.status}): ${JSON.stringify(res.data)}`);
  }
  return res.data;
}

async function getFileSha(token, owner, repo, path, branch) {
  const res = await api(`/repos/${owner}/${repo}/contents/${path}?ref=${branch}`, token);
  if (res.status === 404) return null;
  if (res.status === 200) return res.data.sha;
  throw new Error(`Failed to get file SHA for '${path}' (${res.status})`);
}

async function createPullRequest(token, owner, repo, title, head, base, body) {
  const res = await api(`/repos/${owner}/${repo}/pulls`, token, 'POST', {
    title,
    head,
    base,
    body: body || '',
  });
  if (res.status !== 201) {
    throw new Error(`Failed to create PR (${res.status}): ${JSON.stringify(res.data)}`);
  }
  return res.data;
}

// ─── High-level submission flow ──────────────────────────────────────────────

async function submitToLeaderboard(submissionData) {
  const { user: submissionUser, case: caseId, score } = submissionData;
  const branchName = `submission/${submissionUser}-${caseId}`;
  const filePath = `submissions/${submissionUser}/${caseId}.json`;
  const content = JSON.stringify(submissionData, null, 2);

  let token;
  let forkOwner;

  try {
    // Step 1: Authenticate (or use cached token)
    const existing = loadToken();
    if (existing) {
      token = existing.access_token;
      forkOwner = existing.user;
    } else {
      // Start Device Authorization Flow
      const deviceFlow = await startDeviceAuth();

      // Display instructions to user
      console.log();
      console.log(chalk.bold.cyan('  ┌─────────────────────────────────────────────────┐'));
      console.log(chalk.bold.cyan('  │') + chalk.cyan('   GitHub Authentication Required              ') + chalk.bold.cyan('│'));
      console.log(chalk.bold.cyan('  ├─────────────────────────────────────────────────┤'));
      console.log(chalk.bold.cyan('  │') + chalk.white('   1. Open: ') + chalk.blueBright(deviceFlow.verification_uri) + chalk.bold.cyan('│'));
      console.log(chalk.bold.cyan('  │') + chalk.white('   2. Enter code: ') + chalk.yellowBright(deviceFlow.user_code) + chalk.bold.cyan('         │'));
      console.log(chalk.bold.cyan('  │') + chalk.white('   3. Authorize HEX to access your repos      ') + chalk.bold.cyan('│'));
      console.log(chalk.bold.cyan('  │') + chalk.gray('   Waiting for authorization...') + chalk.bold.cyan('                │'));
      console.log(chalk.bold.cyan('  └─────────────────────────────────────────────────┘'));
      console.log();

      // Poll for token
      const authResult = await pollDeviceToken(
        deviceFlow.device_code,
        deviceFlow.verification_uri,
        deviceFlow.user_code,
        deviceFlow.interval,
        deviceFlow.expires_in * 1000
      );

      token = authResult.token;
      forkOwner = authResult.user;

      console.log(chalk.green(`  ✓ Authenticated as @${forkOwner}\n`));
    }

    // Step 2: Check if fork exists, create if not
    const hasFork = await checkForkExists(token, LEADERBOARD_OWNER, LEADERBOARD_REPO);
    if (!hasFork) {
      console.log(chalk.gray('  → Forking leaderboard repository...'));
      await createFork(token, LEADERBOARD_OWNER, LEADERBOARD_REPO);
      await waitForFork(token, LEADERBOARD_OWNER, LEADERBOARD_REPO);
      console.log(chalk.green(`  ✓ Forked to ${forkOwner}/${LEADERBOARD_REPO}\n`));
    }

    // Step 3: Get the default branch SHA
    const defaultSha = await getDefaultBranchSha(token, LEADERBOARD_OWNER, LEADERBOARD_REPO);

    // Step 4: Create submission branch
    // First check if branch already exists (from a previous submission attempt)
    const existingBranch = await api(
      `/repos/${forkOwner}/${LEADERBOARD_REPO}/git/ref/heads/${branchName}`,
      token
    );

    if (existingBranch.status === 200) {
      console.log(chalk.gray(`  → Branch '${branchName}' already exists, reusing...\n`));
    } else {
      await createBranch(token, forkOwner, LEADERBOARD_REPO, branchName, defaultSha);
      console.log(chalk.green(`  ✓ Created branch: ${branchName}\n`));
    }

    // Step 5: Create/update the submission file
    const existingSha = await getFileSha(token, forkOwner, LEADERBOARD_REPO, filePath, branchName);
    const commitMsg = `feat(submission): ${submissionUser} submitted ${caseId} — score ${score}`;

    await createOrUpdateFile(
      token, forkOwner, LEADERBOARD_REPO, filePath, content, branchName, commitMsg, existingSha
    );
    console.log(chalk.green(`  ✓ Created file: ${filePath}\n`));

    // Step 6: Check if PR already exists
    const existingPRs = await api(
      `/repos/${LEADERBOARD_OWNER}/${LEADERBOARD_REPO}/pulls?head=${forkOwner}:${branchName}&state=open`,
      token
    );

    let prUrl;
    if (existingPRs.status === 200 && existingPRs.data.length > 0) {
      prUrl = existingPRs.data[0].html_url;
      console.log(chalk.gray(`  → PR already exists, skipping creation.\n`));
    } else {
      // Step 7: Create Pull Request
      const prTitle = `Submission: ${submissionUser} — ${caseId} (score: ${score})`;
      const prBody = [
        `## HEX SOC Submission`,
        '',
        `- **User**: ${submissionUser}`,
        `- **Case**: ${caseId}`,
        `- **Score**: ${score}/100`,
        `- **Timestamp**: ${submissionData.timestamp || new Date().toISOString()}`,
        '',
        'This submission was created automatically via the HEX CLI.',
      ].join('\n');

      const pr = await createPullRequest(
        token, LEADERBOARD_OWNER, LEADERBOARD_REPO, prTitle,
        `${forkOwner}:${branchName}`, 'main', prBody
      );
      prUrl = pr.html_url;
      console.log(chalk.green(`  ✓ Pull Request created!\n`));
    }

    return {
      success: true,
      prUrl,
      forkOwner,
      branchName,
      filePath,
    };

  } catch (err) {
    return {
      success: false,
      error: err.message,
      forkOwner,
      branchName,
      filePath,
    };
  }
}

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

// ─── Manual instructions (fallback) ─────────────────────────────────────────
function manualInstructions(submissionData) {
  const { user, case: caseId, score } = submissionData;
  const branchName = `submission/${user}-${caseId}`;
  return [
    '',
    chalk.bold('Manual submission steps:'),
    chalk.gray(`  1. Fork https://github.com/${LEADERBOARD_OWNER}/${LEADERBOARD_REPO}`),
    chalk.gray(`  2. Create branch: ${branchName}`),
    chalk.gray(`  3. Add file: submissions/${user}/${caseId}.json`),
    chalk.gray(`  4. Create a Pull Request to main`),
    '',
  ].join('\n');
}

// ─── Public API ──────────────────────────────────────────────────────────────
module.exports = {
  // High-level submission (full flow)
  submitToLeaderboard,

  // Auth functions
  startDeviceAuth,
  pollDeviceToken,
  loadToken,
  clearToken,

  // Low-level API functions (for testing)
  getAuthenticatedUser,
  checkForkExists,
  createFork,
  getDefaultBranchSha,
  createBranch,
  createOrUpdateFile,
  getFileSha,
  createPullRequest,

  // Metadata
  LEADERBOARD_OWNER,
  LEADERBOARD_REPO,
  manualInstructions,
};
