import { execFileSync } from 'node:child_process';
import { readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const repoRoot = process.cwd();
const assistantRoot = path.join(repoRoot, 'assistant');
const clientRoot = path.join(assistantRoot, 'client');

function collectJsFiles(dir, files = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules') continue;
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      collectJsFiles(fullPath, files);
      continue;
    }
    if (entry.isFile() && fullPath.endsWith('.js')) {
      files.push(fullPath);
    }
  }
  return files;
}

function run(command, args, cwd) {
  execFileSync(command, args, {
    cwd,
    stdio: 'inherit',
  });
}

if (!statSync(assistantRoot).isDirectory()) {
  console.error('assistant 目录不存在');
  process.exit(1);
}

run('npm', ['run', 'lint', '--prefix', 'assistant/client'], repoRoot);

for (const file of collectJsFiles(assistantRoot)) {
  if (file.startsWith(clientRoot)) continue;
  run(process.execPath, ['--check', file], repoRoot);
}
