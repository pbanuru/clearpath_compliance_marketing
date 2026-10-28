#!/usr/bin/env node
// Enforces the per-file line limit for handwritten code, configured in file-lines.json.
//   node scripts/check-file-lines.mjs            every tracked or unignored file
//   node scripts/check-file-lines.mjs --staged   staged contents (pre-commit hook)
//   node scripts/check-file-lines.mjs --hook     one edited file named in an agent hook payload on stdin
//   node scripts/check-file-lines.mjs <paths>    the given files
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, isAbsolute, matchesGlob, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const config = JSON.parse(readFileSync(resolve(root, 'file-lines.json'), 'utf8'));
const exceptions = config.exceptions ?? {};
const args = process.argv.slice(2);
const mode = args[0] === '--staged' || args[0] === '--hook' ? args[0] : 'files';

function git(...gitArgs) {
  return execFileSync('git', gitArgs, { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
}

function inScope(path) {
  return (
    config.include.some((glob) => matchesGlob(path, glob)) &&
    !config.exclude.some((glob) => matchesGlob(path, glob))
  );
}

function countLines(text) {
  if (text.length === 0) return 0;
  const newlines = text.split('\n').length - 1;
  return text.endsWith('\n') ? newlines : newlines + 1;
}

function limitFor(path) {
  return exceptions[path]?.limit ?? config.limit;
}

function toRepoPath(path) {
  const relativePath = relative(root, isAbsolute(path) ? path : resolve(process.cwd(), path));
  return relativePath.startsWith('..') ? null : relativePath.split('\\').join('/');
}

async function readStdin() {
  let input = '';
  for await (const chunk of process.stdin) input += chunk;
  return input;
}

async function targets() {
  if (mode === '--staged') {
    const paths = git('diff', '--cached', '--name-only', '-z', '--diff-filter=ACMR').split('\0');
    return paths.filter(Boolean).map((path) => ({ path, read: () => git('show', `:${path}`) }));
  }
  let paths;
  if (mode === '--hook') {
    const filePath = JSON.parse(await readStdin()).tool_input?.file_path;
    paths = filePath ? [filePath] : [];
  } else if (args.length > 0) {
    paths = args;
  } else {
    paths = git('ls-files', '-z', '--cached', '--others', '--exclude-standard').split('\0');
  }
  return paths
    .map(toRepoPath)
    .filter((path) => path && existsSync(resolve(root, path)))
    .map((path) => ({ path, read: () => readFileSync(resolve(root, path), 'utf8') }));
}

const problems = [];
for (const { path, read } of await targets()) {
  if (!inScope(path)) continue;
  const lines = countLines(read());
  const limit = limitFor(path);
  if (lines > limit) problems.push(`${path}: ${lines} lines (limit ${limit})`);
}

if (mode === 'files' && args.length === 0) {
  for (const [path, { limit, reason }] of Object.entries(exceptions)) {
    if (!reason) problems.push(`file-lines.json: exception for ${path} needs a reason`);
    if (!limit || limit <= config.limit)
      problems.push(`file-lines.json: exception for ${path} needs a limit above ${config.limit}`);
    const fullPath = resolve(root, path);
    if (!existsSync(fullPath))
      problems.push(`file-lines.json: exception for missing file ${path}; remove it`);
    else if (countLines(readFileSync(fullPath, 'utf8')) <= config.limit) {
      problems.push(
        `file-lines.json: ${path} is within ${config.limit} lines again; remove its exception`,
      );
    }
  }
}

if (problems.length > 0) {
  console.error(
    `File line limit exceeded:\n${problems.map((problem) => `  ${problem}`).join('\n')}`,
  );
  console.error(
    'Split the file by responsibility (see AGENTS.md "File limits"). If it must stay whole,',
  );
  console.error('add an exception with a specific limit and a reason in file-lines.json.');
  process.exit(mode === '--hook' ? 2 : 1);
}
