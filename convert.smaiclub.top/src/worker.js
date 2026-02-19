import CryptoJS from 'crypto-js';

const CORE_KEY = CryptoJS.enc.Hex.parse("687a4852416d736f356b496e62617857");
const META_KEY = CryptoJS.enc.Hex.parse("2331346C6A6B5F215C5D2630553C2728");

const audio_mime_type = {
  mp3: "audio/mpeg",
  flac: "audio/flac",
  m4a: "audio/mp4",
  ogg: "audio/ogg"
};

const defaultAlbumPic = "https://p4.music.126.net/nSsje95JU5hVylFPzLqWHw==/109951163542280093.jpg";

/**
 * Decrypt NCM file
 * @param {ArrayBuffer} filebuffer 
 * @param {string} filename
 */
function decryptNCM(filebuffer, filename) {
  const dataview = new DataView(filebuffer);

  if (dataview.getUint32(0, true) !== 0x4e455443 || dataview.getUint32(4, true) !== 0x4d414446) {
    return null;
  }

  let offset = 10;

  // 1. Key Data
  const keyLen = dataview.getUint32(offset, true);
  offset += 4;
  const keyCipher = new Uint8Array(filebuffer, offset, keyLen).map(uint8 => uint8 ^ 0x64);
  offset += keyLen;

  const keyPlain = CryptoJS.AES.decrypt(
    { ciphertext: CryptoJS.lib.WordArray.create(keyCipher) },
    CORE_KEY,
    { mode: CryptoJS.mode.ECB, padding: CryptoJS.pad.Pkcs7 }
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

  // 2. Key Box Generation
  const keyBox = new Uint8Array(Array(256).keys());
  const keyDataLen = keyData.length;
  let j = 0;
  for (let i = 0; i < 256; i++) {
    j = (keyBox[i] + j + keyData[i % keyDataLen]) & 0xff;
    [keyBox[i], keyBox[j]] = [keyBox[j], keyBox[i]];
  }
  // RC4-like PRGA setup
  const box = keyBox.map((_, i, arr) => {
    i = (i + 1) & 0xff;
    const si = arr[i];
    const sj = arr[(i + si) & 0xff];
    return arr[(si + sj) & 0xff];
  });

  // 3. Metadata
  const metaLen = dataview.getUint32(offset, true);
  offset += 4;
  let musicMeta = { album: "Unknown", albumPic: defaultAlbumPic, format: "mp3" }; // Default

  if (metaLen > 0) {
    const metaCipher = new Uint8Array(filebuffer, offset, metaLen).map(data => data ^ 0x63);
    offset += metaLen;

    // Remove "163 key(Don't modify):" prefix (22 bytes)
    const metaBase64 = CryptoJS.lib.WordArray.create(metaCipher.slice(22)).toString(CryptoJS.enc.Utf8);
    const metaPlain = CryptoJS.AES.decrypt(
      { ciphertext: CryptoJS.enc.Base64.parse(metaBase64) },
      META_KEY,
      { mode: CryptoJS.mode.ECB, padding: CryptoJS.pad.Pkcs7 }
    );

    try {
      const metaJson = JSON.parse(metaPlain.toString(CryptoJS.enc.Utf8).slice(6)); // Skip "music:"
      musicMeta = metaJson;
      if (musicMeta.albumPic) musicMeta.albumPic = musicMeta.albumPic.replace("http:", "https:");
    } catch (e) {
      console.warn("Metadata parse failed", e);
    }
  } else {
    offset += metaLen; // 0
  }

  // 4. CRC & Gap
  offset += dataview.getUint32(offset + 5, true) + 13;

  // 5. Audio Data
  const audioData = new Uint8Array(filebuffer, offset);
  const audioDataLen = audioData.length;

  for (let cur = 0; cur < audioDataLen; ++cur) {
    audioData[cur] ^= box[cur & 0xff];
  }

  return {
    audioData,
    format: musicMeta.format || "mp3",
    meta: musicMeta
  };
}

/**
 * Placeholder for QMC Decryption
 * Ideally needs the static seed matrix (128 bytes or similar)
 */
function decryptQMC(filebuffer, filename) {
  // Check filename extension or magic bytes
  if (!filename.match(/\.(qmc|mflac|mgg)/i)) return null;

  // This is where QMC logic would go.
  // Since we don't have the proprietary seed matrix legally available for this snippet,
  // we return specific error to let user know.

  // For educational purpose, logic is usually:
  // x = i % 0x7fff;
  // key = seedMap[ (x*x + 80923) % len ]
  // data[i] ^= key

  throw new Error("QMC Format detected but decoder is missing. Please use the full Unlock Music app or provide the seed matrix.");
}

self.onmessage = e => {
  for (const data of e.data) {
    try {
      const reader = new FileReaderSync();
      const filebuffer = reader.readAsArrayBuffer(data.file);

      let result = null;
      let usedDecoder = "";

      // Try NCM
      result = decryptNCM(filebuffer, data.file.name);
      if (result) usedDecoder = "NCM";

      // Try QMC (Placeholder check)
      if (!result) {
        try {
          decryptQMC(filebuffer, data.file.name);
        } catch (err) {
          if (err.message.includes("QMC")) {
            self.postMessage({ id: data.id, type: "error", data: "QMC decoding not yet implemented in this lite version." });
            continue;
          }
        }
      }

      if (!result) {
        self.postMessage({ id: data.id, type: "error", data: "Unknown or unsupported file format." });
        continue;
      }

      // Format detection if missing
      if (!result.format && result.audioData) {
        const [f, L, a, C] = result.audioData;
        if (f === 0x66 && L === 0x4c && a === 0x61 && C === 0x43) {
          result.format = "flac";
        } else if (result.audioData[0] === 0x49 && result.audioData[1] === 0x44 && result.audioData[2] === 0x33) {
          result.format = "mp3";
        } else {
          result.format = "mp3"; // Fallback
        }
      }

      const musicData = new Blob([result.audioData], {
        type: audio_mime_type[result.format] || "application/octet-stream"
      });

      const musicUrl = URL.createObjectURL(musicData);

      self.postMessage({
        id: data.id,
        type: "data",
        payload: {
          meta: result.meta,
          url: musicUrl
        }
      });

    } catch (err) {
      console.error("Worker Error:", err);
      self.postMessage({ id: data.id, type: "error", data: err.message });
    }
  }
};