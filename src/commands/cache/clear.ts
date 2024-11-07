import { clearState } from '../../branch-state/state.js';
import type { Command } from '../../utils.js';

export const clear: Command = {
  command: 'clear',
  description: 'Clear the branch state file for this repository',
  impl: async () => {
    try {
      clearState();
      console.log('Successfully cleared branch state.');
    } catch (error) {
      console.error('Failed to clear branch state:', error);
      process.exit(1);
    }
  }
};