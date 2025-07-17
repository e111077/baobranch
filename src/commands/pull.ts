import { execCommand, type Command } from "../utils.js";
import { findChildren } from "../tree-nav/children.js";
import { markStale } from '../tags/stale.js';

export const pull: Command = {
  command: 'pull',
  description: 'Pull updates and track orphaned branches',
  impl: async () => {
    const currentCommit = execCommand('git rev-parse HEAD');
    const currentBranch = execCommand('git rev-parse --abbrev-ref HEAD');
    console.log(`Pulling updates for ${currentBranch}...`);

    const children = await findChildren(currentBranch);

    try {
      execCommand('git pull', true);
      const newCommit = execCommand('git rev-parse HEAD');

      if (currentCommit !== newCommit) {
        markStale(currentCommit, currentBranch, children.some(child => !child.orphaned));
      }

    } catch (error) {
      console.error((error as Error).message);
      process.exit(1);
    }
  }
};