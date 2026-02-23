# Antigravity Python Import Helper

`antigravity` copies the correct absolute Python import for the symbol under your cursor.

## Features

- Resolves symbol definitions using VS Code's definition provider (`vscode.executeDefinitionProvider`)
- Converts definition file paths into Python module paths
- Handles `__init__.py` correctly
- Supports `src`-style layouts via `antigravity.pythonSourceRoot`
- Copies import text directly to your clipboard

Example output:

```python
from xyz.abc.tee import get_current_user
```

## Command

- Command ID: `antigravity.copyPythonImport`
- Default keybinding:
  - macOS: `Cmd+U`
  - Windows/Linux: `Ctrl+U`

## Configuration

### `antigravity.pythonSourceRoot`

Optional path segment to strip from module paths. Useful for src-layout projects.

```json
{
  "antigravity.pythonSourceRoot": "src"
}
```

Example:

- Definition file: `src/mypkg/utils.py`
- Generated module path: `mypkg.utils`

## How It Works

1. Reads the active editor and cursor position.
2. Resolves the symbol definition with VS Code's definition provider.
3. Locates the workspace folder for the definition file.
4. Converts definition file path to module path, including `__init__.py` handling.
5. Determines symbol name (DocumentSymbol provider first, then line parsing fallback).
6. Builds `from <module> import <symbol>`, copies it, and shows a success notification.

## Development

```bash
npm install
npm run compile
```

Press `F5` in VS Code to launch the Extension Development Host.
