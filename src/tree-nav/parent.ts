import { makeMergeBaseTag } from "../tags/merge-base-master.js";
import { cleanupTags } from "../tags/cleanup.js";
import { makeStaleParentTag, parseStaleParentTag } from "../tags/stale.js";
import { execCommandAsync, logger, type Branch } from "../utils.js";

/**
 * Determines the parent branch of a given branch
 * Handles both regular parents and stale parents (tagged with stale-parent)
 */
export async function getParentBranch(branchNameOrCommit: string): Promise<Branch> {
  const parentCommit = await execCommandAsync(`git rev-parse ${branchNameOrCommit}^`);
  logger.debug(`getParentBranch called with: "${branchNameOrCommit}"`);
  let parentBranchName = (await execCommandAsync(`git branch --format="%(refname:short)" --points-at ${parentCommit}`))
      .replace(/\(HEAD detached at .+\)/, '')
      .trim();

  if (parentBranchName) {
    return {
      branchName: parentBranchName,
      parent: null,
      children: [],
      orphaned: false,
      stale: false,
    };
  }

  cleanupTags();

  logger.debug(`No direct parent branch found for commit: ${parentCommit}`);
  // Check for stale parent tags
  const [staleTag, mergeBaseParent, mainOrMaster] = await Promise.all([
  (() => {
    logger.debug(`Checking for stale parent tags pointing at commit: ${parentCommit}`);
    return execCommandAsync(`git tag --points-at ${parentCommit} | grep -E '^${makeStaleParentTag('.+?', '.+?')}$'`)
  })(),
  (() => {
    logger.debug(`Checking for merge-base tags pointing at commit: ${parentCommit}`);
    return execCommandAsync(`git tag --points-at ${parentCommit} | grep -E '^${makeMergeBaseTag('.+?')}$'`);
  })(),
    await execCommandAsync('git branch --list main') ? 'main' : 'master',
  ]);
  const staleParentBranch = parseStaleParentTag(staleTag)?.branchName;
  parentBranchName = staleParentBranch ?? (mergeBaseParent ? mainOrMaster : '');

  if (!parentBranchName) {
    logger.debug('No stale or merge-base parent tags found.');
    return await getParentBranch(parentCommit);
  }

  return {
    branchName: parentBranchName,
    parent: null,
    children: [],
    orphaned: false,
    stale: true,
  };
}