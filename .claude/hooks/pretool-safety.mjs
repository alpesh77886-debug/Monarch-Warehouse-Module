#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
const raw = fs.readFileSync(0,'utf8');
let input={}; try { input=JSON.parse(raw); } catch { process.exit(0); }
const text = JSON.stringify(input);
const lower = text.toLowerCase();
const payment = /(\bbuy\b|\bpurchase\b|\bpay(?:ment)?\b|billing|subscription|subscribe|upgrade(?:\s+plan)?|add\s+(?:paid\s+)?credits|paid\s+(?:plan|resource|service)|credit\s*card|checkout|invoice|charge|domain\s+(?:purchase|registration)|enable\s+paid)/i.test(lower);
const protectedPaths = [
  'CLAUDE.md','MASTER_EXECUTION_CONTRACT.md','CLAUDE_BOOTSTRAP_PROMPT.md','HARNESS_BOOTSTRAP.md','UPGRADE_FILE_MANIFEST.sha256','docs/ARCHITECTURE_BLUEPRINT.md','docs/BACKEND_STACK.md','docs/IMPLEMENTATION_SPEC.md','docs/HARNESS_ENGINEERING.md','contracts/','.claude/settings.json','.claude/hooks/','scripts/harness/'
];
const mutation = /(rm\s+-rf|git\s+reset\s+--hard|git\s+clean\s+-fd|git\s+push\s+--force|truncate\s+-s\s*0|>\s*(?:\/dev\/null|CLAUDE.md))/i.test(text);
const protectedMutation = protectedPaths.some(p => text.includes(p)) && /(sed\s+-i|perl\s+-i|python|node\s+-e|mv\s+|cp\s+|rm\s+|tee\s+|cat\s+>|truncate|write|replace|update_file|delete_file)/i.test(text);
// Protected-project mutations fail closed before the broader payment detector.
// This prevents names such as `UPGRADE_FILE_MANIFEST.sha256` from accidentally downgrading
// a protected-artifact mutation from DENY to a generic payment prompt.
if (mutation || protectedMutation) {
  process.stdout.write(JSON.stringify({hookSpecificOutput:{hookEventName:'PreToolUse',permissionDecision:'deny',permissionDecisionReason:'MONARCH HARNESS: destructive or protected project-artifact mutation is blocked. Use the controlled human-approved change process.'}}));
  process.exit(0);
}
if (payment) {
  process.stdout.write(JSON.stringify({hookSpecificOutput:{hookEventName:'PreToolUse',permissionDecision:'ask',permissionDecisionReason:'MONARCH FREE-ONLY: this tool action looks payment/billing/upgrade related. Human approval is required for this specific action.'}}));
  process.exit(0);
}
