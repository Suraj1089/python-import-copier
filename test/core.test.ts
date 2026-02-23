import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';

import {
  extractSymbolNameFromLine,
  hasPrefix,
  normalizeSourceRoot,
  splitPath,
  toPythonModulePath,
} from '../src/core';

const WORKSPACE = path.resolve('/tmp', 'workspace');

function inWorkspace(...parts: string[]): string {
  return path.join(WORKSPACE, ...parts);
}

test('normalizeSourceRoot trims and normalizes separators', () => {
  assert.equal(normalizeSourceRoot(' src/ '), 'src');
  assert.equal(normalizeSourceRoot('\\src\\pkg\\'), path.normalize('src\\pkg'));
  assert.equal(normalizeSourceRoot('   '), '');
});

test('splitPath handles slash and backslash paths', () => {
  assert.deepEqual(splitPath('a/b/c'), ['a', 'b', 'c']);
  assert.deepEqual(splitPath('a\\b\\c'), ['a', 'b', 'c']);
  assert.deepEqual(splitPath('.'), []);
});

test('hasPrefix supports case-sensitive and case-insensitive checks', () => {
  assert.equal(hasPrefix(['src', 'pkg'], ['src']), true);
  assert.equal(hasPrefix(['src', 'pkg'], ['Src']), false);
  assert.equal(hasPrefix(['src', 'pkg'], ['Src'], false), true);
});

test('toPythonModulePath builds module for regular file', () => {
  const modulePath = toPythonModulePath(
    inWorkspace('xyz', 'abc', 'tee.py'),
    WORKSPACE,
    '',
  );
  assert.equal(modulePath, 'xyz.abc.tee');
});

test('toPythonModulePath strips source root and handles win32 case-insensitive matching', () => {
  const modulePath = toPythonModulePath(
    inWorkspace('src', 'mypkg', 'utils.py'),
    WORKSPACE,
    'Src',
    { platform: 'win32' },
  );
  assert.equal(modulePath, 'mypkg.utils');
});

test('toPythonModulePath handles package __init__.py', () => {
  const modulePath = toPythonModulePath(
    inWorkspace('mypkg', '__init__.py'),
    WORKSPACE,
    '',
  );
  assert.equal(modulePath, 'mypkg');
});

test('toPythonModulePath handles workspace root __init__.py via workspace package name', () => {
  const modulePath = toPythonModulePath(
    inWorkspace('__init__.py'),
    WORKSPACE,
    '',
    { workspacePackageName: 'workspace' },
  );
  assert.equal(modulePath, 'workspace');
});

test('toPythonModulePath rejects invalid workspace package name for root __init__.py', () => {
  const modulePath = toPythonModulePath(
    inWorkspace('__init__.py'),
    WORKSPACE,
    '',
    { workspacePackageName: 'my-workspace' },
  );
  assert.equal(modulePath, undefined);
});

test('toPythonModulePath supports .pyi and rejects non-python files', () => {
  assert.equal(
    toPythonModulePath(inWorkspace('pkg', 'types.pyi'), WORKSPACE, ''),
    'pkg.types',
  );
  assert.equal(
    toPythonModulePath(inWorkspace('pkg', 'notes.txt'), WORKSPACE, ''),
    undefined,
  );
});

test('toPythonModulePath returns undefined for files outside workspace', () => {
  const outsideFile = path.resolve('/tmp', 'elsewhere', 'a.py');
  assert.equal(toPythonModulePath(outsideFile, WORKSPACE, ''), undefined);
});

test('extractSymbolNameFromLine handles async def, class, and variables', () => {
  assert.equal(
    extractSymbolNameFromLine('async def get_current_user(request):'),
    'get_current_user',
  );
  assert.equal(extractSymbolNameFromLine('class UserService(BaseService):'), 'UserService');
  assert.equal(extractSymbolNameFromLine('RESULT: int = 5'), 'RESULT');
  assert.equal(extractSymbolNameFromLine('unknown syntax'), undefined);
});
