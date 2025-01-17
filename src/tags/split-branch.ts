/**
 * Creates a tag name for marking split branches using a specific format
 *
 * @param branchName - Name of the branch being marked as stale
 * @returns Formatted tag name in the format 'bbranch-split-{{branchName}}'
 */
export function makeSplitBranchTag(branchName: string) {
  return `bbranch-split-{{${branchName}}}`;
}

/**
 * Creates a branch name for a split branch using a specific format
 *
 * @param sourceBranchName The name of the source branch
 * @returns A formatted split branch tag
 */
export function makeSplitBranchBranchName(sourceBranchName: string) {
  return `split-root--${sourceBranchName}`;
}

/**
 * Parses a split branch tag to extract the branch name.
 *
 * @param rootBranchName The name of the root branch of format split-root--{{sourceBranch}}
 * @returns An object containing the source branch name
 */
export function parseSplitBranchBranchName(rootBranchName: string) {
  const regex = new RegExp(makeSplitBranchBranchName('(.+?)$'));
  const [_, sourceBranch] = rootBranchName.match(regex) ?? [];
  return { sourceBranch };
}

/**
 * Determins if a tag is a split branch tag or not.
 *
 * @param tag Tag to check
 * @returns True if the tag is a split branch tag, false otherwise
 */
export function isSplitBranchTag(tag: string) {
  return tag.startsWith('bbranch-split-');
}

/**
 * Extracts branch name from a stale parent tag
 *
 * @param tag - The stale parent tag to parse
 * @returns Object containing the branch name and numeric tag identifier
 * @example
 * parseSplitBranchTag('bbranch-split-{{feature}}')
 * // Returns { branchName: 'feature' }
 */
export function parseSplitBranchTag(tag: string) {
  const regex = new RegExp(makeSplitBranchTag('(.+?)'));
  const [_, branchName] = tag.match(regex) ?? [];
  return { branchName };
}