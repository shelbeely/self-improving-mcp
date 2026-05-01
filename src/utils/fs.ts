import { readdir, stat, readFile } from "node:fs/promises";
import { join, relative, extname, normalize } from "node:path";

/** Absolute path to the repository root. */
export const REPO_ROOT = new URL("../../", import.meta.url).pathname.replace(
  /\/$/,
  ""
);

/** Maximum file size in bytes that read_file will return. */
export const MAX_FILE_BYTES = 128 * 1024; // 128 KB

/** Extensions treated as text files for analysis. */
export const TEXT_EXTENSIONS = new Set([
  ".ts", ".js", ".mts", ".mjs", ".json", ".md", ".yml", ".yaml",
  ".toml", ".txt", ".sh", ".env.example", ".gitignore",
]);

/** Directories to skip during traversal. */
const SKIP_DIRS = new Set(["node_modules", ".git", "dist", ".cache"]);

export interface FileEntry {
  path: string; // relative to repo root
  size: number;
  ext: string;
}

/**
 * Recursively lists all files under `dir` (absolute), returning entries
 * relative to `REPO_ROOT`. Skips known large / binary directories.
 */
export async function listFilesRecursive(
  dir: string = REPO_ROOT,
  maxDepth = 8,
  _depth = 0
): Promise<FileEntry[]> {
  if (_depth > maxDepth) return [];
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  const results: FileEntry[] = [];

  for (const entry of entries) {
    if (entry.name.startsWith(".") && _depth === 0 && entry.isDirectory()) {
      // Allow top-level dotdirs like .github but skip .git
      if (SKIP_DIRS.has(entry.name)) continue;
    } else if (entry.isDirectory() && SKIP_DIRS.has(entry.name)) {
      continue;
    }

    const abs = join(dir, entry.name);
    if (entry.isDirectory()) {
      const children = await listFilesRecursive(abs, maxDepth, _depth + 1);
      results.push(...children);
    } else if (entry.isFile()) {
      const s = await stat(abs);
      results.push({
        path: relative(REPO_ROOT, abs),
        size: s.size,
        ext: extname(entry.name).toLowerCase(),
      });
    }
  }

  return results;
}

/**
 * Safely reads a file within the repo. Returns null if the path would
 * escape the repo root, the file is too large, or is binary.
 */
export async function safeReadFile(
  relPath: string
): Promise<{ content: string } | { error: string }> {
  // Normalize and prevent path traversal
  const normalized = normalize(relPath).replace(/^(\.\.\/|\/)+/, "");
  const abs = join(REPO_ROOT, normalized);
  if (!abs.startsWith(REPO_ROOT + "/") && abs !== REPO_ROOT) {
    return { error: "Path escapes repository root." };
  }

  // Reject non-text extensions before hitting the filesystem
  const ext = extname(normalized).toLowerCase();
  if (!TEXT_EXTENSIONS.has(ext) && ext !== "") {
    return {
      error: `File type "${ext}" is not a recognised text type. Use list_files to browse binary files.`,
    };
  }

  let s;
  try {
    s = await stat(abs);
  } catch {
    return { error: `File not found: ${normalized}` };
  }

  if (!s.isFile()) return { error: `Not a file: ${normalized}` };
  if (s.size > MAX_FILE_BYTES) {
    return {
      error: `File too large (${s.size} bytes). Maximum is ${MAX_FILE_BYTES} bytes.`,
    };
  }

  const content = await readFile(abs, "utf-8");
  return { content };
}
