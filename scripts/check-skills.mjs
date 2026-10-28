#!/usr/bin/env node
// Checks the things that break agent skills (rules: .agents/skills/52-skill-authoring):
// name and description frontmatter, the 300-line limit, and no nested SKILL.md.
//   node scripts/check-skills.mjs          every skill in this repo's .agents/skills
//   node scripts/check-skills.mjs --hook   the skill holding the file named in an agent hook payload
//   node scripts/check-skills.mjs <dirs>   the given skill directories
// Skills vendored by a tool and pinned in skills-lock.json are skipped.
import { existsSync, readFileSync, readdirSync, realpathSync, statSync } from 'node:fs';
import { basename, dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const LINE_LIMIT = 300; // Same as code; see 52-skill-authoring for why.
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const hookMode = process.argv[2] === '--hook';

function frontmatterField(lines, key) {
  const line = lines.find((candidate) => candidate.startsWith(`${key}:`));
  if (line === undefined) return null;
  const raw = line.slice(key.length + 1).trim();
  const quoted = /^(["']).*\1$/.test(raw);
  return { value: quoted ? raw.slice(1, -1) : raw, quoted };
}

function listFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return listFiles(path);
    return entry.isFile() ? [path] : [];
  });
}

function checkSkill(skillDir) {
  const name = basename(skillDir);
  const skillMd = join(skillDir, 'SKILL.md');
  if (!existsSync(skillMd)) return [`${name}: missing SKILL.md`];
  const problems = [];
  const lines = readFileSync(skillMd, 'utf8').split('\n');
  const end = lines.indexOf('---', 1);
  if (lines[0] !== '---' || end === -1) problems.push('SKILL.md must open with "---" frontmatter');
  const frontmatter = lines.slice(1, end === -1 ? 1 : end);
  const skillName = frontmatterField(frontmatter, 'name')?.value;
  if (skillName !== name) problems.push(`name "${skillName ?? ''}" must equal the folder name`);
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(name) || name.length > 64) {
    problems.push('folder name must be 1-64 characters of a-z, 0-9, and single hyphens');
  }
  const description = frontmatterField(frontmatter, 'description');
  if (!description?.value) problems.push('description is required, on one line');
  else if (description.value.length > 1024) problems.push('description is over 1024 characters');
  else if (!description.quoted && / #|: /.test(description.value)) {
    problems.push('quote the description: an unquoted " #" cuts it short and ": " is invalid YAML');
  }
  for (const file of listFiles(skillDir)) {
    const rel = relative(skillDir, file).split(sep).join('/');
    if (rel !== 'SKILL.md' && basename(file) === 'SKILL.md') {
      problems.push(`${rel}: a nested SKILL.md registers as a separate skill in Codex`);
    }
    const buffer = readFileSync(file);
    if (buffer.subarray(0, 8192).includes(0)) continue; // binary
    const count = buffer.toString('utf8').trimEnd().split('\n').length;
    if (count > LINE_LIMIT) problems.push(`${rel}: ${count} lines (limit ${LINE_LIMIT})`);
  }
  return problems.map((problem) => `${name}: ${problem}`);
}

function skillDirFromPath(path) {
  const parts = realpathSync(path).split(sep);
  const index = parts.findLastIndex((part, i) => part === 'skills' && parts[i - 1] === '.agents');
  return index > 0 && index + 2 < parts.length ? parts.slice(0, index + 2).join(sep) : null;
}

async function targets() {
  if (hookMode) {
    let input = '';
    for await (const chunk of process.stdin) input += chunk;
    const filePath = JSON.parse(input).tool_input?.file_path;
    const skillDir = filePath && existsSync(filePath) ? skillDirFromPath(filePath) : null;
    return skillDir ? [skillDir] : [];
  }
  if (process.argv.length > 2) return process.argv.slice(2).map((arg) => realpathSync(arg));
  const skillsDir = join(repoRoot, '.agents', 'skills');
  if (!existsSync(skillsDir)) return [];
  return readdirSync(skillsDir)
    .map((entry) => join(skillsDir, entry))
    .filter((path) => statSync(path).isDirectory());
}

const problems = [];
for (const skillDir of await targets()) {
  const lock = join(skillDir, '..', '..', '..', 'skills-lock.json');
  const vendored =
    existsSync(lock) && JSON.parse(readFileSync(lock, 'utf8')).skills?.[basename(skillDir)];
  if (!vendored) problems.push(...checkSkill(skillDir));
}
if (problems.length > 0) {
  console.error(`Skill check failed:\n${problems.map((problem) => `  ${problem}`).join('\n')}`);
  process.exit(hookMode ? 2 : 1);
}
