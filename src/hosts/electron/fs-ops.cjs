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

module.exports = { createFile, createFolder, renamePath };
