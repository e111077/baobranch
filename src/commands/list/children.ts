import type { ArgumentsCamelCase, CommandModule } from 'yargs';
import type { FormatOptions } from "./options";
import { execCommand, getBranchListAnnotations } from '../../utils.js';
import { findChildren } from '../../tree-nav/children.js';
import { createPrTerminalLink } from '../../github-helpers/links.js';

async function handler(argv: ArgumentsCamelCase<FormatOptions>) {
  const currentBranch = execCommand('git rev-parse --abbrev-ref HEAD');
  const children = await findChildren(currentBranch);

  if (!children.length) {
    console.log('No child branches found');
    return;
  }

  const output = children.map(child => {
    const notes = getBranchListAnnotations(child);
    switch (argv.format) {
      case 'pr':
        return notes.prNumber ?
          `${createPrTerminalLink(notes.prNumber)}${notes.annotations}` :
          `#(none)${notes.annotations}`;
      case 'branch':
        return `${child.branchName}${notes.annotations}`;
      case 'both':
      default:
        return notes.prNumber ?
          `${child.branchName}${createPrTerminalLink(notes.prNumber)}${notes.annotations}` :
          `${child.branchName}${notes.annotations}`;
    }
  });

  console.log(output.join('\n'));
}

export const listChildren = {
  command: ['children', 'c'],
  describe: 'List child branches',
  handler,
} satisfies CommandModule<{}, FormatOptions>;
