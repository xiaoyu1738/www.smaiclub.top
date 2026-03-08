import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";

const require = createRequire(import.meta.url);
const CryptoJS = require("crypto-js");

async function loadWorkerExports() {
  const workerPath = path.resolve(process.cwd(), "src/worker.js");
  let source = await readFile(workerPath, "utf8");

  source = source.replace(
    /^import CryptoJS from "crypto-js";\s*/m,
    "const CryptoJS = globalThis.__deps.CryptoJS;\n"
  );

  source += "\n;globalThis.__workerTestExports = { decryptTM, QMC_HANDLER_MAP, QmcRC4Cipher };";

  const sandbox = {
    __deps: { CryptoJS },
    self: {},
    console,
    TextDecoder,
    Uint8Array,
    ArrayBuffer,
    DataView,
    Blob,
    atob: (value) => Buffer.from(value, "base64").toString("binary")
  };
  sandbox.globalThis = sandbox;

  vm.runInNewContext(source, sandbox, { filename: workerPath });
  return sandbox.__workerTestExports;
}

test("decryptTM rejects random .tm3 payloads without valid MP4 brand", async () => {
  const { decryptTM } = await loadWorkerExports();
  const randomPayload = new Uint8Array(64);

  assert.throws(
    () => decryptTM(randomPayload.buffer, "broken.tm3"),
    /invalid tm file: unrecognized MP4 major brand/
  );
});

test("decryptTM accepts plausible TM payload and emits mp4 metadata", async () => {
  const { decryptTM } = await loadWorkerExports();
  const plausible = new Uint8Array(64);
  plausible.set([0x69, 0x73, 0x6f, 0x6d], 8); // "isom" major brand

  const result = decryptTM(plausible.buffer, "song.tm3");
  assert.equal(result.decoder, "tm");
  assert.equal(result.format, "mp4");
  assert.equal(result.audioData[4], 0x66); // f
  assert.equal(result.audioData[5], 0x74); // t
  assert.equal(result.audioData[6], 0x79); // y
  assert.equal(result.audioData[7], 0x70); // p
});

test("QMC map includes bare .qmc extension", async () => {
  const { QMC_HANDLER_MAP } = await loadWorkerExports();

  assert.equal(typeof QMC_HANDLER_MAP.qmc, "object");
  assert.equal(QMC_HANDLER_MAP.qmc.ext, "mp3");
  assert.equal(QMC_HANDLER_MAP.qmc.version, 2);
});

test("QmcRC4Cipher handles zero seed bytes without NaN segment indices", async () => {
  const { QmcRC4Cipher } = await loadWorkerExports();
  const cipher = new QmcRC4Cipher(new Uint8Array([0, 0, 0, 5, 0, 11]));

  for (let id = 0; id < 128; id++) {
    const idx = cipher.getSegmentKey(id);
    assert.equal(Number.isInteger(idx), true);
    assert.equal(Number.isFinite(idx), true);
    assert.equal(idx >= 0, true);
    assert.equal(idx < 6, true);
  }

  assert.doesNotThrow(() => {
    const data = new Uint8Array(128);
    cipher.decrypt(data, 0);
  });
});

test("QmcRC4Cipher keeps a full permutation for long keys", async () => {
  const { QmcRC4Cipher } = await loadWorkerExports();
  const key = new Uint8Array(300).map((_, i) => i % 251);
  const cipher = new QmcRC4Cipher(key);

  assert.equal(cipher.s.length, 300);
  assert.equal(new Set(cipher.s).size, 300);
  assert.equal(cipher.s.every((v) => Number.isInteger(v) && v >= 0 && v < 300), true);
});
