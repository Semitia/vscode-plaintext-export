const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const {
  hasBinaryExtension,
  isProbablyText,
  isConservativeTextCandidate
} = require('../fileDetection');

test('known binary extensions are excluded case-insensitively', () => {
  assert.equal(hasBinaryExtension('photo.PNG'), true);
  assert.equal(hasBinaryExtension('archive.zip'), true);
  assert.equal(hasBinaryExtension('document.rtf'), false);
  assert.equal(hasBinaryExtension('README'), false);
  assert.equal(hasBinaryExtension('custom.xyz'), false);
});

test('text probing accepts ordinary, extensionless, and UTF-16 text', () => {
  assert.equal(isProbablyText(Buffer.from('hello\nworld\n')), true);
  assert.equal(isProbablyText(Buffer.from([0xff, 0xfe, 0x68, 0x00, 0x69, 0x00])), true);
  assert.equal(isProbablyText(Buffer.from([0x68, 0x00, 0x69, 0x00])), true);
});

test('text probing rejects NUL-heavy and control-heavy content', () => {
  assert.equal(isProbablyText(Buffer.from([1, 2, 3, 4, 5, 6])), false);
  assert.equal(isProbablyText(Buffer.from([0x61, 0x62, 0, 0x63])), false);
});

test('conservative detection reads unknown and extensionless files', async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'plaintext-export-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));

  const extensionless = path.join(directory, 'BUILD');
  const unknownText = path.join(directory, 'notes.xyz');
  const knownBinary = path.join(directory, 'fake.pdf');
  await Promise.all([
    fs.writeFile(extensionless, 'compile target\n'),
    fs.writeFile(unknownText, 'plain text\n'),
    fs.writeFile(knownBinary, 'this content is text but the format is binary')
  ]);

  assert.equal(await isConservativeTextCandidate(extensionless), true);
  assert.equal(await isConservativeTextCandidate(unknownText), true);
  assert.equal(await isConservativeTextCandidate(knownBinary), false);
});
