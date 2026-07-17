#!/usr/bin/env node
// Probe the host user's preferred shell environment for the containerise-dev
// skill. Emits JSON facts; what to do with them (shell layer on/off, dotfiles
// guidance) stays with the model.
//
// Deliberately does NOT copy rc files into containers: host rc files reference
// host paths and plugin managers that don't exist in the image. The portable
// mechanisms are (a) installing the preferred shell in the container and
// (b) a dotfiles repo applied via the user-level `dotfiles.repository` setting
// or `devcontainer up --dotfiles-repository`.
import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const RC_FILES = ['.zshrc', '.bashrc', '.bash_profile', '.profile'];
const FRAMEWORKS = [
  ['.oh-my-zsh', 'oh-my-zsh'],
  ['.p10k.zsh', 'powerlevel10k'],
  ['.config/starship.toml', 'starship'],
  ['.config/fish', 'fish-config'],
];

// VS Code settings.json allows comments, so a plain JSON.parse can fail;
// a targeted regex is robust for the single key we need.
export function extractDotfilesRepo(settingsText) {
  const m = settingsText.match(/"dotfiles\.repository"\s*:\s*"([^"]+)"/);
  return m ? m[1] : null;
}

function vscodeSettingsPaths(home, platform) {
  const paths = [join(home, '.config', 'Code', 'User', 'settings.json')];
  if (platform === 'darwin') {
    paths.unshift(join(home, 'Library', 'Application Support', 'Code', 'User', 'settings.json'));
  }
  return paths;
}

export function detectShellEnv(home = homedir(), env = process.env, platform = process.platform) {
  const shell = env.SHELL ? basename(env.SHELL) : null;

  const rcFiles = RC_FILES.filter((f) => existsSync(join(home, f)));
  const frameworks = FRAMEWORKS.filter(([path]) => existsSync(join(home, path))).map(([, name]) => name);

  let dotfilesRepo = null;
  for (const path of vscodeSettingsPaths(home, platform)) {
    if (!existsSync(path)) continue;
    try {
      dotfilesRepo = extractDotfilesRepo(readFileSync(path, 'utf8'));
    } catch {
      // unreadable settings: keep probing
    }
    if (dotfilesRepo) break;
  }
  if (!dotfilesRepo) {
    for (const dir of ['.dotfiles', 'dotfiles']) {
      const gitConfig = join(home, dir, '.git', 'config');
      if (!existsSync(gitConfig)) continue;
      try {
        const m = readFileSync(gitConfig, 'utf8').match(/url\s*=\s*(\S+)/);
        if (m) { dotfilesRepo = m[1]; break; }
      } catch {
        // unreadable git config: keep probing
      }
    }
  }

  return { shell, rcFiles, frameworks, dotfilesRepo };
}

// Main-module guard that survives symlinked skill directories (first-trial
// finding: argv[1] may be the symlinked path while import.meta.url is real).
function isMain() {
  if (!process.argv[1]) return false;
  try {
    return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

if (isMain()) {
  console.log(JSON.stringify(detectShellEnv(), null, 2));
}
