# HEX

Hunt threats with Splunk. Right from your terminal.

## Overview

HEX provides hands-on incident response training through 10 realistic SOC investigation scenarios ranging from beginner to advanced. Users investigate incidents using Splunk, submit findings via GitHub Pull Requests, and compete on a global leaderboard.

## Quick Start

```
git clone https://github.com/Hwarden0/hex.git
cd hex
npm install
npm run build
sudo make install
```

Then run `hex` from any directory:

```
hex init
```

You need Node.js once to build the binary. After that, `hex` runs standalone -- no Node.js required.

## Requirements

- **Splunk Enterprise** (free license available at https://www.splunk.com/en_us/download.html)
- **Git** (optional, for leaderboard submissions)
- **Node.js 16+** 

## CLI Commands

| Command | Description |
|---------|-------------|
| `hex init` | Initialize HEX and connect to your Splunk instance |
| `hex doctor` | Run system diagnostics to verify configuration |
| `hex start <case_id>` | Start an investigation case |
| `hex status [case_id]` | Check objective progress or show all cases overview |
| `hex answer [caseId] [key] [value]` | Record your findings for an objective (interactive if no args given) |
| `hex submit` | Submit investigation findings for scoring |
| `hex hint` | Get a hint for the current case (-5 points per hint) |
| `hex score` | View your scores and overall level |
| `hex rank` | View the global leaderboard rankings |
| `hex reset [case_id]` | Reset progress on a specific case or all cases |
| `hex kill` | ⚠ Destroy the entire lab environment (Splunk index + local data) |

## Investigation Cases

### Beginner

1. **SSH Brute Force Attack** - Investigate a high-volume SSH brute force attempt
2. **Failed vs Successful Login Correlation** - Correlate authentication events to identify compromised accounts
3. **Suspicious User Activity** - Analyze multi-service logs for anomalous user behavior

### Intermediate

4. **Password Spraying Attack** - Detect and analyze a distributed password spraying campaign
5. **Privilege Escalation** - Investigate sudo abuse and unauthorized privilege escalation
6. **Persistence via Cron Job** - Identify unauthorized scheduled tasks used for persistence
7. **Suspicious Outbound Traffic** - Detect potential data exfiltration via anomalous network traffic

### Advanced

8. **Lateral Movement Across Hosts** - Track an attacker moving through the network
9. **Beaconing / Command & Control** - Identify C2 communication patterns
10. **Multi-Stage Attack** - Full kill chain investigation from initial access to exfiltration

## Scoring

Scores are calculated based on:

- **Objective completion** (weighted answers)
- **Investigation time** (faster = bonus, slower = penalty)
- **Hints used** (-5 points per hint)

### Levels

| Score | Level |
|-------|-------|
| 0-39 | Beginner |
| 40-59 | Junior Analyst |
| 60-79 | Intermediate |
| 80-94 | Senior Analyst |
| 95-100 | Expert |

## Submission and Leaderboard

Submit findings via GitHub Pull Request to appear on the global leaderboard:

1. Complete a case investigation
2. Run `hex submit` to generate and submit your results
3. A PR will be created to the [leaderboard repository](https://github.com/hex-soc/hex-leaderboard)
4. Your score appears on the leaderboard once the PR is merged

## Building

### Prerequisites

- Node.js 16 or later
- npm

### Commands

```
npm run build       # Build for current platform (outputs bin/hex)
npm run build:linux
npm run build:macos
npm run build:macos-arm
npm run build:windows
make install        # Install bin/hex to /usr/local/bin
make uninstall      # Remove from /usr/local/bin
npm run dev         # Run from source (node bin/hex.js)
```

## Project Structure

```
/hex
  /bin            - CLI entry point
  /cli            - Command definitions
  /core           - Core configuration and display logic
  /splunk         - Splunk client, detection, and setup
  /cases          - Investigation case definitions
  /engine         - Session and progress management
  /scoring        - Score calculation and level system
  /submission     - Submission generation and GitHub integration
  /validation     - Answer validation and anti-cheat
  /leaderboard    - Leaderboard client and display
  /storage        - Local data persistence
  /utils          - Shared utilities
```

## License

MIT
