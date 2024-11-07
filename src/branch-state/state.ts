import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import { execCommand } from '../utils.js';
import type { BranchState } from './types';

// Get git root directory for this repo
const GIT_ROOT = execCommand('git rev-parse --git-dir');
const STATE_FILE = join(GIT_ROOT, 'figbranch-state.json');

const EMPTY_STATE: BranchState = {
  timestamp: Date.now(),
  branches: {}
};

export function loadState(): BranchState {
  if (!existsSync(STATE_FILE)) {
    saveState(EMPTY_STATE);
    return EMPTY_STATE;
  }

  try {
    return JSON.parse(readFileSync(STATE_FILE, 'utf8'));
  } catch {
    return EMPTY_STATE;
  }
}

export function saveState(state: BranchState): void {
  state.timestamp = Date.now();
  writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

export function clearState(): void {
  saveState(EMPTY_STATE);
}