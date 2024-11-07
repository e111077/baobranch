import type { ArgumentsCamelCase } from 'yargs';
import type { FormatOptions } from "./options";
import { type Command, execCommand, findChildren } from '../../utils.js';

function impl(argv: ArgumentsCamelCase<FormatOptions>) {
  const currentBranch = execCommand('git rev-parse --abbrev-ref HEAD');
  const children = findChildren(currentBranch);

  if (!children.length) {
    console.log('No child branches found');
    return;
  }

  const output = children.map(child => {
    switch (argv.format) {
      case 'pr':
        return `${child.prNumber || '(none)'}${child.orphaned ? ' (orphaned?)' : ''}`;
      case 'branch':
        return `${child.branchName}${child.orphaned ? ' (orphaned?)' : ''}`;
      case 'both':
      default:
        return child.prNumber ?
          `${child.branchName}#${child.prNumber}${child.orphaned ? ' (orphaned?)' : ''}` :
          child.branchName;
    }
  });

  console.log(output.join('\n'));
}

export const listChildren = {
  command: 'children' as const,
  description: 'List child branches',
  impl,
} satisfies Command<FormatOptions>;
