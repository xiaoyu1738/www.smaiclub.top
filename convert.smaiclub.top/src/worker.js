import CryptoJS from "crypto-js";

const CORE_KEY = CryptoJS.enc.Hex.parse("687a4852416d736f356b496e62617857");
const META_KEY = CryptoJS.enc.Hex.parse("2331346C6A6B5F215C5D2630553C2728");

const DEFAULT_ALBUM_PIC =
  "https://p4.music.126.net/nSsje95JU5hVylFPzLqWHw==/109951163542280093.jpg";

const AUDIO_MIME_TYPE = {
  mp3: "audio/mpeg",
  flac: "audio/flac",
  m4a: "audio/mp4",
  mp4: "audio/mp4",
  aac: "audio/aac",
  ogg: "audio/ogg",
  wav: "audio/wav",
  wma: "audio/x-ms-wma",
  dff: "audio/x-dff",
};

const FLAC_HEADER = [0x66, 0x4c, 0x61, 0x43];
const MP3_HEADER = [0x49, 0x44, 0x33];
const OGG_HEADER = [0x4f, 0x67, 0x67, 0x53];
const WAV_HEADER = [0x52, 0x49, 0x46, 0x46];
const WMA_HEADER = [
  0x30, 0x26, 0xb2, 0x75, 0x8e, 0x66, 0xcf, 0x11, 0xa6, 0xd9, 0x00, 0xaa, 0x00,
  0x62, 0xce, 0x6c,
];
const AAC_HEADER = [0xff, 0xf1];
const DFF_HEADER = [0x46, 0x52, 0x4d, 0x38];
const M4A_HEADER = [0x66, 0x74, 0x79, 0x70];

const textDecoder = new TextDecoder();

function bytesHasPrefix(data, prefix) {
  if (!data || !prefix || prefix.length > data.length) return false;
  for (let i = 0; i < prefix.length; i++) {
    if (data[i] !== prefix[i]) return false;
  }
  return true;
}

function sniffAudioExt(data, fallback = "mp3") {
  if (!data || data.length === 0) return fallback;
  if (bytesHasPrefix(data, MP3_HEADER)) return "mp3";
  if (bytesHasPrefix(data, FLAC_HEADER)) return "flac";
  if (bytesHasPrefix(data, OGG_HEADER)) return "ogg";
  if (bytesHasPrefix(data, WAV_HEADER)) return "wav";
  if (bytesHasPrefix(data, WMA_HEADER)) return "wma";
  if (bytesHasPrefix(data, AAC_HEADER)) return "aac";
  if (bytesHasPrefix(data, DFF_HEADER)) return "dff";
  if (data.length >= 8 && bytesHasPrefix(data.slice(4), M4A_HEADER))
    return "m4a";
  return fallback;
}

function normalizeFormat(ext) {
  const val = String(ext || "").toLowerCase();
  if (!val) return "mp3";
  if (val === "m4a" || val === "mmp4") return "mp4";
  return val;
}

function splitFilename(filename) {
  const idx = filename.lastIndexOf(".");
  if (idx <= 0) return { base: filename, ext: "" };
  return {
    base: filename.slice(0, idx),
    ext: filename.slice(idx + 1).toLowerCase(),
  };
}

function parseTitleArtist(base) {
  if (!base) return { title: "Unknown", artist: undefined };
  const byDash = base.split(" - ");
  if (byDash.length >= 2) {
    return {
      title: byDash.slice(1).join(" - ").trim() || base,
      artist: byDash[0].trim() || undefined,
    };
  }
  return { title: base, artist: undefined };
}

function buildGenericMeta(filename, format, overrides = {}) {
  const { base } = splitFilename(filename);
  const { title, artist } = parseTitleArtist(base);
  const out = {
    musicName: title,
    artist: artist ? [[artist, 0]] : undefined,
    album: "Unknown Album",
    albumPic: DEFAULT_ALBUM_PIC,
    format,
    ...overrides,
  };

  if (typeof out.albumPic === "string") {
    out.albumPic = out.albumPic.replace(/^http:/, "https:");
  }

  return out;
}

function dataView(buffer) {
  return new DataView(buffer, 0, buffer.byteLength);
}

function decryptNCM(filebuffer, filename) {
  const view = dataView(filebuffer);

  if (
    view.getUint32(0, true) !== 0x4e455443 ||
    view.getUint32(4, true) !== 0x4d414446
  ) {
    return null;
  }

  let offset = 10;

  const keyLen = view.getUint32(offset, true);
  offset += 4;
  const keyCipher = new Uint8Array(filebuffer, offset, keyLen).map(
    (v) => v ^ 0x64,
  );
  offset += keyLen;

  const keyPlain = CryptoJS.AES.decrypt(
    { ciphertext: CryptoJS.lib.WordArray.create(keyCipher) },
    CORE_KEY,
    { mode: CryptoJS.mode.ECB, padding: CryptoJS.pad.Pkcs7 },
  );

  const keyResult = new Uint8Array(keyPlain.sigBytes);
  {
    const words = keyPlain.words;
    const sigBytes = keyPlain.sigBytes;
    for (let i = 0; i < sigBytes; i++) {
      keyResult[i] = (words[i >>> 2] >>> (24 - (i % 4) * 8)) & 0xff;
    }
  }
  const keyData = keyResult.slice(17);

  const keyBox = new Uint8Array(Array(256).keys());
  let j = 0;
  for (let i = 0; i < 256; i++) {
    j = (keyBox[i] + j + keyData[i % keyData.length]) & 0xff;
    [keyBox[i], keyBox[j]] = [keyBox[j], keyBox[i]];
  }

  const box = keyBox.map((_, i, arr) => {
    i = (i + 1) & 0xff;
    const si = arr[i];
    const sj = arr[(i + si) & 0xff];
    return arr[(si + sj) & 0xff];
  });

  let musicMeta = {
    album: "Unknown",
    albumPic: DEFAULT_ALBUM_PIC,
    format: "mp3",
  };

  const metaLen = view.getUint32(offset, true);
  offset += 4;
  if (metaLen > 0) {
    const metaCipher = new Uint8Array(filebuffer, offset, metaLen).map(
      (v) => v ^ 0x63,
    );
    offset += metaLen;

    const metaBase64 = CryptoJS.lib.WordArray.create(
      metaCipher.slice(22),
    ).toString(CryptoJS.enc.Utf8);
    const metaPlain = CryptoJS.AES.decrypt(
      { ciphertext: CryptoJS.enc.Base64.parse(metaBase64) },
      META_KEY,
      { mode: CryptoJS.mode.ECB, padding: CryptoJS.pad.Pkcs7 },
    );

    try {
      const json = JSON.parse(metaPlain.toString(CryptoJS.enc.Utf8).slice(6));
      musicMeta = {
        ...musicMeta,
        ...json,
      };
      if (musicMeta.albumPic)
        musicMeta.albumPic = musicMeta.albumPic.replace(/^http:/, "https:");
    } catch (err) {
      console.warn("NCM metadata parse failed", err);
    }
  }

  offset += view.getUint32(offset + 5, true) + 13;

  const audioData = new Uint8Array(filebuffer, offset);
  for (let i = 0; i < audioData.length; i++) {
    audioData[i] ^= box[i & 0xff];
  }

  const format = normalizeFormat(
    musicMeta.format || sniffAudioExt(audioData, "mp3"),
  );
  const meta = buildGenericMeta(filename, format, {
    ...musicMeta,
    format,
  });

  return {
    decoder: "ncm",
    audioData,
    format,
    meta,
  };
}

