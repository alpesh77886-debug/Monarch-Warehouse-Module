import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * PEN-016 regression test. Confirms, against the real (unmodified)
 * harness loop-gate script, the exact semantic this loop investigated
 * and documented: `completed_loops` counts every Claude Code turn
 * that reaches the Stop hook, not every substantive engineering
 * work-item. This test does not change the script or the stop gate's
 * behavior in any way - it only proves what that behavior already is,
 * using a throwaway MONARCH_ROOT so the repository's own real
 * .harness/loop-state.json is never touched by running this test.
 */

const repoRoot = join(__dirname, "..", "..");
const scriptPath = join(repoRoot, "scripts", "harness", "loop-gate.mjs");
let tempRoot: string;

function runLoopGate(cmd: string) {
  return execFileSync("node", [scriptPath, cmd], {
    env: { ...process.env, MONARCH_ROOT: tempRoot },
    encoding: "utf8",
  });
}

function readState() {
  return JSON.parse(readFileSync(join(tempRoot, ".harness", "loop-state.json"), "utf8"));
}

beforeEach(() => {
  tempRoot = mkdtempSync(join(tmpdir(), "loop-gate-test-"));
});

afterEach(() => {
  rmSync(tempRoot, { recursive: true, force: true });
});

describe("loop-gate completed_loops semantics (PEN-016)", () => {
  it("starts at 0 with no state file", () => {
    const out = JSON.parse(runLoopGate("status"));
    expect(out.completed_loops).toBe(0);
    expect(out.max_loops).toBe(10);
  });

  it("increments by exactly 1 per 'stop' invocation, regardless of what work happened in between", () => {
    runLoopGate("stop");
    runLoopGate("stop");
    runLoopGate("stop");
    const state = readState();
    expect(state.completed_loops).toBe(3);
    // This is the exact behavior PEN-016 flagged as easy to misread:
    // 3 here means 3 Stop-hook turns occurred, not that 3 approved
    // engineering loops were completed. The counter has no way to
    // know the difference - by design, per the harness engineering
    // documentation's own "a loop is one Claude Code work turn
    // reaching Stop" definition.
  });

  it("sets permission_required and writes a checkpoint file once completed_loops reaches max_loops", () => {
    for (let i = 0; i < 10; i++) runLoopGate("stop");
    const state = readState();
    expect(state.completed_loops).toBe(10);
    expect(state.permission_required).toBe(true);
    expect(existsSync(join(tempRoot, ".harness", "loop-checkpoint.md"))).toBe(true);
  });

  it("stops counting once permission_required is true, until 'approve' resets it", () => {
    for (let i = 0; i < 12; i++) runLoopGate("stop"); // 2 calls past the gate
    let state = readState();
    expect(state.completed_loops).toBe(10); // did not go to 12
    expect(state.permission_required).toBe(true);

    runLoopGate("approve");
    state = readState();
    expect(state.completed_loops).toBe(0);
    expect(state.permission_required).toBe(false);
    expect(state.window).toBe(2);
  });
});
