#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const root = process.env.MONARCH_ROOT || process.cwd();
const dir = path.join(root, '.harness');
const stateFile = path.join(dir, 'loop-state.json');
fs.mkdirSync(dir, { recursive: true });
const DEFAULT = { completed_loops: 0, max_loops: 10, permission_required: false, window: 1 };
let state = DEFAULT;
if (fs.existsSync(stateFile)) {
  try { state = { ...DEFAULT, ...JSON.parse(fs.readFileSync(stateFile, 'utf8')) }; } catch { state = DEFAULT; }
}
function save() { fs.writeFileSync(stateFile, JSON.stringify(state, null, 2) + '\n'); }
function checkpoint() {
  const progress = path.join(root, 'docs', 'PROGRESS.md');
  const pending = path.join(root, 'docs', 'PENDING_ITEMS.md');
  const out = path.join(dir, 'loop-checkpoint.md');
  const stamp = new Date().toISOString();
  const progressText = fs.existsSync(progress) ? fs.readFileSync(progress, 'utf8') : '(PROGRESS.md not present)';
  const pendingText = fs.existsSync(pending) ? fs.readFileSync(pending, 'utf8') : '(PENDING_ITEMS.md not present)';
  const body = `# MONARCH 10-Loop Checkpoint\n\nGenerated: ${stamp}\n\n**Completed loops in current window:** ${state.completed_loops} / ${state.max_loops}\n\n**Permission required:** ${state.permission_required ? 'YES' : 'NO'}\n\n## Work completed / recorded in PROGRESS.md\n\n${progressText}\n\n## Remaining blockers / pending items\n\n${pendingText}\n\n## Human approval\n\nSend exactly **APPROVE_NEXT_10_LOOPS** to authorize the next 10-loop window. Claude Code must not continue work without that approval.\n`;
  fs.writeFileSync(out, body);
}
const cmd = process.argv[2] || 'status';
if (cmd === 'stop') {
  if (!state.permission_required) {
    state.completed_loops += 1;
    if (state.completed_loops >= state.max_loops) { state.permission_required = true; checkpoint(); }
    save();
    process.stdout.write(JSON.stringify({ ...state, checkpoint: state.permission_required ? '.harness/loop-checkpoint.md' : null }));
  }
  process.exit(0);
}
if (cmd === 'approve') {
  state.completed_loops = 0;
  state.permission_required = false;
  state.window += 1;
  save();
  process.stdout.write(JSON.stringify(state));
  process.exit(0);
}
if (cmd === 'reset') {
  state = { ...DEFAULT };
  save();
  process.stdout.write(JSON.stringify(state));
  process.exit(0);
}
process.stdout.write(JSON.stringify(state));