class TeaCipher {
  static delta = 0x9e3779b9;

  constructor(key, rounds = 32) {
    if (!(key instanceof Uint8Array) || key.length !== 16) {
      throw new Error("invalid tea key");
    }
    this.rounds = rounds;
    const view = new DataView(key.buffer, key.byteOffset, key.byteLength);
    this.k0 = view.getUint32(0, false);
    this.k1 = view.getUint32(4, false);
    this.k2 = view.getUint32(8, false);
    this.k3 = view.getUint32(12, false);
  }

  decryptBlock(srcView, dstView) {
    let v0 = srcView.getUint32(0, false) >>> 0;
    let v1 = srcView.getUint32(4, false) >>> 0;

    let sum = (((TeaCipher.delta >>> 0) * this.rounds) / 2) >>> 0;
    for (let i = 0; i < this.rounds / 2; i++) {
      v1 =
        (v1 -
          ((((v0 << 4) >>> 0) + this.k2) ^
            ((v0 + sum) >>> 0) ^
            (((v0 >>> 5) + this.k3) >>> 0))) >>>
        0;
      v0 =
        (v0 -
          ((((v1 << 4) >>> 0) + this.k0) ^
            ((v1 + sum) >>> 0) ^
            (((v1 >>> 5) + this.k1) >>> 0))) >>>
        0;
      sum = (sum - TeaCipher.delta) >>> 0;
    }

    dstView.setUint32(0, v0, false);
    dstView.setUint32(4, v1, false);
  }
}

