import assert from "node:assert/strict";

const base = "http://127.0.0.1:8090";
const token = process.env.ATLAS_COMPUTE_RUNNER_TOKEN;
assert.ok(token);
const headers = {Authorization: "Bearer " + token, "Content-Type": "application/json"};
const run = (kind, source, timeoutMs = 3000, signal) => fetch(base + "/v1/run", {
  method: "POST", headers, body: JSON.stringify({kind, source, timeoutMs}), signal,
});
const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));
for (let ready = false, attempt = 0; attempt < 50 && !ready; attempt++) {
  const response = await fetch(base + "/healthz", { headers }).catch(() => null);
  ready = response?.ok;
  if (!ready) await wait(200);
  if (attempt === 49) assert.ok(ready, "the sandbox never qualified");
}
assert.equal((await fetch(base + "/healthz")).status, 404);
assert.match((await (await fetch(base + "/healthz", { headers })).json()).version, /^[a-zA-Z0-9._-]+$/);
assert.equal((await run("python", "a".repeat(32 * 1024 + 1))).status, 400);
assert.equal((await run("latex", "tex", 30_001)).status, 400);
async function accepted(kind, source, timeoutMs) {
  const response = await run(kind, source, timeoutMs);
  assert.equal(response.status, 200);
  return response.json();
}
const python = await accepted("python", "from statistics import mean\nprint(mean([2, 4, 6]))");
assert.equal(python.status, "succeeded");
assert.equal(python.stdout.trim(), "4");
assert.ok(python.elapsedMs > 0);

const privacy = await accepted("python", `
import os
import socket

assert "ATLAS_COMPUTE_RUNNER_TOKEN" not in os.environ
assert "ATLAS_COMPUTE_TEST_SENTINEL" not in os.environ
for path in ["/etc/hostname", "/proc/self/status", "/opt/atlas-compute/server.mjs"]:
    try:
        with open(path):
            print("unexpected-access")
    except PermissionError:
        pass
    else:
        raise AssertionError("host filesystem must be private")
try:
    socket.socket()
except PermissionError:
    pass
else:
    raise AssertionError("socket must be denied")
try:
    os.fork()
except PermissionError:
    pass
else:
    raise AssertionError("fork must be denied")
try:
    buffer = bytearray(256 * 1024 * 1024)
except MemoryError:
    pass
else:
    raise AssertionError("memory limit failed")
with open("ordinary.txt", "w") as out:
    out.write("single run scratch")
os.mkdir("restricted", 0o700)
with open("restricted/test.txt", "w") as out:
    out.write("cleanup fixture")
os.chmod("restricted", 0)
print("isolated")
`);
assert.equal(privacy.status, "succeeded", privacy.stderr);
assert.equal(privacy.stdout.trim(), "isolated");
const successor = await accepted("python", 'from pathlib import Path\nassert not Path("ordinary.txt").exists()\nprint("fresh")');
assert.equal(successor.status, "succeeded");
assert.equal(successor.stdout.trim(), "fresh");
const fileSize = await accepted("python", `
import errno
try:
    with open("large.dat", "wb") as out:
        out.write(b"0" * (4 * 1024 * 1024 + 1))
except OSError as error:
    assert error.errno == errno.EFBIG
else:
    raise AssertionError("file size limit failed")
print("bounded")
`);
assert.equal(fileSize.status, "succeeded", fileSize.stderr);
assert.equal(fileSize.stdout.trim(), "bounded");
const failed = await accepted("python", "raise SystemExit(125)");
assert.equal(failed.status, "failed");


const timed = await accepted("python", "from time import sleep\nsleep(3)", 500);
assert.equal(timed.status, "timed_out");
assert.equal(timed.elapsedMs, 500);
const output = await accepted("python", "print('é' * 40_000)");
assert.equal(output.status, "output_limit");
assert.ok(Buffer.byteLength(output.stdout) <= 32 * 1024);

const tex = await accepted("latex", String.raw`\documentclass{article}
\begin{document}
\typeout{ATLAS-SHELL-MODE=\the\pdfshellescape}
Synthetic Atlas execution test
\end{document}`, 8000);
assert.equal(tex.status, "succeeded", tex.stdout + "\n" + tex.stderr);
assert.match(tex.stdout, /ATLAS-SHELL-MODE=0/);
const pdf = Buffer.from(tex.pdfBase64, "base64");
assert.equal(pdf.subarray(0, 5).toString(), "%PDF-");
assert.ok(pdf.length < 4 * 1024 * 1024);

const cancel = new AbortController();
const long = run("python", "from time import sleep\nsleep(20)", 21_000, cancel.signal).catch(error => error);
await wait(250);
const busy = await run("python", "print('second')");
assert.equal(busy.status, 503);
assert.equal((await busy.json()).error, "RUNNER_BUSY");
cancel.abort();
assert.equal((await long).name, "AbortError");
for (let attempt = 0;; attempt++) {
  const response = await run("python", "print('reaped')");
  if (response.ok) {
    assert.equal((await response.json()).stdout.trim(), "reaped");
    break;
  }
  assert.equal(response.status, 503);
  assert.ok(attempt < 25, "aborted job did not release runner");
  await wait(100);
}
console.log("PASS: real Linux Python and pdfLaTeX, shell disable, filesystem/network/fork/memory boundaries, bounded output, timeout, busy admission and client-abort cleanup.");
