#!/usr/bin/env node
import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';
const root=process.env.MONARCH_ROOT||process.cwd();
const manifest=path.join(root,'UPGRADE_FILE_MANIFEST.sha256');
if(!fs.existsSync(manifest)){console.error('UPGRADE_FILE_MANIFEST.sha256 missing');process.exit(1)}
let fail=[];
for(const line of fs.readFileSync(manifest,'utf8').split(/\r?\n/).filter(Boolean)){
 const [hash,rel]=line.split(/\s{2,}/); if(!rel)continue; const f=path.join(root,rel); if(!fs.existsSync(f)){fail.push(`MISSING ${rel}`);continue;} const got=crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex'); if(got!==hash)fail.push(`MISMATCH ${rel}`);
}
if(fail.length){console.error(fail.join('\n'));process.exit(1)} console.log('PACKAGE INTEGRITY PASS');
