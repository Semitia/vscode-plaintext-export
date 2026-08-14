const fs = require('fs/promises');
const path = require('path');

const SAMPLE_SIZE = 64 * 1024;

// Formats whose contents are unambiguously binary. Everything else is probed
// in conservative mode so uncommon text formats and extensionless files are
// not silently missed.
const BINARY_EXTENSIONS = new Set([
  '.7z', '.a', '.apk', '.app', '.arj', '.bin', '.bz2', '.cab', '.class',
  '.dll', '.dmg', '.dmp', '.ear', '.exe', '.gz', '.img', '.iso', '.jar',
  '.lib', '.msi', '.o', '.obj', '.pdb', '.rar', '.so', '.suo', '.tar',
  '.war', '.wasm', '.xz', '.zip', '.zst',

  '.bmp', '.cur', '.dds', '.gif', '.heic', '.heif', '.ico', '.jfif',
  '.jpeg', '.jpg', '.png', '.psd', '.tga', '.tif', '.tiff', '.webp',

  '.aac', '.avi', '.flac', '.m4a', '.m4v', '.mkv', '.mov', '.mp3', '.mp4',
  '.mpeg', '.mpg', '.ogg', '.ogv', '.opus', '.wav', '.webm', '.wmv',

  '.eot', '.otf', '.ttc', '.ttf', '.woff', '.woff2',

  '.accdb', '.db', '.dbf', '.mdb', '.sqlite', '.sqlite3',
  '.doc', '.docm', '.docx', '.dot', '.dotm', '.dotx', '.odp', '.ods',
  '.odt', '.pdf', '.ppt', '.pptm', '.pptx', '.xls', '.xlsb',
  '.xlsm', '.xlsx'
]);

function hasBinaryExtension(name) {
  return BINARY_EXTENSIONS.has(path.extname(name).toLowerCase());
}

function hasUtf16Pattern(bytes) {
  if (bytes.length < 4) {
    return false;
  }

  const pairs = Math.floor(Math.min(bytes.length, 512) / 2);
  let zeroEven = 0;
  let zeroOdd = 0;

  for (let index = 0; index < pairs * 2; index += 2) {
    if (bytes[index] === 0) zeroEven += 1;
    if (bytes[index + 1] === 0) zeroOdd += 1;
  }

  return (zeroEven / pairs > 0.6 && zeroOdd / pairs < 0.1) ||
    (zeroOdd / pairs > 0.6 && zeroEven / pairs < 0.1);
}

function isProbablyText(bytes) {
  if (bytes.length === 0) {
    return true;
  }

  const hasUtf8Bom = bytes.length >= 3 &&
    bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf;
  const hasUtf16Bom = bytes.length >= 2 &&
    ((bytes[0] === 0xff && bytes[1] === 0xfe) ||
      (bytes[0] === 0xfe && bytes[1] === 0xff));
  if (hasUtf8Bom || hasUtf16Bom || hasUtf16Pattern(bytes)) {
    return true;
  }

  let controls = 0;
  for (const byte of bytes) {
    if (byte === 0) {
      return false;
    }
    if (byte < 32 && byte !== 9 && byte !== 10 && byte !== 12 && byte !== 13) {
      controls += 1;
    }
  }

  // This intentionally accepts non-UTF-8 legacy encodings. In conservative
  // mode, avoiding false negatives is more important than rejecting every
  // file with an unknown binary format.
  return controls / bytes.length <= 0.02;
}

async function readSample(filePath) {
  const handle = await fs.open(filePath, 'r');
  try {
    const { size } = await handle.stat();
    if (size <= SAMPLE_SIZE) {
      const bytes = Buffer.alloc(size);
      let offset = 0;
      while (offset < size) {
        const { bytesRead } = await handle.read(bytes, offset, size - offset, offset);
        if (bytesRead === 0) break;
        offset += bytesRead;
      }
      return bytes;
    }

    const half = SAMPLE_SIZE / 2;
    const bytes = Buffer.alloc(SAMPLE_SIZE);
    await handle.read(bytes, 0, half, 0);
    await handle.read(bytes, half, half, size - half);
    return bytes;
  } finally {
    await handle.close();
  }
}

async function isConservativeTextCandidate(filePath) {
  if (hasBinaryExtension(filePath)) {
    return false;
  }
  return isProbablyText(await readSample(filePath));
}

module.exports = {
  BINARY_EXTENSIONS,
  hasBinaryExtension,
  isProbablyText,
  isConservativeTextCandidate
};
