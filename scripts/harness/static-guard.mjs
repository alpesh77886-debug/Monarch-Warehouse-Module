#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
const root=process.env.MONARCH_ROOT||process.cwd();
const src=path.join(root,'src');
const issues=[];
if(!fs.existsSync(src)){console.log('STATIC GUARD: src/ absent (architecture package stage) — NOT APPLICABLE');process.exit(0);}
function walk(d){let a=[]; for(const e of fs.readdirSync(d,{withFileTypes:true})){const p=path.join(d,e.name);if(e.isDirectory())a.push(...walk(p));else if(/\.(ts|tsx|js|jsx|mjs)$/.test(e.name))a.push(p)} return a;}
for(const f of walk(src)){
  const s=fs.readFileSync(f,'utf8');
  if(/\.prepare\(|db\.run\(|execute\(\s*sql|PRAGMA|SELECT\s+.+FROM\s+/is.test(s) && !f.includes(`${path.sep}drizzle${path.sep}`)) issues.push(`Possible raw SQL outside ORM: ${path.relative(root,f)}`);
  if(f.includes(`${path.sep}app${path.sep}api${path.sep}`) && !/auth\(|requirePermission\(|requireRole\(|clerk/i.test(s)) issues.push(`API route lacks obvious auth guard: ${path.relative(root,f)}`);
  if(f.includes(`${path.sep}components${path.sep}`) && /from ['\"](?:@\/)?lib\/db|drizzle-orm/i.test(s)) issues.push(`UI component appears to access DB directly: ${path.relative(root,f)}`);
}
if(issues.length){console.error(issues.join('\n'));process.exit(1)}
console.log('STATIC GUARD PASS');
