import { listParent } from './parent.js';
import { listChildren } from './children.js';
import type { FormatOptions } from "./options";
import type { ArgumentsCamelCase, Argv, CommandModule } from "yargs";
import { execCommand, getBranchListAnnotations } from '../../utils.js';
import { getParentBranch } from '../../tree-nav/parent.js';
import { findChildren } from '../../tree-nav/children.js';
import { listTree } from './tree.js';

function handler(argv: ArgumentsCamelCase<FormatOptions>) {
  const branchName = execCommand('git rev-parse --abbrev-ref HEAD');
  const parent = getParentBranch(branchName);
  const branch = findChildren(parent.branchName).find(child => child.branchName === branchName)!;
  const notes = getBranchListAnnotations(branch);

  switch (argv.format) {
    case 'pr':
      console.log(`#${notes.prNumber || ''}${notes.annotations}`);
      break;
    case 'branch':
      console.log(branch.branchName + notes.annotations);
      break;
    case 'both':
      if (notes.prNumber) {
        console.log(`${branch.branchName}#${notes.prNumber}${notes.annotations}`);
      } else {
        console.log(`${branch.branchName}${notes.annotations}`);
      }
      break;
  }
}

export const list = {
  command: 'list [command]',
  aliases: ['ls'],
  describe: 'List parent or children branches',
  builder: (yargs: Argv): Argv<FormatOptions> =>
    yargs
      .command(listParent)
      .command(listChildren)
      .option('format', {
        describe: 'Output format',
        choices: ['pr', 'branch', 'both'] as const,
        default: 'both'
      } as const)
      .command(listTree),
  handler,
} as const satisfies CommandModule<{}, FormatOptions>;