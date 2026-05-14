#!/usr/bin/env node
// 以根 package.json 的 version 为唯一来源，同步到所有子包。
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')

const rootPkg = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf-8'))
const version = rootPkg.version

const targets = ['frontend/package.json', 'backend/package.json', 'desktop/package.json', 'assistant/package.json', 'assistant/client/package.json']

function writeJsonIfChanged(file, pkg, raw) {
  const next = JSON.stringify(pkg, null, 2) + '\n'
  if (next === raw) return false
  writeFileSync(file, next)
  return true
}

function syncPackageJson(rel) {
  const file = path.join(root, rel)
  let raw
  try {
    raw = readFileSync(file, 'utf-8')
  } catch {
    return
  }
  const pkg = JSON.parse(raw)
  if (pkg.version === version) return
  pkg.version = version
  if (writeJsonIfChanged(file, pkg, raw)) {
    console.log(`synced ${rel} -> ${version}`)
  }
}

function syncPackageLock(rel, packageEntries = []) {
  const file = path.join(root, rel)
  if (!existsSync(file)) return

  const raw = readFileSync(file, 'utf-8')
  const lock = JSON.parse(raw)
  let changed = false

  if (lock.version && lock.version !== version) {
    lock.version = version
    changed = true
  }

  if (lock.packages?.['']?.version && lock.packages[''].version !== version) {
    lock.packages[''].version = version
    changed = true
  }

  for (const entry of packageEntries) {
    if (lock.packages?.[entry]?.version && lock.packages[entry].version !== version) {
      lock.packages[entry].version = version
      changed = true
    }
  }

  if (changed && writeJsonIfChanged(file, lock, raw)) {
    console.log(`synced ${rel} -> ${version}`)
  }
}

for (const rel of targets) {
  syncPackageJson(rel)
}

syncPackageLock('package-lock.json', ['frontend', 'assistant/client'])

for (const rel of targets.map((rel) => rel.replace(/package\.json$/, 'package-lock.json'))) {
  syncPackageLock(rel)
}
