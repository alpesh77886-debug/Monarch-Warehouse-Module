#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
const result = spawnSync('node', [process.env.CLAUDE_PROJECT_DIR + '/scripts/harness/loop-gate.mjs', 'stop'], { encoding: 'utf8' });
if (result.status !== 0) process.exit(result.status ?? 1);
