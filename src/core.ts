import * as path from 'path';

export interface ToPythonModulePathOptions {
  workspacePackageName?: string;
  platform?: NodeJS.Platform;
}

export function normalizeSourceRoot(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) {
    return '';
  }

  // Normalize settings like "src/" or "\\src\\" into clean path segments.
  return path.normalize(trimmed).replace(/^([/\\])+|([/\\])+$/g, '');
}

export function extractSymbolNameFromLine(line: string): string | undefined {
  const patterns = [
    /^\s*async\s+def\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(/,
    /^\s*def\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(/,
    /^\s*class\s+([A-Za-z_][A-Za-z0-9_]*)\s*[\(:]/,
    /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*(?::[^=]+)?=/,
    /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*:\s*[^=]+$/,
  ];

  for (const pattern of patterns) {
    const match = line.match(pattern);
    if (match?.[1]) {
      return match[1];
    }
  }

  return undefined;
}

export function toPythonModulePath(
  filePath: string,
  workspaceRootPath: string,
  sourceRoot: string,
  options: ToPythonModulePathOptions = {},
): string | undefined {
  const relativePath = path.relative(workspaceRootPath, filePath);
  if (
    !relativePath ||
    relativePath.startsWith('..') ||
    path.isAbsolute(relativePath)
  ) {
    return undefined;
  }

  const relativeDir = path.dirname(relativePath);
  const baseName = path.basename(relativePath);
  const ext = path.extname(baseName).toLowerCase();
  const stem = ext ? baseName.slice(0, -ext.length) : baseName;

  const isPythonFile = ext === '.py' || ext === '.pyi';
  if (!isPythonFile) {
    return undefined;
  }

  const segments = splitPath(relativeDir);
  if (sourceRoot) {
    const sourceSegments = splitPath(sourceRoot);
    const caseSensitive = (options.platform ?? process.platform) !== 'win32';
    if (hasPrefix(segments, sourceSegments, caseSensitive)) {
      segments.splice(0, sourceSegments.length);
    }
  }

  if (stem === '__init__') {
    if (segments.length > 0) {
      return segments.join('.');
    }

    const workspacePackageName = options.workspacePackageName?.trim();
    if (workspacePackageName && isValidPythonIdentifier(workspacePackageName)) {
      return workspacePackageName;
    }
    return undefined;
  }

  segments.push(stem);
  return segments.length > 0 ? segments.join('.') : undefined;
}

export function splitPath(input: string): string[] {
  if (!input || input === '.') {
    return [];
  }

  return input.split(/[\\/]+/).filter(Boolean);
}

export function hasPrefix(
  input: readonly string[],
  prefix: readonly string[],
  caseSensitive = true,
): boolean {
  if (prefix.length === 0 || prefix.length > input.length) {
    return false;
  }

  for (let i = 0; i < prefix.length; i += 1) {
    const left = caseSensitive ? input[i] : input[i].toLowerCase();
    const right = caseSensitive ? prefix[i] : prefix[i].toLowerCase();
    if (left !== right) {
      return false;
    }
  }

  return true;
}

function isValidPythonIdentifier(name: string): boolean {
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(name);
}
