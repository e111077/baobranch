/**
 * @module comment
 * Manages PR description updates with branch relationship tables
 */

import { execCommand } from '../utils.js';
import { createPrLink } from './links.js';

/**
 * Interface representing a PR dependency (branch and its PR number)
 */
interface PrDep {
  branchName: string;
  prNumber?: number;
}

/**
 * Updates or inserts a comment section in a PR description
 *
 * This function adds or updates a section in the PR description between
 * figbranch comment markers. The section typically contains a table showing
 * branch relationships.
 *
 * @param prNumber - The PR number to update
 * @param body - The new content to insert between the comment markers
 *
 * @example
 * upsertPrDescription(123, "| Parent | Children |\n| -- | -- |\n| main | feature-1 |");
 */
export function upsertPrDescription(prNumber: number, body: string) {
  // Get current PR description
  let description = execCommand(
    `gh pr view ${prNumber} --json body --jq '.body'`,
    true,
    { stdio: ['pipe', 'pipe', 'pipe'] }
  );

  // Create the comment block with the new content
  const bodyWithComment = `<!-- figbranch-comment-start -->

${body}

<!-- figbranch-comment-end -->`;

  // Check if a figbranch comment section already exists
  const hasComment = description.match(/<!-- figbranch-comment-start -->[\s\S]*?<!-- figbranch-comment-end -->/);

  // Update or append the comment section
  if (hasComment) {
    description = description.replace(
      /<!-- figbranch-comment-start -->[\s\S]*?<!-- figbranch-comment-end -->/,
      bodyWithComment
    );
  } else {
    description += bodyWithComment;
  }

  // Update the PR description
  execCommand(
    `gh pr edit ${prNumber} --body '${description}'`,
    true,
    { stdio: ['pipe', 'pipe', 'pipe'] }
  );
}

/**
 * Generates a markdown table showing branch relationships
 *
 * Creates a table showing:
 * - Parent branch (with PR link if available)
 * - Child branches (with PR links if available)
 *
 * @param parent - Parent branch information
 * @param children - Array of child branch information
 * @returns Formatted markdown table string
 *
 * @example
 * const table = getTableStr(
 *   { branchName: 'main', prNumber: undefined },
 *   [{ branchName: 'feature', prNumber: 123 }]
 * );
 * // Returns:
 * // | Parent | Children |
 * // | -- | -- |
 * // | (main) | #123 |
 */
export function getTableStr(parent: PrDep, children: PrDep[]) {
  // Format parent entry
  let parentStr: string;
  if (parent.prNumber) {
    parentStr = createPrLink(parent.branchName, parent.prNumber);
  } else {
    parentStr = `(${parent.branchName})`;
  }

  // Split children by PR status
  const childrenWithPrs = children.filter(child => child.prNumber);
  const childrenWithoutPrs = children.filter(child => !child.prNumber);

  // Format children list
  let childrenStr: string;
  if (childrenWithPrs.length > 0) {
    childrenStr = childrenWithPrs
      .map(child => createPrLink(child.branchName, child.prNumber!))
      .join(', ');
  } else {
    childrenStr = childrenWithoutPrs
      .map(child => `(${child.branchName})`)
      .join(', ');
  }

  // Create markdown table
  return `| Parent | Children |
| -- | -- |
| ${parentStr} | ${childrenStr} |`;
}