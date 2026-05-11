#!/usr/bin/env node
// 以根 package.json 的 version 为唯一来源，同步到所有子包。
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')

const rootPkg = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf-8'))
const version = rootPkg.version

const targets = ['frontend/package.json', 'backend/package.json', 'desktop/package.json', 'assistant/package.json', 'assistant/client/package.json']

for (const rel of targets) {
  const file = path.join(root, rel)
  let raw
  try {
    raw = readFileSync(file, 'utf-8')
  } catch {
    continue
  }
  const pkg = JSON.parse(raw)
  if (pkg.version === version) continue
  pkg.version = version
  writeFileSync(file, JSON.stringify(pkg, null, 2) + '\n')
  console.log(`synced ${rel} → ${version}`)
}
