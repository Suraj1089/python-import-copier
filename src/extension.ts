import * as path from 'path';
import * as vscode from 'vscode';

type DefinitionResult = vscode.Location | vscode.LocationLink;

export function activate(context: vscode.ExtensionContext): void {
  const disposable = vscode.commands.registerCommand(
    'python-import-copier.copyPythonImport',
    async () => {
      try {
        await copyPythonImport();
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Unknown error';
        void vscode.window.showErrorMessage(
          `Antigravity: Could not copy import. ${message}`,
        );
      }
    },
  );

  context.subscriptions.push(disposable);
}

export function deactivate(): void {
  // No resources to clean up.
}

async function copyPythonImport(): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    throw new Error('No active editor found.');
  }
  if (editor.document.languageId !== 'python') {
    throw new Error('Active editor is not a Python file.');
  }

  const position = editor.selection.active;
  const definition = await getBestDefinition(editor.document.uri, position);
  if (!definition) {
    throw new Error('Definition not found for the symbol under the cursor.');
  }

  const definitionUri = getDefinitionUri(definition);
  if (definitionUri.scheme !== 'file') {
    throw new Error('Definition is not in a local file.');
  }

  const workspaceFolder = vscode.workspace.getWorkspaceFolder(definitionUri);
  if (!workspaceFolder) {
    throw new Error('Definition file is outside the current workspace.');
  }

  const sourceRoot = getConfiguredSourceRoot();
  const modulePath = toPythonModulePath(
    definitionUri.fsPath,
    workspaceFolder.uri.fsPath,
    sourceRoot,
  );

  if (!modulePath) {
    throw new Error(
      'Could not determine a Python module path from the definition file.',
    );
  }

  const symbolName = await resolveSymbolName(definition, editor);
  if (!symbolName) {
    throw new Error('Could not determine the symbol name at definition.');
  }

  const importStatement = `from ${modulePath} import ${symbolName}`;
  await vscode.env.clipboard.writeText(importStatement);
  void vscode.window.showInformationMessage(
    `Copied Python import: ${importStatement}`,
  );
}

async function getBestDefinition(
  uri: vscode.Uri,
  position: vscode.Position,
): Promise<DefinitionResult | undefined> {
  const definitions = await vscode.commands.executeCommand<
    readonly (vscode.Location | vscode.LocationLink)[] | undefined
  >('vscode.executeDefinitionProvider', uri, position);

  if (!definitions || definitions.length === 0) {
    return undefined;
  }

  const inWorkspaceDefinition = definitions.find((definition) => {
    const uriForDefinition = getDefinitionUri(definition);
    return (
      uriForDefinition.scheme === 'file' &&
      !!vscode.workspace.getWorkspaceFolder(uriForDefinition)
    );
  });
  if (inWorkspaceDefinition) {
    return inWorkspaceDefinition;
  }

  return (
    definitions.find(
      (definition) => getDefinitionUri(definition).scheme === 'file',
    ) ?? definitions[0]
  );
}

function getDefinitionUri(definition: DefinitionResult): vscode.Uri {
  if ('targetUri' in definition) {
    return definition.targetUri;
  }
  return definition.uri;
}

function getDefinitionPosition(definition: DefinitionResult): vscode.Position {
  if ('targetUri' in definition) {
    return (definition.targetSelectionRange ?? definition.targetRange).start;
  }
  return definition.range.start;
}

async function resolveSymbolName(
  definition: DefinitionResult,
  sourceEditor: vscode.TextEditor,
): Promise<string | undefined> {
  const definitionUri = getDefinitionUri(definition);
  const definitionPosition = getDefinitionPosition(definition);

  const byDocumentSymbols = await getSymbolNameFromDocumentSymbols(
    definitionUri,
    definitionPosition,
  );
  if (byDocumentSymbols) {
    return byDocumentSymbols;
  }

  const document = await vscode.workspace.openTextDocument(definitionUri);
  const line = document.lineAt(definitionPosition.line).text;
  const byDefinitionLine = extractSymbolNameFromLine(line);
  if (byDefinitionLine) {
    return byDefinitionLine;
  }

  // Final fallback: use the current word in the source editor.
  const sourceWordRange = sourceEditor.document.getWordRangeAtPosition(
    sourceEditor.selection.active,
  );
  return sourceWordRange
    ? sourceEditor.document.getText(sourceWordRange)
    : undefined;
}