function decodeBase64ToBytes(text) {
  const clean = String(text || "").trim();
  if (!clean) return new Uint8Array();
  const binary = atob(clean);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

function simpleMakeKey(salt, length) {
  const arr = new Uint8Array(length);
  for (let i = 0; i < length; i++) {
    arr[i] = (Math.abs(Math.tan(salt + i * 0.1) * 100) & 0xff) >>> 0;
  }
  return arr;
}

const MIX_KEY_1 = new Uint8Array([
  0x33, 0x38, 0x36, 0x5a, 0x4a, 0x59, 0x21, 0x40, 0x23, 0x2a, 0x24, 0x25, 0x5e,
  0x26, 0x29, 0x28,
]);
const MIX_KEY_2 = new Uint8Array([
  0x2a, 0x2a, 0x23, 0x21, 0x28, 0x23, 0x24, 0x25, 0x26, 0x5e, 0x61, 0x31, 0x63,
  0x5a, 0x2c, 0x54,
]);

function decryptTencentTea(input, key) {
  if (input.length % 8 !== 0 || input.length < 16) {
    throw new Error("invalid tencent tea input");
  }

  const cipher = new TeaCipher(key, 32);
  const tmpBuf = new Uint8Array(8);
  const tmpView = new DataView(tmpBuf.buffer);
  cipher.decryptBlock(new DataView(input.buffer, input.byteOffset, 8), tmpView);

  const SALT_LEN = 2;
  const ZERO_LEN = 7;
  const nPadLen = tmpBuf[0] & 0x07;
  const outLen = input.length - 1 - nPadLen - SALT_LEN - ZERO_LEN;
  if (outLen < 0) throw new Error("invalid tea output length");

  const out = new Uint8Array(outLen);
  let ivPrev = new Uint8Array(8);
  let ivCur = input.slice(0, 8);
  let inputPos = 8;
  let tmpIdx = 1 + nPadLen;

  const cryptBlock = () => {
    ivPrev = ivCur;
    ivCur = input.slice(inputPos, inputPos + 8);
    for (let j = 0; j < 8; j++) {
      tmpBuf[j] ^= ivCur[j];
    }
    cipher.decryptBlock(tmpView, tmpView);
    inputPos += 8;
    tmpIdx = 0;
  };

  for (let i = 0; i < SALT_LEN; ) {
    if (tmpIdx < 8) {
      tmpIdx++;
      i++;
    } else {
      cryptBlock();
    }
  }

  let outPos = 0;
  while (outPos < outLen) {
    if (tmpIdx < 8) {
      out[outPos] = tmpBuf[tmpIdx] ^ ivPrev[tmpIdx];
      outPos++;
      tmpIdx++;
    } else {
      cryptBlock();
    }
  }

  return out;
}

function decryptV2Key(rawBytes) {
  const prefix = "QQMusic EncV2,Key:";
  if (
    rawBytes.length < 18 ||
    textDecoder.decode(rawBytes.slice(0, 18)) !== prefix
  ) {
    return rawBytes;
  }

  let out = decryptTencentTea(rawBytes.slice(18), MIX_KEY_1);
  out = decryptTencentTea(out, MIX_KEY_2);
  const decoded = decodeBase64ToBytes(textDecoder.decode(out));
  if (decoded.length < 16) {
    throw new Error("EncV2 key decode failed");
  }
  return decoded;
}

function qmcDeriveKey(rawKeyBytes) {
  const rawText = textDecoder.decode(rawKeyBytes).trim();
  let rawDec = decodeBase64ToBytes(rawText);
  if (rawDec.length < 16) throw new Error("qmc key length is too short");

  rawDec = decryptV2Key(rawDec);

  const simpleKey = simpleMakeKey(106, 8);
  const teaKey = new Uint8Array(16);
  for (let i = 0; i < 8; i++) {
    teaKey[i * 2] = simpleKey[i];
    teaKey[i * 2 + 1] = rawDec[i];
  }

  const sub = decryptTencentTea(rawDec.slice(8), teaKey);
  const merged = new Uint8Array(8 + sub.length);
  merged.set(rawDec.slice(0, 8), 0);
  merged.set(sub, 8);
  return merged;
}

class QmcStaticCipher {
  static BOX = new Uint8Array([
    0x77, 0x48, 0x32, 0x73, 0xde, 0xf2, 0xc0, 0xc8, 0x95, 0xec, 0x30, 0xb2,
    0x51, 0xc3, 0xe1, 0xa0, 0x9e, 0xe6, 0x9d, 0xcf, 0xfa, 0x7f, 0x14, 0xd1,
    0xce, 0xb8, 0xdc, 0xc3, 0x4a, 0x67, 0x93, 0xd6, 0x28, 0xc2, 0x91, 0x70,
    0xca, 0x8d, 0xa2, 0xa4, 0xf0, 0x08, 0x61, 0x90, 0x7e, 0x6f, 0xa2, 0xe0,
    0xeb, 0xae, 0x3e, 0xb6, 0x67, 0xc7, 0x92, 0xf4, 0x91, 0xb5, 0xf6, 0x6c,
    0x5e, 0x84, 0x40, 0xf7, 0xf3, 0x1b, 0x02, 0x7f, 0xd5, 0xab, 0x41, 0x89,
    0x28, 0xf4, 0x25, 0xcc, 0x52, 0x11, 0xad, 0x43, 0x68, 0xa6, 0x41, 0x8b,
    0x84, 0xb5, 0xff, 0x2c, 0x92, 0x4a, 0x26, 0xd8, 0x47, 0x6a, 0x7c, 0x95,
    0x61, 0xcc, 0xe6, 0xcb, 0xbb, 0x3f, 0x47, 0x58, 0x89, 0x75, 0xc3, 0x75,
    0xa1, 0xd9, 0xaf, 0xcc, 0x08, 0x73, 0x17, 0xdc, 0xaa, 0x9a, 0xa2, 0x16,
    0x41, 0xd8, 0xa2, 0x06, 0xc6, 0x8b, 0xfc, 0x66, 0x34, 0x9f, 0xcf, 0x18,
    0x23, 0xa0, 0x0a, 0x74, 0xe7, 0x2b, 0x27, 0x70, 0x92, 0xe9, 0xaf, 0x37,
    0xe6, 0x8c, 0xa7, 0xbc, 0x62, 0x65, 0x9c, 0xc2, 0x08, 0xc9, 0x88, 0xb3,
    0xf3, 0x43, 0xac, 0x74, 0x2c, 0x0f, 0xd4, 0xaf, 0xa1, 0xc3, 0x01, 0x64,
    0x95, 0x4e, 0x48, 0x9f, 0xf4, 0x35, 0x78, 0x95, 0x7a, 0x39, 0xd6, 0x6a,
    0xa0, 0x6d, 0x40, 0xe8, 0x4f, 0xa8, 0xef, 0x11, 0x1d, 0xf3, 0x1b, 0x3f,
    0x3f, 0x07, 0xdd, 0x6f, 0x5b, 0x19, 0x30, 0x19, 0xfb, 0xef, 0x0e, 0x37,
    0xf0, 0x0e, 0xcd, 0x16, 0x49, 0xfe, 0x53, 0x47, 0x13, 0x1a, 0xbd, 0xa4,
    0xf1, 0x40, 0x19, 0x60, 0x0e, 0xed, 0x68, 0x09, 0x06, 0x5f, 0x4d, 0xcf,
    0x3d, 0x1a, 0xfe, 0x20, 0x77, 0xe4, 0xd9, 0xda, 0xf9, 0xa4, 0x2b, 0x76,
    0x1c, 0x71, 0xdb, 0x00, 0xbc, 0xfd, 0x0c, 0x6c, 0xa5, 0x47, 0xf7, 0xf6,
    0x00, 0x79, 0x4a, 0x11,
  ]);

  getMask(offset) {
    if (offset > 0x7fff) offset %= 0x7fff;
    return QmcStaticCipher.BOX[(offset * offset + 27) & 0xff];
  }

  decrypt(buf, offset) {
    for (let i = 0; i < buf.length; i++) {
      buf[i] ^= this.getMask(offset + i);
    }
  }
}

class QmcMapCipher {
  constructor(key) {
    if (!key || key.length === 0)
      throw new Error("qmc map cipher key is empty");
    this.key = key;
    this.n = key.length;
  }

  static rotate(value, bits) {
    const rotate = (bits + 4) % 8;
    return ((value << rotate) | (value >> rotate)) & 0xff;
  }

  getMask(offset) {
    if (offset > 0x7fff) offset %= 0x7fff;
    const idx = (offset * offset + 71214) % this.n;
    return QmcMapCipher.rotate(this.key[idx], idx & 0x7);
  }

  decrypt(buf, offset) {
    for (let i = 0; i < buf.length; i++) {
      buf[i] ^= this.getMask(offset + i);
    }
  }
}

class QmcRC4Cipher {
  static FIRST_SEGMENT_SIZE = 0x80;
  static SEGMENT_SIZE = 5120;

  constructor(key) {
    if (!key || key.length === 0)
      throw new Error("qmc rc4 cipher key is empty");

    this.key = key;
    this.n = key.length;
    // QMC RC4-like implementation requires a full 0..n-1 permutation;
    // Uint8Array truncates values when n > 256 and breaks keystream generation.
    this.s = Array.from({ length: this.n }, (_, i) => i);

    let j = 0;
    for (let i = 0; i < this.n; i++) {
      j = (this.s[i] + j + this.key[i % this.n]) % this.n;
      [this.s[i], this.s[j]] = [this.s[j], this.s[i]];
    }

    this.hash = 1;
    this.firstNonZeroSeed = 1;
    for (let i = 0; i < this.n; i++) {
      const value = this.key[i];
      if (!value) continue;
      if (this.firstNonZeroSeed === 1) this.firstNonZeroSeed = value;
      const nextHash = (this.hash * value) >>> 0;
      if (nextHash === 0 || nextHash <= this.hash) break;
      this.hash = nextHash;
    }
  }

  getSegmentKey(id) {
    const seed = this.key[id % this.n] || this.firstNonZeroSeed || 1;
    const denominator = (id + 1) * seed;
    if (!Number.isFinite(denominator) || denominator <= 0) return 0;

    const rawIndex = Math.floor((this.hash / denominator) * 100);
    if (!Number.isFinite(rawIndex)) return 0;

    const idx = rawIndex % this.n;
    return idx >= 0 ? idx : idx + this.n;
  }

  decryptFirstSegment(buf, offset) {
    for (let i = 0; i < buf.length; i++) {
      buf[i] ^= this.key[this.getSegmentKey(offset + i)];
    }
  }

  decryptSegment(buf, offset) {
    const s = this.s.slice();
    const skipLen =
      (offset % QmcRC4Cipher.SEGMENT_SIZE) +
      this.getSegmentKey(Math.floor(offset / QmcRC4Cipher.SEGMENT_SIZE));

    let j = 0;
    let k = 0;
    for (let i = -skipLen; i < buf.length; i++) {
      j = (j + 1) % this.n;
      k = (s[j] + k) % this.n;
      [s[k], s[j]] = [s[j], s[k]];
      if (i >= 0) {
        buf[i] ^= s[(s[j] + s[k]) % this.n] & 0xff;
      }
    }
  }

  decrypt(buf, offset) {
    let toProcess = buf.length;
    let processed = 0;

    const post = (len) => {
      toProcess -= len;
      processed += len;
      offset += len;
      return toProcess === 0;
    };

    if (offset < QmcRC4Cipher.FIRST_SEGMENT_SIZE) {
      const len = Math.min(
        buf.length,
        QmcRC4Cipher.FIRST_SEGMENT_SIZE - offset,
      );
      this.decryptFirstSegment(buf.subarray(0, len), offset);
      if (post(len)) return;
    }

    if (offset % QmcRC4Cipher.SEGMENT_SIZE !== 0) {
      const len = Math.min(
        QmcRC4Cipher.SEGMENT_SIZE - (offset % QmcRC4Cipher.SEGMENT_SIZE),
        toProcess,
      );
      this.decryptSegment(buf.subarray(processed, processed + len), offset);
      if (post(len)) return;
    }

    while (toProcess > QmcRC4Cipher.SEGMENT_SIZE) {
      this.decryptSegment(
        buf.subarray(processed, processed + QmcRC4Cipher.SEGMENT_SIZE),
        offset,
      );
      post(QmcRC4Cipher.SEGMENT_SIZE);
    }

    if (toProcess > 0) {
      this.decryptSegment(buf.subarray(processed), offset);
    }
  }
}

const QMC_HANDLER_MAP = {
  mgg: { ext: "ogg", version: 2 },
  mgg0: { ext: "ogg", version: 2 },
  mgg1: { ext: "ogg", version: 2 },
  mggl: { ext: "ogg", version: 2 },
  qmc: { ext: "mp3", version: 2 },
  mflac: { ext: "flac", version: 2 },
  mflac0: { ext: "flac", version: 2 },
  mmp4: { ext: "mp4", version: 2 },
  qmcflac: { ext: "flac", version: 2 },
  qmcogg: { ext: "ogg", version: 2 },
  qmc0: { ext: "mp3", version: 2 },
  qmc2: { ext: "ogg", version: 2 },
  qmc3: { ext: "mp3", version: 2 },
  qmc4: { ext: "ogg", version: 2 },
  qmc6: { ext: "ogg", version: 2 },
  qmc8: { ext: "ogg", version: 2 },
  bkcmp3: { ext: "mp3", version: 1 },
  bkcm4a: { ext: "m4a", version: 1 },
  bkcflac: { ext: "flac", version: 1 },
  bkcwav: { ext: "wav", version: 1 },
  bkcape: { ext: "ape", version: 1 },
  bkcogg: { ext: "ogg", version: 1 },
  bkcwma: { ext: "wma", version: 1 },
  tkm: { ext: "m4a", version: 1 },
  "666c6163": { ext: "flac", version: 1 },
  "6d7033": { ext: "mp3", version: 1 },
  "6f6767": { ext: "ogg", version: 1 },
  "6d3461": { ext: "m4a", version: 1 },
  776176: { ext: "wav", version: 1 },
};

class QmcDecoder {
  static BYTE_COMMA = ",".charCodeAt(0);

  constructor(fileBytes) {
    this.file = fileBytes;
    this.size = fileBytes.length;
    this.decoded = false;
    this.audioSize = 0;
    this.cipher = null;
    this.songID = 0;
    this.searchKey();
  }

  searchKey() {
    const last4 = this.file.slice(-4);
    const tailText = textDecoder.decode(last4);

    if (tailText === "STag") {
      throw new Error("QMC 文件中没有写入密钥，无法解锁（STag）");
    }

    if (tailText === "QTag") {
      const sizeView = new DataView(
        this.file.buffer,
        this.file.byteOffset + this.size - 8,
        4,
      );
      const keySize = sizeView.getUint32(0, false);
      this.audioSize = this.size - keySize - 8;
      if (this.audioSize <= 0) throw new Error("invalid qmc qtag size");

      const rawKey = this.file.subarray(this.audioSize, this.size - 8);
      const keyEnd = rawKey.indexOf(QmcDecoder.BYTE_COMMA);
      if (keyEnd < 0) throw new Error("invalid qmc key body");
      this.setCipher(rawKey.subarray(0, keyEnd));

      const idBuf = rawKey.subarray(keyEnd + 1);
      const idEnd = idBuf.indexOf(QmcDecoder.BYTE_COMMA);
      if (idEnd > 0) {
        const songText = textDecoder.decode(idBuf.subarray(0, idEnd));
        const songIdNum = Number.parseInt(songText, 10);
        this.songID = Number.isFinite(songIdNum) ? songIdNum : 0;
      }
      return;
    }

    const sizeView = new DataView(last4.buffer, last4.byteOffset, 4);
    const keySize = sizeView.getUint32(0, true);
    if (keySize < 0x400 && this.size > keySize + 4) {
      this.audioSize = this.size - keySize - 4;
      const rawKey = this.file.subarray(this.audioSize, this.size - 4);
      this.setCipher(rawKey);
    } else {
      this.audioSize = this.size;
      this.cipher = new QmcStaticCipher();
    }
  }

  setCipher(rawKey) {
    const key = qmcDeriveKey(rawKey);
    this.cipher =
      key.length > 300 ? new QmcRC4Cipher(key) : new QmcMapCipher(key);
  }

  decrypt() {
    if (!this.cipher) throw new Error("qmc cipher missing");
    if (!this.audioSize || this.audioSize <= 0)
      throw new Error("invalid qmc audio size");

    const audio = this.file.slice(0, this.audioSize);
    if (!this.decoded) {
      this.cipher.decrypt(audio, 0);
      this.decoded = true;
    }
    return audio;
  }
}

function decryptQMC(filebuffer, filename) {
  const { ext } = splitFilename(filename);
  const handler = QMC_HANDLER_MAP[ext];
  if (!handler) return null;

  const decoder = new QmcDecoder(new Uint8Array(filebuffer));
  const audioData = decoder.decrypt();
  const format = normalizeFormat(sniffAudioExt(audioData, handler.ext));

  return {
    decoder: "qmc",
    audioData,
    format,
    meta: buildGenericMeta(filename, format),
  };
}

const KWM_MAGIC_HEADER = [
  0x79, 0x65, 0x65, 0x6c, 0x69, 0x6f, 0x6e, 0x2d, 0x6b, 0x75, 0x77, 0x6f, 0x2d,
  0x74, 0x6d, 0x65,
];
const KWM_MAGIC_HEADER_2 = [
  0x79, 0x65, 0x65, 0x6c, 0x69, 0x6f, 0x6e, 0x2d, 0x6b, 0x75, 0x77, 0x6f, 0x00,
  0x00, 0x00, 0x00,
];
const KWM_PREDEFINED_KEY = "MoOtOiTvINGwd2E6n0E1i7L5t2IoOoNk";

function trimRepeatedKey(str) {
  if (str.length === 0) return "0".repeat(32);
  let out = str;
  while (out.length < 32) {
    out += out;
  }
  return out.slice(0, 32);
}

function createKwmMaskFromRecipe(recipeBytes) {
  const view = new DataView(recipeBytes.buffer, recipeBytes.byteOffset, 8);
  const keyAsString = view.getBigUint64(0, true).toString();
  const keyText = trimRepeatedKey(keyAsString);

  const mask = new Uint8Array(32);
  for (let i = 0; i < 32; i++) {
    mask[i] = KWM_PREDEFINED_KEY.charCodeAt(i) ^ keyText.charCodeAt(i);
  }
  return mask;
}

function decryptKWM(filebuffer, filename) {
  const raw = new Uint8Array(filebuffer);
  if (
    !bytesHasPrefix(raw, KWM_MAGIC_HEADER) &&
    !bytesHasPrefix(raw, KWM_MAGIC_HEADER_2)
  ) {
    return null;
  }

  if (raw.length <= 0x400) {
    throw new Error("invalid kwm file: too small");
  }

  const recipe = raw.slice(0x18, 0x20);
  const mask = createKwmMaskFromRecipe(recipe);
  const audioData = raw.slice(0x400);

  for (let i = 0; i < audioData.length; i++) {
    audioData[i] ^= mask[i % 32];
  }

  const format = normalizeFormat(sniffAudioExt(audioData, "mp3"));
  return {
    decoder: "kwm",
    audioData,
    format,
    meta: buildGenericMeta(filename, format),
  };
}

const VPR_HEADER = [
  0x05, 0x28, 0xbc, 0x96, 0xe9, 0xe4, 0x5a, 0x43, 0x91, 0xaa, 0xbd, 0xd0, 0x7a,
  0xf5, 0x36, 0x31,
];
const KGM_HEADER = [
  0x7c, 0xd5, 0x32, 0xeb, 0x86, 0x02, 0x7f, 0x4b, 0xa8, 0xaf, 0xa6, 0x8e, 0x0f,
  0xff, 0x99, 0x14,
];
const VPR_MASK_DIFF = [
  0x25, 0xdf, 0xe8, 0xa6, 0x75, 0x1e, 0x75, 0x0e, 0x2f, 0x80, 0xf3, 0x2d, 0xb8,
  0xb6, 0xe3, 0x11, 0x00,
];

const KGM_TABLE_1 = [
  0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x00, 0x01, 0x21, 0x01, 0x61, 0x01, 0x21, 0x01, 0xe1, 0x01,
  0x21, 0x01, 0x61, 0x01, 0x21, 0x01, 0xd2, 0x23, 0x02, 0x02, 0x42, 0x42, 0x02,
  0x02, 0xc2, 0xc2, 0x02, 0x02, 0x42, 0x42, 0x02, 0x02, 0xd3, 0xd3, 0x02, 0x03,
  0x63, 0x43, 0x63, 0x03, 0xe3, 0xc3, 0xe3, 0x03, 0x63, 0x43, 0x63, 0x03, 0x94,
  0xb4, 0x94, 0x65, 0x04, 0x04, 0x04, 0x04, 0x84, 0x84, 0x84, 0x84, 0x04, 0x04,
  0x04, 0x04, 0x95, 0x95, 0x95, 0x95, 0x04, 0x05, 0x25, 0x05, 0xe5, 0x85, 0xa5,
  0x85, 0xe5, 0x05, 0x25, 0x05, 0xd6, 0xb6, 0x96, 0xb6, 0xd6, 0x27, 0x06, 0x06,
  0xc6, 0xc6, 0x86, 0x86, 0xc6, 0xc6, 0x06, 0x06, 0xd7, 0xd7, 0x97, 0x97, 0xd7,
  0xd7, 0x06, 0x07, 0xe7, 0xc7, 0xe7, 0x87, 0xe7, 0xc7, 0xe7, 0x07, 0x18, 0x38,
  0x18, 0x78, 0x18, 0x38, 0x18, 0xe9, 0x08, 0x08, 0x08, 0x08, 0x08, 0x08, 0x08,
  0x08, 0x19, 0x19, 0x19, 0x19, 0x19, 0x19, 0x19, 0x19, 0x08, 0x09, 0x29, 0x09,
  0x69, 0x09, 0x29, 0x09, 0xda, 0x3a, 0x1a, 0x3a, 0x5a, 0x3a, 0x1a, 0x3a, 0xda,
  0x2b, 0x0a, 0x0a, 0x4a, 0x4a, 0x0a, 0x0a, 0xdb, 0xdb, 0x1b, 0x1b, 0x5b, 0x5b,
  0x1b, 0x1b, 0xdb, 0xdb, 0x0a, 0x0b, 0x6b, 0x4b, 0x6b, 0x0b, 0x9c, 0xbc, 0x9c,
  0x7c, 0x1c, 0x3c, 0x1c, 0x7c, 0x9c, 0xbc, 0x9c, 0x6d, 0x0c, 0x0c, 0x0c, 0x0c,
  0x9d, 0x9d, 0x9d, 0x9d, 0x1d, 0x1d, 0x1d, 0x1d, 0x9d, 0x9d, 0x9d, 0x9d, 0x0c,
  0x0d, 0x2d, 0x0d, 0xde, 0xbe, 0x9e, 0xbe, 0xde, 0x3e, 0x1e, 0x3e, 0xde, 0xbe,
  0x9e, 0xbe, 0xde, 0x2f, 0x0e, 0x0e, 0xdf, 0xdf, 0x9f, 0x9f, 0xdf, 0xdf, 0x1f,
  0x1f, 0xdf, 0xdf, 0x9f, 0x9f, 0xdf, 0xdf, 0x0e, 0x0f, 0x00, 0x20, 0x00, 0x60,
  0x00, 0x20, 0x00, 0xe0, 0x00, 0x20, 0x00, 0x60, 0x00, 0x20, 0x00, 0xf1,
];

const KGM_TABLE_2 = [
  0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x00, 0x01, 0x23, 0x01, 0x67, 0x01, 0x23, 0x01, 0xef, 0x01,
  0x23, 0x01, 0x67, 0x01, 0x23, 0x01, 0xdf, 0x21, 0x02, 0x02, 0x46, 0x46, 0x02,
  0x02, 0xce, 0xce, 0x02, 0x02, 0x46, 0x46, 0x02, 0x02, 0xde, 0xde, 0x02, 0x03,
  0x65, 0x47, 0x65, 0x03, 0xed, 0xcf, 0xed, 0x03, 0x65, 0x47, 0x65, 0x03, 0x9d,
  0xbf, 0x9d, 0x63, 0x04, 0x04, 0x04, 0x04, 0x8c, 0x8c, 0x8c, 0x8c, 0x04, 0x04,
  0x04, 0x04, 0x9c, 0x9c, 0x9c, 0x9c, 0x04, 0x05, 0x27, 0x05, 0xeb, 0x8d, 0xaf,
  0x8d, 0xeb, 0x05, 0x27, 0x05, 0xdb, 0xbd, 0x9f, 0xbd, 0xdb, 0x25, 0x06, 0x06,
  0xca, 0xca, 0x8e, 0x8e, 0xca, 0xca, 0x06, 0x06, 0xda, 0xda, 0x9e, 0x9e, 0xda,
  0xda, 0x06, 0x07, 0xe9, 0xcb, 0xe9, 0x8f, 0xe9, 0xcb, 0xe9, 0x07, 0x19, 0x3b,
  0x19, 0x7f, 0x19, 0x3b, 0x19, 0xe7, 0x08, 0x08, 0x08, 0x08, 0x08, 0x08, 0x08,
  0x08, 0x18, 0x18, 0x18, 0x18, 0x18, 0x18, 0x18, 0x18, 0x08, 0x09, 0x2b, 0x09,
  0x6f, 0x09, 0x2b, 0x09, 0xd7, 0x39, 0x1b, 0x39, 0x5f, 0x39, 0x1b, 0x39, 0xd7,
  0x29, 0x0a, 0x0a, 0x4e, 0x4e, 0x0a, 0x0a, 0xd6, 0xd6, 0x1a, 0x1a, 0x5e, 0x5e,
  0x1a, 0x1a, 0xd6, 0xd6, 0x0a, 0x0b, 0x6d, 0x4f, 0x6d, 0x0b, 0x95, 0xb7, 0x95,
  0x7b, 0x1d, 0x3f, 0x1d, 0x7b, 0x95, 0xb7, 0x95, 0x6b, 0x0c, 0x0c, 0x0c, 0x0c,
  0x94, 0x94, 0x94, 0x94, 0x1c, 0x1c, 0x1c, 0x1c, 0x94, 0x94, 0x94, 0x94, 0x0c,
  0x0d, 0x2f, 0x0d, 0xd3, 0xb5, 0x97, 0xb5, 0xd3, 0x3d, 0x1f, 0x3d, 0xd3, 0xb5,
  0x97, 0xb5, 0xd3, 0x2d, 0x0e, 0x0e, 0xd2, 0xd2, 0x96, 0x96, 0xd2, 0xd2, 0x1e,
  0x1e, 0xd2, 0xd2, 0x96, 0x96, 0xd2, 0xd2, 0x0e, 0x0f, 0x00, 0x22, 0x00, 0x66,
  0x00, 0x22, 0x00, 0xee, 0x00, 0x22, 0x00, 0x66, 0x00, 0x22, 0x00, 0xfe,
];

const KGM_MASK_V2_PREDEF = [
  0xb8, 0xd5, 0x3d, 0xb2, 0xe9, 0xaf, 0x78, 0x8c, 0x83, 0x33, 0x71, 0x51, 0x76,
  0xa0, 0xcd, 0x37, 0x2f, 0x3e, 0x35, 0x8d, 0xa9, 0xbe, 0x98, 0xb7, 0xe7, 0x8c,
  0x22, 0xce, 0x5a, 0x61, 0xdf, 0x68, 0x69, 0x89, 0xfe, 0xa5, 0xb6, 0xde, 0xa9,
  0x77, 0xfc, 0xc8, 0xbd, 0xbd, 0xe5, 0x6d, 0x3e, 0x5a, 0x36, 0xef, 0x69, 0x4e,
  0xbe, 0xe1, 0xe9, 0x66, 0x1c, 0xf3, 0xd9, 0x02, 0xb6, 0xf2, 0x12, 0x9b, 0x44,
  0xd0, 0x6f, 0xb9, 0x35, 0x89, 0xb6, 0x46, 0x6d, 0x73, 0x82, 0x06, 0x69, 0xc1,
  0xed, 0xd7, 0x85, 0xc2, 0x30, 0xdf, 0xa2, 0x62, 0xbe, 0x79, 0x2d, 0x62, 0x62,
  0x3d, 0x0d, 0x7e, 0xbe, 0x48, 0x89, 0x23, 0x02, 0xa0, 0xe4, 0xd5, 0x75, 0x51,
  0x32, 0x02, 0x53, 0xfd, 0x16, 0x3a, 0x21, 0x3b, 0x16, 0x0f, 0xc3, 0xb2, 0xbb,
  0xb3, 0xe2, 0xba, 0x3a, 0x3d, 0x13, 0xec, 0xf6, 0x01, 0x45, 0x84, 0xa5, 0x70,
  0x0f, 0x93, 0x49, 0x0c, 0x64, 0xcd, 0x31, 0xd5, 0xcc, 0x4c, 0x07, 0x01, 0x9e,
  0x00, 0x1a, 0x23, 0x90, 0xbf, 0x88, 0x1e, 0x3b, 0xab, 0xa6, 0x3e, 0xc4, 0x73,
  0x47, 0x10, 0x7e, 0x3b, 0x5e, 0xbc, 0xe3, 0x00, 0x84, 0xff, 0x09, 0xd4, 0xe0,
  0x89, 0x0f, 0x5b, 0x58, 0x70, 0x4f, 0xfb, 0x65, 0xd8, 0x5c, 0x53, 0x1b, 0xd3,
  0xc8, 0xc6, 0xbf, 0xef, 0x98, 0xb0, 0x50, 0x4f, 0x0f, 0xea, 0xe5, 0x83, 0x58,
  0x8c, 0x28, 0x2c, 0x84, 0x67, 0xcd, 0xd0, 0x9e, 0x47, 0xdb, 0x27, 0x50, 0xca,
  0xf4, 0x63, 0x63, 0xe8, 0x97, 0x7f, 0x1b, 0x4b, 0x0c, 0xc2, 0xc1, 0x21, 0x4c,
  0xcc, 0x58, 0xf5, 0x94, 0x52, 0xa3, 0xf3, 0xd3, 0xe0, 0x68, 0xf4, 0x00, 0x23,
  0xf3, 0x5e, 0x0a, 0x7b, 0x93, 0xdd, 0xab, 0x12, 0xb2, 0x13, 0xe8, 0x84, 0xd7,
  0xa7, 0x9f, 0x0f, 0x32, 0x4c, 0x55, 0x1d, 0x04, 0x36, 0x52, 0xdc, 0x03, 0xf3,
  0xf9, 0x4e, 0x42, 0xe9, 0x3d, 0x61, 0xef, 0x7c, 0xb6, 0xb3, 0x93, 0x50,
];

function getKgmMask(pos) {
  let offset = pos >> 4;
  let value = 0;
  while (offset >= 0x11) {
    value ^= KGM_TABLE_1[offset % 272];
    offset >>= 4;
    value ^= KGM_TABLE_2[offset % 272];
    offset >>= 4;
  }
  return KGM_MASK_V2_PREDEF[pos % 272] ^ value;
}

function decryptKgmVprByte(byte, key17, pos, isVpr) {
  let med8 = (key17[pos % 17] ^ byte) & 0xff;
  med8 ^= ((med8 & 0x0f) << 4) & 0xff;

  let mask8 = getKgmMask(pos);
  mask8 ^= ((mask8 & 0x0f) << 4) & 0xff;

  let out = (med8 ^ mask8) & 0xff;
  if (isVpr) {
    out ^= VPR_MASK_DIFF[pos % 17];
  }
  return out & 0xff;
}

function decryptKGMVPR(filebuffer, filename) {
  const bytes = new Uint8Array(filebuffer);
  const isVpr = bytesHasPrefix(bytes, VPR_HEADER);
  const isKgm = bytesHasPrefix(bytes, KGM_HEADER);
  if (!isVpr && !isKgm) return null;

  if (bytes.length < 0x2c) {
    throw new Error("invalid kgm/vpr file");
  }

  const view = dataView(filebuffer);
  const headerLen = view.getUint32(0x10, true);
  if (headerLen <= 0 || headerLen >= bytes.length) {
    throw new Error("invalid kgm/vpr header length");
  }

  const key17 = new Uint8Array(17);
  key17.set(bytes.slice(0x1c, 0x2c), 0);
  key17[16] = 0;

  const audioData = bytes.slice(headerLen);
  for (let i = 0; i < audioData.length; i++) {
    audioData[i] = decryptKgmVprByte(audioData[i], key17, i, isVpr);
  }

  const format = normalizeFormat(sniffAudioExt(audioData, "mp3"));
  return {
    decoder: isVpr ? "vpr" : "kgm",
    audioData,
    format,
    meta: buildGenericMeta(filename, format),
  };
}

const TM_HEADER = [0x00, 0x00, 0x00, 0x20, 0x66, 0x74, 0x79, 0x70];
const TM_EXTENSIONS = new Set(["tm0", "tm2", "tm3", "tm6"]);
const MP4_MAJOR_BRANDS = new Set([
  "isom",
  "iso2",
  "mp41",
  "mp42",
  "M4A ",
  "M4B ",
  "M4P ",
  "M4V ",
  "qt  ",
  "3gp4",
  "3gp5",
  "dash",
  "f4v ",
  "MSNV",
]);

function parseUint32BE(data, offset) {
  return (
    (((data[offset] << 24) >>> 0) |
      (data[offset + 1] << 16) |
      (data[offset + 2] << 8) |
      data[offset + 3]) >>>
    0
  );
}

function decryptTM(filebuffer, filename) {
  const { ext } = splitFilename(filename);
  if (!TM_EXTENSIONS.has(ext)) return null;

  const audioData = new Uint8Array(filebuffer);
  if (audioData.length < 0x20) {
    throw new Error("invalid tm file");
  }

  for (let i = 0; i < 8; i++) audioData[i] = TM_HEADER[i];

  const firstBoxSize = parseUint32BE(audioData, 0);
  if (firstBoxSize < 0x10 || firstBoxSize > audioData.length) {
    throw new Error("invalid tm file: malformed ftyp box size");
  }

  const majorBrand = textDecoder.decode(audioData.slice(8, 12));
  if (!MP4_MAJOR_BRANDS.has(majorBrand)) {
    throw new Error("invalid tm file: unrecognized MP4 major brand");
  }

  const format = "mp4";
  return {
    decoder: "tm",
    audioData,
    format,
    meta: buildGenericMeta(filename, format),
  };
}

const XM_MAGIC_HEADER = [0x69, 0x66, 0x6d, 0x74];
const XM_MAGIC_HEADER_2 = [0xfe, 0xfe, 0xfe, 0xfe];

function decryptXM(filebuffer, filename) {
  const bytes = new Uint8Array(filebuffer);
  if (
    !bytesHasPrefix(bytes, XM_MAGIC_HEADER) ||
    !bytesHasPrefix(bytes.slice(8, 12), XM_MAGIC_HEADER_2)
  ) {
    return null;
  }

  const typeText = textDecoder.decode(bytes.slice(4, 8));
  const map = {
    " WAV": "wav",
    FLAC: "flac",
    " MP3": "mp3",
    " A4M": "m4a",
  };
  const fallbackExt = map[typeText];
  if (!fallbackExt) {
    throw new Error("unknown xm subtype");
  }

  const key = bytes[0x0f];
  const dataOffset = bytes[0x0c] | (bytes[0x0d] << 8) | (bytes[0x0e] << 16);
  const audioData = bytes.slice(0x10);

  for (let i = dataOffset; i < audioData.length; i++) {
    audioData[i] = (audioData[i] - key) ^ 0xff;
  }

  const format = normalizeFormat(sniffAudioExt(audioData, fallbackExt));
  return {
    decoder: "xm",
    audioData,
    format,
    meta: buildGenericMeta(filename, format),
  };
}

function decodeFile(filebuffer, filename) {
  const ncm = decryptNCM(filebuffer, filename);
  if (ncm) return ncm;

  const kgm = decryptKGMVPR(filebuffer, filename);
  if (kgm) return kgm;

  const kwm = decryptKWM(filebuffer, filename);
  if (kwm) return kwm;

  const tm = decryptTM(filebuffer, filename);
  if (tm) return tm;

  const xm = decryptXM(filebuffer, filename);
  if (xm) return xm;

  const qmc = decryptQMC(filebuffer, filename);
  if (qmc) return qmc;

  return null;
}

function resolveOutputFormat(decodedFormat, preference) {
  const format = normalizeFormat(decodedFormat);
  const pref = String(preference || "auto").toLowerCase();

  if (pref === "auto") return format;
  if (pref === "flac") {
    if (format !== "flac") {
      throw new Error(
        `当前文件解密后为 ${format.toUpperCase()}，无法强制输出 FLAC（浏览器端未集成音频转码器）`,
      );
    }
    return "flac";
  }
  if (pref === "mp4") {
    if (format !== "mp4") {
      throw new Error(
        `当前文件解密后为 ${format.toUpperCase()}，无法强制输出 MP4（浏览器端未集成音频转码器）`,
      );
    }
    return "mp4";
  }
  return format;
}

self.onmessage = (e) => {
  const envelope = e.data;
  const tasks = Array.isArray(envelope) ? envelope : envelope?.files;
  const outputPreference = Array.isArray(envelope)
    ? "auto"
    : String(envelope?.outputPreference || "auto").toLowerCase();

  if (!Array.isArray(tasks)) return;

  for (const data of tasks) {
    try {
      const reader = new FileReaderSync();
      const filebuffer = reader.readAsArrayBuffer(data.file);

      const result = decodeFile(filebuffer, data.file.name);
      if (!result) {
        self.postMessage({
          id: data.id,
          type: "error",
          data: "不支持此文件格式，当前支持：NCM / QMC / MFLAC / KWM / KGM / VPR / TM / XM",
        });
        continue;
      }

      const decodedFormat = normalizeFormat(
        result.format || sniffAudioExt(result.audioData, "mp3"),
      );
      const finalFormat = resolveOutputFormat(decodedFormat, outputPreference);
      const musicData = new Blob([result.audioData], {
        type: AUDIO_MIME_TYPE[finalFormat] || "application/octet-stream",
      });
      const musicUrl = URL.createObjectURL(musicData);

      const meta = {
        ...buildGenericMeta(data.file.name, finalFormat),
        ...result.meta,
        format: finalFormat,
      };

      self.postMessage({
        id: data.id,
        type: "data",
        payload: {
          meta,
          url: musicUrl,
          decoder: result.decoder,
        },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error("Worker Error:", err);
      self.postMessage({
        id: data.id,
        type: "error",
        data: message,
      });
    }
  }
};
