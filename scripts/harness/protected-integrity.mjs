#!/usr/bin/env node
import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';
const root=process.env.MONARCH_ROOT||process.cwd();
const manifest=path.join(root,'UPGRADE_FILE_MANIFEST.sha256');
if(!fs.existsSync(manifest)){console.error('Integrity manifest missing');process.exit(1)}
const protectedPrefixes=['CLAUDE.md','MASTER_EXECUTION_CONTRACT.md','CLAUDE_BOOTSTRAP_PROMPT.md','HARNESS_BOOTSTRAP.md','UPGRADE_FILE_MANIFEST.sha256','docs/BACKEND_STACK.md','docs/ARCHITECTURE_BLUEPRINT.md','docs/IMPLEMENTATION_SPEC.md','docs/HARNESS_ENGINEERING.md','contracts/','docs/IBF_FG_Warehouse_Flow_Document_v3_FINAL_Complete.md','reference/IBF_FG_Warehouse_Frontend_Design_v5.html','.claude/','scripts/harness/','.github/workflows/ci.yml'];
const lines=fs.readFileSync(manifest,'utf8').split(/\r?\n/).filter(Boolean);
const issues=[];
for(const line of lines){ const [hash,rel]=line.split(/\s{2,}/); if(!rel)continue; if(!protectedPrefixes.some(p=>rel===p||rel.startsWith(p)))continue; const file=path.join(root,rel); if(!fs.existsSync(file)){issues.push(`Missing protected file: ${rel}`);continue;} const got=crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'); if(got!==hash)issues.push(`Hash mismatch: ${rel}`); }
if(issues.length){console.error(issues.join('\n'));process.exit(1)} console.log('PROTECTED INTEGRITY PASS');
