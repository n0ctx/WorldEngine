#!/usr/bin/env node
/**
 * WorldEngine CLI - unified startup for WSL and Windows
 * Usage: worldengine start [options]
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// Detect project root (parent of bin/)
const PROJECT_ROOT = path.resolve(__dirname, '..');

function run(cmd) {
  try {
    const output = execSync(cmd, { cwd: PROJECT_ROOT, stdio: 'inherit', env: process.env });
    return output;
  } catch (e) {
    console.error(`Failed to run: ${cmd}`);
    process.exit(1);
  }
}

function isWindows() {
  return process.platform === 'win32';
}

function detectEnvironment() {
  if (isWindows()) return 'windows';
  try {
    const version = fs.readFileSync('/proc/version', 'utf8');
    if (/WSL|Windows/i.test(version)) return 'wsl';
  } catch {}
  return 'posix';
}

function checkDependencies() {
  console.log('Checking dependencies...');
  
  // Install frontend deps if needed
  if (!fs.existsSync(path.join(PROJECT_ROOT, 'node_modules'))) {
    run('npm install');
  } else {
    // Check package.json vs package-lock sync
    try {
      const result = execSync('npm outdated', { cwd: PROJECT_ROOT, stdio: 'pipe' });
      if (result.length > 0) {
        console.log('Some packages may be outdated. Run "worldengine update" to update.');
      }
    } catch {}
  }

  // Install backend deps if needed
  const backendPath = path.join(PROJECT_ROOT, 'backend');
  if (!fs.existsSync(path.join(backendPath, 'node_modules'))) {
    run('npm install --prefix backend');
  }
}

function startServer(envType) {
  console.log(`Starting WorldEngine dev server (${envType})...`);
  
  // Set environment variables for cross-platform access
  process.env.HOST = process.env.HOST || '0.0.0.0';
  
  // Use WE_OPEN_BROWSER=1 plugin to open browser once backend is ready
  process.env.WE_OPEN_BROWSER = '1';
  
  // Start the actual dev server (existing npm run dev handles concurrent starts)
  run('npm run dev');
}

function showUsage() {
  console.log('WorldEngine CLI - unified startup for WSL and Windows');
  console.log('');
  console.log('Usage: worldengine <command> [options]');
  console.log('');
  console.log('Commands:');
  console.log('  start       Start dev server (frontend + backend)');
  console.log('  install     Install dependencies only');
  console.log('  update      Update npm packages');
  console.log('  help        Show this help message');
  console.log('');
  console.log('Environment:');
  console.log('  HOST=0.0.0.0 PORT=5173 worldengine start   Custom host/port');
}

function main() {
  const command = process.argv[2] || 'start';
  const envType = detectEnvironment();
  
  switch (command) {
    case 'start':
      checkDependencies();
      startServer(envType);
      break;
    case 'install':
      run('npm install');
      run('npm install --prefix backend');
      console.log('Dependencies installed.');
      break;
    case 'update':
      run('npm update');
      run('npm update --prefix backend');
      console.log('Packages updated.');
      break;
    case 'help':
    default:
      showUsage();
      break;
  }
}

main();
