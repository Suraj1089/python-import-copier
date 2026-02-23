import * as vscode from 'vscode';
import {
  extractSymbolNameFromLine,
  normalizeSourceRoot,
  toPythonModulePath,
} from './core';

type DefinitionResult = vscode.Location | vscode.LocationLink;
const COMMAND_ID = 'python-import-copier.copyPythonImport';

export function activate(context: vscode.ExtensionContext): void {
  const disposable = vscode.commands.registerCommand(
    COMMAND_ID,
    async () => {
      try {
        await copyPythonImport();
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Unknown error';
        void vscode.window.showErrorMessage(
          `Python Import Copier: Could not copy import. ${message}`,
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
    {
      workspacePackageName: pathBasename(workspaceFolder.uri.fsPath),
      platform: process.platform,
    },
  );

  if (!modulePath) {
    const rootInitPath = vscode.Uri.joinPath(workspaceFolder.uri, '__init__.py')
      .fsPath;
    if (definitionUri.fsPath === rootInitPath) {
      throw new Error(
        'Definition points to a workspace-root __init__.py. Rename the workspace folder to a valid Python package name or set a source root that maps to a package directory.',
      );
    }
    throw new Error('Could not determine a Python module path.');
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

function getConfiguredSourceRoot(): string {
  return normalizeSourceRoot(
    vscode.workspace
    .getConfiguration('python-import-copier')
      .get<string>('pythonSourceRoot', ''),
  );
}

function pathBasename(fsPath: string): string {
  const normalized = fsPath.replace(/[\\/]+$/, '');
  const segments = normalized.split(/[\\/]+/).filter(Boolean);
  return segments[segments.length - 1] ?? '';
}
