import { loadState, saveState } from '../../branch-state/state.js';
import type { CommandModule } from 'yargs';

export const drop: CommandModule = {
  command: 'drop <branchName>',
  describe: 'Remove a specific branch from the state cache',
  builder: (yargs) =>
    yargs.positional('branchName', {
      type: 'string',
      describe: 'Name of the branch to remove from cache'
    }),
  handler: (argv) => {
    try {
      const state = loadState();
      const branchName = argv.branchName as string;

      if (state.branches[branchName]) {
        delete state.branches[branchName];
        saveState(state);
        console.log(`Successfully removed ${branchName} from branch state cache.`);
      } else {
        console.log(`Branch ${branchName} not found in cache.`);
      }
    } catch (error) {
      console.error('Failed to drop branch from cache:', error);
      process.exit(1);
    }
  }
};