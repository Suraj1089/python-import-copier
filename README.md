# Python Import Copier

> Copy the correct absolute Python import for any symbol — right from your editor.

[![Open VSX](https://img.shields.io/open-vsx/v/Suraj1089/python-import-copier?label=Open%20VSX&color=blueviolet)](https://open-vsx.org/extension/Suraj1089/python-import-copier)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

## ✨ Features

- 🔍 **Smart symbol resolution** — uses VS Code's built-in definition provider to find the correct source
- 📦 **Accurate module paths** — converts file paths into proper Python dotted module paths
- 🏗️ **`__init__.py` handling** — correctly resolves package imports
- 📁 **`src`-layout support** — strip custom source roots (e.g. `src/`) via configuration
- 📋 **One-click copy** — import statement goes straight to your clipboard

### Example

Place your cursor on `get_current_user` and trigger the command:

```
Copied: from myapp.auth.utils import get_current_user
```

## 🚀 Usage

### Command

| Command | ID | macOS | Windows / Linux |
|---|---|---|---|
| **Copy Python Import** | `python-import-copier.copyPythonImport` | `Cmd+U` | `Ctrl+U` |

1. Open any Python file
2. Place your cursor on a symbol (function, class, variable, etc.)
3. Press **`Cmd+U`** (macOS) or **`Ctrl+U`** (Windows/Linux)
4. The import statement is copied to your clipboard ✅

## ⚙️ Configuration

### `python-import-copier.pythonSourceRoot`

If your project uses a `src`-layout, set this to strip the source directory prefix from generated module paths.

**Settings JSON:**

```json
{
  "python-import-copier.pythonSourceRoot": "src"
}
```

**Example:**

| Definition file | Without source root | With `"src"` |
|---|---|---|
| `src/mypkg/utils.py` | `src.mypkg.utils` | `mypkg.utils` |

## 🔧 How It Works

1. Reads the active editor and cursor position
2. Resolves the symbol definition via `vscode.executeDefinitionProvider`
3. Locates the workspace folder containing the definition file
4. Converts the file path to a Python module path (handles `__init__.py` automatically)
5. Determines the symbol name using document symbols, then falls back to line parsing
6. Builds `from <module> import <symbol>`, copies it to the clipboard, and shows a notification

## 🛠️ Development

```bash
# Install dependencies
npm install

# Compile TypeScript
npm run compile

# Watch for changes
npm run watch
```

Press **`F5`** in VS Code to launch the Extension Development Host for testing.

### Publishing

This project uses [GitHub Actions](.github/workflows/publish.yml) to automatically publish to [Open VSX](https://open-vsx.org/) on every push to `main`.

To publish manually:

```bash
npx @vscode/vsce package
npx ovsx publish *.vsix -p <your-token>
```

## 📄 License

[MIT](LICENSE)
