#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const root = process.env.MONARCH_ROOT || process.cwd();
const dir = path.join(root, 'contracts');
const files = fs.readdirSync(dir).filter(f => f.endsWith('.yaml')).sort();
const issues = [];

for (const file of files) {
  const full = path.join(dir, file);
  const lines = fs.readFileSync(full, 'utf8').split(/\r?\n/);
  lines.forEach((line, i) => {
    const n = i + 1;
    if (/^\s*\t/.test(line)) issues.push(`${file}:${n}: tab indentation is not allowed in YAML`);
    // YAML double-quoted scalars interpret backslash escapes. `\d` is not a YAML escape.
    if (/"(?:[^"\\]|\\.)*\\d(?:[^"\\]|\\.)*"/.test(line)) {
      issues.push(`${file}:${n}: invalid YAML escape \\d inside double-quoted scalar`);
    }
    if (/"(?:[^"\\]|\\.)*\\[A-Za-z](?:[^"\\]|\\.)*"/.test(line) && /validation:/.test(line)) {
      const m = line.match(/validation:\s*"((?:[^"\\]|\\.)*)"/);
      if (m && /\\[A-Za-z]/.test(m[1]) && !/\\["\\\\\/bfnrtu]/.test(m[1])) {
        issues.push(`${file}:${n}: suspicious backslash escape in validation regex; use a YAML-safe regex representation`);
      }
    }
  });
}

if (issues.length) {
  console.error(issues.join('\n'));
  process.exit(1);
}
console.log(`YAML LEXICAL GUARD PASS (${files.length} contract files)`);
