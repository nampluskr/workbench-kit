// Which files open in an editor tab (D-15, user request 2026-09-24): only
// ones whose content reads as text — text, data (csv) and code. A known
// binary extension is refused without reading anything; any other file is
// judged by its head (the host's probeTextFile). App layer, not core: this
// is exactly the file knowledge the shell must not carry (D-4).
import { extractExt } from '../providers/extension-filter';
import { probeTextFile } from '../providers/filesystem';

export const BINARY_EXTENSIONS: ReadonlySet<string> = new Set([
  // Executables and libraries
  'exe', 'dll', 'msi', 'sys', 'com', 'scr', 'bin', 'obj', 'o', 'a', 'lib', 'so', 'dylib', 'pdb',
  'class', 'jar', 'pyc', 'pyd', 'whl',
  // Archives and disk images
  'zip', '7z', 'rar', 'gz', 'tgz', 'bz2', 'xz', 'tar', 'iso', 'img', 'cab',
  // Images
  'png', 'jpg', 'jpeg', 'gif', 'bmp', 'ico', 'webp', 'tif', 'tiff', 'psd',
  // Audio and video
  'mp3', 'wav', 'flac', 'ogg', 'm4a', 'mp4', 'mkv', 'avi', 'mov', 'wmv', 'webm',
  // Office documents
  'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'hwp', 'hwpx', 'odt', 'ods',
  // Databases, arrays and models
  'db', 'sqlite', 'mdb', 'npy', 'npz', 'pt', 'pth', 'onnx', 'h5', 'pkl', 'parquet',
  // Fonts
  'ttf', 'otf', 'woff', 'woff2', 'eot',
]);

/** The text encoding a file opens with; CP949 opens read-only (D-15). */
export type TextEncodingId = 'utf-8' | 'cp949';

export type TextFileCheck = { ok: true; encoding: TextEncodingId } | { ok: false };

function baseName(path: string): string {
  return path.slice(Math.max(path.lastIndexOf('\\'), path.lastIndexOf('/')) + 1);
}

export async function checkTextFile(path: string): Promise<TextFileCheck> {
  if (BINARY_EXTENSIONS.has(extractExt(baseName(path)).toLowerCase())) return { ok: false };
  let probe: Awaited<ReturnType<typeof probeTextFile>>;
  try {
    probe = await probeTextFile(path);
  } catch {
    // The host could not read the head (gone, locked, or no probe wired):
    // open as before and let the tab report what went wrong.
    return { ok: true, encoding: 'utf-8' };
  }
  if (probe === 'binary') return { ok: false };
  return { ok: true, encoding: probe === 'cp949' ? 'cp949' : 'utf-8' };
}
