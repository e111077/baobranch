import type { ArgumentsCamelCase, CommandModule } from "yargs";
import type { FormatOptions } from "./options";
import { execCommand, getBranchListAnnotations, logger } from "../../utils.js";
import { getParentBranch } from "../../tree-nav/parent.js";
import { createPrTerminalLink } from "../../github-helpers/links.js";

async function handler(argv: ArgumentsCamelCase<FormatOptions>) {
  const currentBranch = execCommand('git rev-parse --abbrev-ref HEAD');
  const parent = await getParentBranch(currentBranch);
  const notes = getBranchListAnnotations(parent);

  switch (argv.format) {
    case 'pr':
      if (notes.prNumber) {
        logger.info(`${createPrTerminalLink(notes.prNumber)}${notes.annotations}`);
      } else {
        logger.info(`#${notes.annotations}`);
      }
      break;
    case 'branch':
      logger.info(parent.branchName + notes.annotations);
      break;
    case 'both':
      if (notes.prNumber) {
        logger.info(`${parent.branchName}${createPrTerminalLink(notes.prNumber)}${notes.annotations}`);
      } else {
        logger.info(`${parent.branchName}${notes.annotations}`);
      }
      break;
  }
}

export const listParent = {
  command: ['parent', 'p'],
  describe: 'List parent branch',
  handler,
} satisfies CommandModule<{}, FormatOptions>;