#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// ANSI color codes
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  cyan: '\x1b[36m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  red: '\x1b[31m',
  dim: '\x1b[2m',
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function header(text) {
  console.log('\n' + '━'.repeat(60));
  log(`  ${text}`, 'bright');
  console.log('━'.repeat(60) + '\n');
}

// Parse command line arguments
const args = process.argv.slice(2);
let runtime = null;
let installLocation = null;
let showHelp = false;

for (let i = 0; i < args.length; i++) {
  const arg = args[i];

  // Runtime flags
  if (arg === '--claude' || arg === '-c') runtime = 'claude';
  if (arg === '--all') runtime = 'all';

  // Location flags
  if (arg === '--global' || arg === '-g') installLocation = 'global';
  if (arg === '--local' || arg === '-l') installLocation = 'local';

  // Help flag
  if (arg === '--help' || arg === '-h') showHelp = true;
}

// Show help
if (showHelp) {
  header('⚡ YAP INSTALLER');
  log('Fast, token-efficient meta prompting for Claude Code\n', 'cyan');
  log('Usage:', 'bright');
  log('  npx yap-cc [options]\n');
  log('Options:', 'bright');
  log('  -c, --claude         Install for Claude Code', 'blue');
  log('  --all                Install for all runtimes (future: multi-runtime)', 'blue');
  log('  -g, --global         Install globally (~/.claude/)', 'blue');
  log('  -l, --local          Install locally (./.claude/)', 'blue');
  log('  -h, --help           Show this help message\n', 'blue');
  log('Examples:', 'bright');
  log('  npx yap-cc                    # Interactive mode', 'dim');
  log('  npx yap-cc -c -g              # Claude Code, global', 'dim');
  log('  npx yap-cc --claude --local   # Claude Code, local', 'dim');
  log('  npx yap-cc@latest -g          # Update to latest\n', 'dim');
  log('Documentation:', 'cyan');
  log('  https://github.com/blankjul/yap-cc\n');
  process.exit(0);
}

// Determine install paths
function getInstallPath(runtime, location) {
  const homeDir = process.env.HOME || process.env.USERPROFILE;

  if (location === 'global') {
    return path.join(homeDir, '.claude');
  } else {
    return path.join(process.cwd(), '.claude');
  }
}

// Interactive prompts (if no CLI args provided)
function prompt(question, options = []) {
  const readline = require('readline').createInterface({
    input: process.stdin,
    output: process.stdout
  });

  return new Promise((resolve) => {
    if (options.length > 0) {
      log(question, 'cyan');
      options.forEach((opt, i) => {
        console.log(`  ${i + 1}. ${opt}`);
      });
      readline.question('\nSelect option (1-' + options.length + '): ', (answer) => {
        readline.close();
        const index = parseInt(answer) - 1;
        if (index >= 0 && index < options.length) {
          resolve(options[index]);
        } else {
          resolve(options[0]); // Default to first option
        }
      });
    } else {
      readline.question(question + ' ', (answer) => {
        readline.close();
        resolve(answer);
      });
    }
  });
}

async function main() {
  header('⚡ YAP INSTALLER');

  log('Fast, token-efficient meta prompting for Claude Code\n', 'cyan');

  // Determine runtime
  if (!runtime) {
    if (process.stdout.isTTY) {
      const runtimeChoice = await prompt(
        'Which runtime do you want to install YAP for?',
        ['Claude Code', 'Skip']
      );
      runtime = runtimeChoice === 'Claude Code' ? 'claude' : null;
    } else {
      runtime = 'claude'; // Default for non-TTY
    }
  }

  if (!runtime || runtime === 'Skip') {
    log('Installation cancelled.', 'yellow');
    process.exit(0);
  }

  // Determine location
  if (!installLocation) {
    if (process.stdout.isTTY) {
      const locationChoice = await prompt(
        'Where do you want to install YAP?',
        ['Global (~/.claude) - available in all projects', 'Local (./.claude) - current project only']
      );
      installLocation = locationChoice.includes('Global') ? 'global' : 'local';
    } else {
      installLocation = 'global'; // Default for non-TTY
    }
  }

  const installPath = getInstallPath(runtime, installLocation);

  header('📦 INSTALLATION DETAILS');
  log(`Runtime:  ${runtime === 'claude' ? 'Claude Code' : runtime}`, 'blue');
  log(`Location: ${installLocation}`, 'blue');
  log(`Path:     ${installPath}`, 'blue');

  // Create directories
  log('\n📁 Creating directories...', 'cyan');
  const dirs = [
    path.join(installPath, 'commands', 'yap'),
    path.join(installPath, 'skills'),
    path.join(installPath, 'yap')
  ];

  dirs.forEach(dir => {
    fs.mkdirSync(dir, { recursive: true });
    log(`  ✓ ${dir}`, 'green');
  });

  // Copy files
  log('\n📝 Copying files...', 'cyan');

  const packageRoot = path.resolve(__dirname, '..');

  // Copy commands
  const commandsSource = path.join(packageRoot, 'commands', 'yap');
  const commandsDest = path.join(installPath, 'commands', 'yap');
  copyDirectory(commandsSource, commandsDest);
  log('  ✓ Commands', 'green');

  // Copy skills
  const skillsSource = path.join(packageRoot, 'skills');
  const skillsDest = path.join(installPath, 'skills');
  copyDirectory(skillsSource, skillsDest);
  log('  ✓ Skills', 'green');

  // Copy templates to yap directory
  const templatesSource = path.join(packageRoot, 'templates');
  const templatesDest = path.join(installPath, 'yap', 'templates');
  fs.mkdirSync(templatesDest, { recursive: true });
  copyDirectory(templatesSource, templatesDest);
  log('  ✓ Templates', 'green');

  // Create version file
  const pkg = require(path.join(packageRoot, 'package.json'));
  fs.writeFileSync(
    path.join(installPath, 'yap', 'VERSION'),
    pkg.version
  );
  log('  ✓ Version file', 'green');

  // Success message
  header('✅ INSTALLATION COMPLETE!');

  log('YAP is now installed and ready to use!\n', 'green');
  log('Get started:', 'cyan');
  log('  1. Navigate to a project directory', 'blue');
  log('  2. Run: claude-code', 'blue');
  log('  3. Type: /yap:init', 'blue');
  log('\nAvailable commands:', 'cyan');
  log('  /yap:init      - Initialize project', 'blue');
  log('  /yap:story     - Create new story', 'blue');
  log('  /yap:execute   - Execute story', 'blue');
  log('  /yap:verify    - Verify completion', 'blue');
  log('  /yap:status    - Show progress', 'blue');
  log('  /yap:discuss   - Design discussion', 'blue');
  log('  /yap:research  - Research libraries', 'blue');
  log('  /yap:learn     - Map existing codebase', 'blue');

  log('\nDocumentation: https://github.com/blankjul/yap-cc\n', 'cyan');
}

function copyDirectory(source, dest) {
  if (!fs.existsSync(source)) {
    return;
  }

  fs.mkdirSync(dest, { recursive: true });

  const files = fs.readdirSync(source);

  files.forEach(file => {
    const sourcePath = path.join(source, file);
    const destPath = path.join(dest, file);

    const stat = fs.statSync(sourcePath);

    if (stat.isDirectory()) {
      copyDirectory(sourcePath, destPath);
    } else {
      fs.copyFileSync(sourcePath, destPath);
    }
  });
}

// Run installer
main().catch(err => {
  log('\n❌ Installation failed:', 'red');
  console.error(err);
  process.exit(1);
});
