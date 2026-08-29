// Renders the screen pages in headless Chrome and writes one SVG per artboard.
// No dependencies: uses Chrome DevTools Protocol over Node 22's built-in WebSocket.
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";

const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const PORT = 9333;
const HERE = resolve(process.argv[2] || ".");
const OUT = resolve(process.argv[3] || join(HERE, "svg"));

const JOBS = [
  { file: "v2.html", dir: "01-mobile-tablet" },
  { file: "coverage.html", dir: "02-coverage" },
  { file: "artboards.html", dir: "03-desktop-clinician" },
];

const pageScript = readFileSync(join(HERE, "pagescript.js"), "utf8");
const profile = join(tmpdir(), "cdp-profile-" + Date.now());

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getJSON(path) {
  const res = await fetch(`http://127.0.0.1:${PORT}${path}`);
  return res.json();
}

class CDP {
  constructor(url) { this.url = url; this.id = 0; this.pending = new Map(); }
  connect() {
    return new Promise((res, rej) => {
      this.ws = new WebSocket(this.url);
      this.ws.onopen = () => res();
      this.ws.onerror = (e) => rej(new Error("ws error"));
      this.ws.onmessage = (ev) => {
        const msg = JSON.parse(ev.data);
        if (msg.id && this.pending.has(msg.id)) {
          const { resolve, reject } = this.pending.get(msg.id);
          this.pending.delete(msg.id);
          msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result);
        }
      };
    });
  }
  send(method, params = {}, sessionId) {
    const id = ++this.id;
    const payload = { id, method, params };
    if (sessionId) payload.sessionId = sessionId;
    this.ws.send(JSON.stringify(payload));
    return new Promise((resolve, reject) => this.pending.set(id, { resolve, reject }));
  }
  close() { try { this.ws.close(); } catch {} }
}

const chrome = spawn(CHROME, [
  "--headless=new",
  "--disable-gpu",
  "--hide-scrollbars",
  "--no-first-run",
  "--no-default-browser-check",
  "--allow-file-access-from-files",
  "--force-device-scale-factor=1",
  "--window-size=1600,1200",
  `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${profile}`,
  "about:blank",
], { stdio: "ignore" });

let ready = false;
for (let i = 0; i < 60; i++) {
  try { await getJSON("/json/version"); ready = true; break; } catch { await sleep(300); }
}
if (!ready) { console.error("chrome did not start"); process.exit(1); }

const version = await getJSON("/json/version");
const browser = new CDP(version.webSocketDebuggerUrl);
await browser.connect();

let total = 0;
const manifest = [];

for (const job of JOBS) {
  const url = "file:///" + join(HERE, job.file).replace(/\\/g, "/");
  const { targetId } = await browser.send("Target.createTarget", { url });
  const { sessionId } = await browser.send("Target.attachToTarget", { targetId, flatten: true });
  await browser.send("Page.enable", {}, sessionId);
  await browser.send("Runtime.enable", {}, sessionId);
  await browser.send("Emulation.setDeviceMetricsOverride", { width: 1600, height: 1200, deviceScaleFactor: 1, mobile: false }, sessionId);

  // wait for load + webfonts
  await sleep(2500);
  await browser.send("Runtime.evaluate", { expression: "document.fonts.ready.then(()=>1)", awaitPromise: true }, sessionId);
  await sleep(800);

  const res = await browser.send("Runtime.evaluate", {
    expression: pageScript,
    returnByValue: true,
    timeout: 120000,
  }, sessionId);

  if (res.exceptionDetails) {
    console.error(job.file, "FAILED:", JSON.stringify(res.exceptionDetails).slice(0, 600));
    await browser.send("Target.closeTarget", { targetId });
    continue;
  }

  const boards = JSON.parse(res.result.value);
  const outDir = join(OUT, job.dir);
  mkdirSync(outDir, { recursive: true });
  for (const b of boards) {
    writeFileSync(join(outDir, b.name + ".svg"), b.svg, "utf8");
    manifest.push({ dir: job.dir, name: b.name, w: b.w, h: b.h, bytes: b.svg.length });
    total++;
  }
  console.log(job.file, "->", boards.length, "artboards");
  await browser.send("Target.closeTarget", { targetId });
}

writeFileSync(join(OUT, "manifest.json"), JSON.stringify(manifest, null, 2));
console.log("TOTAL", total);
browser.close();
chrome.kill();
await sleep(500);
try { rmSync(profile, { recursive: true, force: true }); } catch {}
process.exit(0);
