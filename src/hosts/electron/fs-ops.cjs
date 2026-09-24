// Explorer create / rename on disk (D-14, user request 2026-09-24). Kept out
// of main.cjs so the regression script runs this exact code rather than a
// copy. None of these overwrite: an existing target is an error the renderer
// shows, never a silent replace.
const fs = require('fs');
const path = require('path');

async function createFile(filePath) {
  // 'wx' fails with EEXIST instead of truncating an existing file.
  const handle = await fs.promises.open(filePath, 'wx');
  await handle.close();
  return true;
}

async function createFolder(dirPath) {
  // Not recursive: the parent must already exist, as in the tree.
  await fs.promises.mkdir(dirPath);
  return true;
}

async function renamePath(oldPath, newPath) {
  // fs.rename replaces an existing file on Windows, so check first — except
  // for a case-only rename (a.txt -> A.txt), where the "existing" target is
  // the same entry on a case-insensitive disk.
  const caseOnly = path.resolve(oldPath).toLowerCase() === path.resolve(newPath).toLowerCase();
  if (!caseOnly) {
    const exists = await fs.promises.access(newPath).then(() => true, () => false);
    if (exists) throw new Error(`'${path.basename(newPath)}' already exists`);
  }
  await fs.promises.rename(oldPath, newPath);
  return true;
}

// Text-or-binary check before a file opens in an editor tab (D-15). Reads
// only the head of the file: NUL bytes mean binary (UTF-16 too, the same
// rule the text reader applies); otherwise the head must decode as UTF-8 or,
// failing that, as CP949 (a Korean Excel CSV, say). `stream: true` lets a
// multi-byte character cut at the 64KB boundary through.
const PROBE_BYTES = 64 * 1024;

function decodes(bytes, encoding) {
  try {
    new TextDecoder(encoding, { fatal: true }).decode(bytes, { stream: true });
    return true;
  } catch {
    return false;
  }
}

async function probeTextFile(filePath) {
  const handle = await fs.promises.open(filePath, 'r');
  let head;
  try {
    const buffer = Buffer.alloc(PROBE_BYTES);
    const { bytesRead } = await handle.read(buffer, 0, PROBE_BYTES, 0);
    head = buffer.subarray(0, bytesRead);
  } finally {
    await handle.close();
  }
  if (head.includes(0)) return 'binary';
  const body = head[0] === 0xef && head[1] === 0xbb && head[2] === 0xbf ? head.subarray(3) : head;
  if (decodes(body, 'utf-8')) return 'utf-8';
  if (decodes(body, 'euc-kr')) return 'cp949';
  return 'binary';
}

/** The whole file decoded as CP949 — the fallback for a file that is not UTF-8. */
async function readLegacyTextFile(filePath) {
  const bytes = await fs.promises.readFile(filePath);
  if (bytes.includes(0)) throw new Error('Binary files cannot be opened as text');
  return new TextDecoder('euc-kr', { fatal: true }).decode(bytes);
}

module.exports = { createFile, createFolder, renamePath, probeTextFile, readLegacyTextFile };
