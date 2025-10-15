import type { ArgumentsCamelCase, CommandModule } from "yargs";
import type { FormatOptions } from "./options";
import { execCommand, getBranchListAnnotations } from "../../utils.js";
import { getParentBranch } from "../../tree-nav/parent.js";
import { createPrTerminalLink } from "../../github-helpers/links.js";

function handler(argv: ArgumentsCamelCase<FormatOptions>) {
  const currentBranch = execCommand('git rev-parse --abbrev-ref HEAD');
  const parent = getParentBranch(currentBranch);
  const notes = getBranchListAnnotations(parent);

  switch (argv.format) {
    case 'pr':
      if (notes.prNumber) {
        console.log(`${createPrTerminalLink(notes.prNumber)}${notes.annotations}`);
      } else {
        console.log(`#${notes.annotations}`);
      }
      break;
    case 'branch':
      console.log(parent.branchName + notes.annotations);
      break;
    case 'both':
      if (notes.prNumber) {
        console.log(`${parent.branchName}${createPrTerminalLink(notes.prNumber)}${notes.annotations}`);
      } else {
        console.log(`${parent.branchName}${notes.annotations}`);
      }
      break;
  }
}

export const listParent = {
  command: ['parent', 'p'],
  describe: 'List parent branch',
  handler,
} satisfies CommandModule<{}, FormatOptions>;