import { listParent } from './parent.js';
import { listChildren } from './children.js';
import type { FormatOptions } from "./options";
import type { ArgumentsCamelCase, Argv, CommandModule } from "yargs";
import { execCommand, getBranchListAnnotations, logger } from '../../utils.js';
import { getParentBranch } from '../../tree-nav/parent.js';
import { findChildren } from '../../tree-nav/children.js';
import { listTree } from './tree.js';
import { createPrTerminalLink } from '../../github-helpers/links.js';

async function handler(argv: ArgumentsCamelCase<FormatOptions>) {
  const branchName = execCommand('git rev-parse --abbrev-ref HEAD');
  const parent = await getParentBranch(branchName);
  const children = await findChildren(parent.branchName);
  const branch = children.find(child => child.branchName === branchName)!;
  const notes = getBranchListAnnotations(branch);

  switch (argv.format) {
    case 'pr':
      if (notes.prNumber) {
        logger.info(`${createPrTerminalLink(notes.prNumber)}${notes.annotations}`);
      } else {
        logger.info(`#${notes.annotations}`);
      }
      break;
    case 'branch':
      logger.info(branch.branchName + notes.annotations);
      break;
    case 'both':
      if (notes.prNumber) {
        logger.info(`${branch.branchName}${createPrTerminalLink(notes.prNumber)}${notes.annotations}`);
      } else {
        logger.info(`${branch.branchName}${notes.annotations}`);
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