async function getSymbolNameFromDocumentSymbols(
  uri: vscode.Uri,
  position: vscode.Position,
): Promise<string | undefined> {
  const symbols = await vscode.commands.executeCommand<
    readonly (vscode.DocumentSymbol | vscode.SymbolInformation)[] | undefined
  >('vscode.executeDocumentSymbolProvider', uri);

  if (!symbols || symbols.length === 0) {
    return undefined;
  }

  const documentSymbols = symbols.filter(
    (symbol): symbol is vscode.DocumentSymbol =>
      'children' in symbol && 'range' in symbol,
  );
  if (documentSymbols.length > 0) {
    const match = findMostSpecificDocumentSymbol(documentSymbols, position);
    return match?.name;
  }

  const symbolInfos = symbols.filter(
    (symbol): symbol is vscode.SymbolInformation => 'location' in symbol,
  );
  if (symbolInfos.length > 0) {
    const matches = symbolInfos
      .filter((symbol) => symbol.location.range.contains(position))
      .sort(
        (a, b) => rangeSize(a.location.range) - rangeSize(b.location.range),
      );
    return matches[0]?.name;
  }

  return undefined;
}

function findMostSpecificDocumentSymbol(
  symbols: readonly vscode.DocumentSymbol[],
  position: vscode.Position,
): vscode.DocumentSymbol | undefined {
  let best: vscode.DocumentSymbol | undefined;

  for (const symbol of symbols) {
    if (!symbol.range.contains(position)) {
      continue;
    }

    const childMatch = findMostSpecificDocumentSymbol(
      symbol.children,
      position,
    );
    const candidate = childMatch ?? symbol;

    if (!best || rangeSize(candidate.range) < rangeSize(best.range)) {
      best = candidate;
    }
  }

  return best;
}

function rangeSize(range: vscode.Range): number {
  return (
    (range.end.line - range.start.line) * 10000 +
    (range.end.character - range.start.character)
  );
}

function extractSymbolNameFromLine(line: string): string | undefined {
  const patterns = [
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

function getConfiguredSourceRoot(): string {
  const raw = vscode.workspace
    .getConfiguration('python-import-copier')
    .get<string>('pythonSourceRoot', '')
    .trim();
  if (!raw) {
    return '';
  }

  // Normalize settings like "src/" or "\\src\\" into clean path segments.
  const normalized = path.normalize(raw).replace(/^([/\\])+|([/\\])+$/g, '');
  return normalized;
}

function toPythonModulePath(
  filePath: string,
  workspaceRootPath: string,
  sourceRoot: string,
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
  const ext = path.extname(baseName);
  const stem = ext ? baseName.slice(0, -ext.length) : baseName;

  const isPythonFile = ext === '.py' || ext === '.pyi';
  if (!isPythonFile) {
    return undefined;
  }

  const segments = splitPath(relativeDir);
  if (sourceRoot) {
    const sourceSegments = splitPath(sourceRoot);
    if (hasPrefix(segments, sourceSegments)) {
      segments.splice(0, sourceSegments.length);
    }
  }

  if (stem !== '__init__') {
    segments.push(stem);
  }

  return segments.length > 0 ? segments.join('.') : undefined;
}

function splitPath(input: string): string[] {
  if (!input || input === '.') {
    return [];
  }

  return input.split(/[\\/]+/).filter(Boolean);
}

function hasPrefix(
  input: readonly string[],
  prefix: readonly string[],
): boolean {
  if (prefix.length === 0 || prefix.length > input.length) {
    return false;
  }

  for (let i = 0; i < prefix.length; i += 1) {
    if (input[i] !== prefix[i]) {
      return false;
    }
  }

  return true;
}
