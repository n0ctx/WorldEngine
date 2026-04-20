import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROMPTS_DIR = path.resolve(__dirname, 'templates');
const cache = new Map();

export function loadBackendPrompt(name) {
  if (!cache.has(name)) {
    cache.set(name, readFileSync(path.resolve(PROMPTS_DIR, name), 'utf-8').trim());
  }
  return cache.get(name);
}

export function renderBackendPrompt(name, variables = {}) {
  let content = loadBackendPrompt(name);
  for (const [key, value] of Object.entries(variables)) {
    const safeValue = value == null ? '' : String(value);
    content = content.replaceAll(`{{${key}}}`, safeValue);
  }
  return content;
}
