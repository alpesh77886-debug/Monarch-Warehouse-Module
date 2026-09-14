#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
const root=process.env.MONARCH_ROOT||process.cwd();
const c=path.join(root,'contracts');
const fail=[];
const master=path.join(root,'MASTER_EXECUTION_CONTRACT.md');
if(!fs.existsSync(master)) fail.push('MASTER_EXECUTION_CONTRACT.md missing');
else { const mt=fs.readFileSync(master,'utf8'); if(!/APPROVE_NEXT_10_LOOPS/.test(mt)) fail.push('master contract: 10-loop approval token missing'); if(!/FREE-ONLY/.test(mt)) fail.push('master contract: FREE-ONLY control missing'); if(!/TASK-ROUTING MAP/.test(mt)) fail.push('master contract: task-routing map missing'); }
const yamlGuard=spawnSync('node',[path.join(root,'scripts/harness','yaml-lexical-guard.mjs')],{encoding:'utf8'});
if(yamlGuard.status!==0) fail.push(`yaml-lexical-guard failed: ${yamlGuard.stderr || yamlGuard.stdout}`);
function ids(file,prefix){
  const text=fs.readFileSync(path.join(c,file),'utf8');
  return [...text.matchAll(new RegExp(`\\bid:\\s*(${prefix}-\\d+)\\b`,'g'))].map(m=>m[1]);
}
for (const [file,prefix,count] of [['invariants.yaml','INV',20],['negative-tests.yaml','NS',20],['golden-scenarios.yaml','GS',10]]) {
  if (!fs.existsSync(path.join(c,file))) { fail.push(`${file} missing`); continue; }
  const xs=ids(file,prefix);
  if (xs.length!==count) fail.push(`${file}: expected ${count}, found ${xs.length}`);
  const uniq=[...new Set(xs)];
  if (uniq.length!==xs.length) fail.push(`${file}: duplicate IDs`);
  const expected=Array.from({length:count},(_,i)=>`${prefix}-${String(i+1).padStart(3,'0')}`);
  if (xs.join('|')!==expected.join('|')) fail.push(`${file}: IDs/order mismatch`);
}
const perm=fs.readFileSync(path.join(c,'permissions.yaml'),'utf8');
const roles=[...perm.matchAll(/^\s{2}(R\d{2}):/gm)].map(m=>m[1]);
if(roles.length!==12 || new Set(roles).size!==12) fail.push(`permissions.yaml: expected 12 unique roles, found ${roles.length}`);
const mobile=fs.readFileSync(path.join(c,'mobile.yaml'),'utf8');
if (!/min_touch_target_css_px:\s*48\b/.test(mobile)) fail.push('mobile.yaml: 48px minimum touch target missing');
if (!/horizontal_scroll_forbidden:\s*true\b/.test(mobile)) fail.push('mobile.yaml: horizontal scroll prohibition missing');
if (!/critical_workflows_must_be_usable_at_320:\s*true\b/.test(mobile)) fail.push('mobile.yaml: 320px critical-workflow requirement missing');
const screens=fs.readFileSync(path.join(c,'screens.yaml'),'utf8');
const sc=[...screens.matchAll(/\bid:\s*(SCREEN-\d+)/g)].map(m=>m[1]);
if(sc.length!==14 || new Set(sc).size!==14) fail.push(`screens.yaml: expected 14 unique screens, found ${sc.length}`);
if(fail.length){ console.error(fail.join('\n')); process.exit(1); }
console.log('CONTRACT GUARD PASS');
