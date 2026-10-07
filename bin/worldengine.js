#!/usr/bin/env node
/**
 * WorldEngine CLI - unified startup for WSL and Windows
 * Usage: worldengine start [options]
 */

const { execSync, spawn } = require('child_process');
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
  }

  // Install backend deps if needed
  const backendPath = path.join(PROJECT_ROOT, 'backend');
  if (!fs.existsSync(path.join(backendPath, 'node_modules'))) {
    run('npm install --prefix backend');
  }

  // On WSL/Linux, ensure better-sqlite3 is compiled for the current platform
  if (!isWindows()) {
    try {
      execSync(`node -e "require('better-sqlite3')"`, { 
        cwd: backendPath, 
        stdio: ['ignore', 'ignore', 'ignore'] 
      });
    } catch (e) {
      console.log('Rebuilding better-sqlite3 for current platform...');
      run(`npm rebuild better-sqlite3 --prefix ${backendPath}`);
    }
  }
}

function waitUntilPortOpen(port, timeout = 15000) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const check = () => {
      const net = require('net');
      const socket = net.connect({ host: '127.0.0.1', port });
      socket.on('connect', () => {
        socket.end();
        resolve(true);
      });
      socket.on('error', (err) => {
        if (Date.now() - start < timeout) {
          setTimeout(check, 250);
        } else {
          reject(new Error(`Port ${port} not open after ${timeout}ms`));
        }
      });
    };
    check();
  });
}

async function startServer(envType) {
  console.log(`Starting WorldEngine dev server (${envType})...`);
  
  // Set environment variables for cross-platform access
  process.env.HOST = process.env.HOST || '0.0.0.0';
  process.env.WE_OPEN_BROWSER = '1';

  // Release ports (using free-port.mjs via node, not npm scripts)
  console.log('Releasing ports...');
  const { exec } = require('child_process');
  await new Promise((resolve) => {
    exec('node scripts/free-port.mjs 3000', { cwd: PROJECT_ROOT }, resolve);
  });
  await new Promise((resolve) => {
    exec('node scripts/free-port.mjs 5173', { cwd: PROJECT_ROOT }, resolve);
  });

  // Start backend first and wait for it to be ready
  console.log('Starting backend...');
  const backend = spawn('npm', ['run', 'dev', '--prefix', path.join(PROJECT_ROOT, 'backend')], {
    cwd: PROJECT_ROOT,
    stdio: 'inherit',
    env: process.env,
    shell: isWindows()
  });

  try {
    await waitUntilPortOpen(3000);
    console.log('Backend ready.');
  } catch (e) {
    console.error('Backend failed to start.', e.message);
    backend.kill();
    process.exit(1);
  }

  // Now start frontend
  console.log('Starting frontend...');
  const frontend = spawn('npm', ['run', 'dev', '--prefix', path.join(PROJECT_ROOT, 'frontend')], {
    cwd: PROJECT_ROOT,
    stdio: 'inherit',
    env: process.env,
    shell: isWindows()
  });

  // Wait for frontend too (optional)
  try {
    await waitUntilPortOpen(5173);
    console.log('Frontend ready.');
  } catch (e) {
    console.error('Frontend failed to start.', e.message);
  }

  // Handle Ctrl+C to stop both
  process.on('SIGINT', () => {
    backend.kill();
    frontend.kill();
  });
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
      startServer(envType).catch((e) => {
        console.error('Failed to start servers.', e);
        process.exit(1);
      });
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
