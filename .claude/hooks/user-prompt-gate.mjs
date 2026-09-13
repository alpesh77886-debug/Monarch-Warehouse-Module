#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
const root = process.env.CLAUDE_PROJECT_DIR || process.cwd();
const f = path.join(root, '.harness', 'loop-state.json');
let state = {completed_loops:0,max_loops:10,permission_required:false,window:1};
try { state = {...state, ...JSON.parse(fs.readFileSync(f,'utf8'))}; } catch {}
const input = JSON.parse(fs.readFileSync(0,'utf8'));
const prompt = String(input?.prompt ?? input?.user_prompt ?? '');
const APPROVAL = 'APPROVE_NEXT_10_LOOPS';
if (state.permission_required) {
  if (prompt.trim() === APPROVAL) {
    state.completed_loops = 0;
    state.permission_required = false;
    state.window += 1;
    fs.writeFileSync(f, JSON.stringify(state,null,2)+'\n');
    process.stdout.write(JSON.stringify({hookSpecificOutput:{hookEventName:'UserPromptSubmit',additionalContext:'Human approval verified. A new 10-loop work window is authorized.'}}));
  } else {
    process.stdout.write(JSON.stringify({decision:'block',reason:'10-loop checkpoint reached. Review the progress report and send exactly APPROVE_NEXT_10_LOOPS to authorize the next work block.'}));
  }
}
