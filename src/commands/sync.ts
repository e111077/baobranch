import type { Argv, CommandModule } from "yargs";
import { execCommand, getParentBranch } from "../utils.js";
import {rebaseImpl} from './rebase/index.js';

/**
 * Rebases the current branch onto its parent branch after user confirmation
 */
export const sync = {
  command: 'sync',
  describe: 'Rebase the current branch onto its parent branch',
  builder: (yargs: Argv) =>
    yargs
      .positional('branch', {
        describe: 'The branch to rebase onto',
        type: 'string',
        demandOption: true
      })
      .option('continue', {
        describe: 'Continue the rebase after resolving conflicts',
        type: 'boolean'
      })
      .option('abort', {
        describe: 'Abort the rebase operation',
        type: 'boolean'
      }),
  handler: (options) => {
    const currentBranch = execCommand('git rev-parse --abbrev-ref HEAD');
    const parent = getParentBranch(currentBranch);
    const flag = options.continue ? 'continue' : options.abort ? 'abort' : null;

    rebaseImpl(currentBranch, parent.branchName, flag);
  }
} satisfies CommandModule<{}, { branch: string, continue?: boolean, abort?: boolean }>;