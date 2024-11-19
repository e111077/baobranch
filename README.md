# BaoBranch

*A tool on top of Git to help you navigate and manage chained branches.*

> A Baobab tree has a really big long main trunk and a bunch of small branches at the tip.

## Installation

1. Install the [Github CLI](https://cli.github.com/)
2. log into the Github CLI
3. Install BaoBranch via npm

```bash
npm i -g baobranch
```

## Concepts

Baobranch simplifes making, managing, and navigating branches that are chained together. It achieves this by attempting to enforce a 1-branch-1-commit model. i.e. **each branch is a single commit.**

### Why Baobranch?

Baobranch is intended to be a simple, lightweight tool that helps you manage branches in a way that is more intuitive and easier to understand. It is not intended to replace Git, but rather to provide a simpler interface for managing branches.

If you'd like a more robust and feature-rich DVCS, you might want to consider [Jujutsu](https://github.com/martinvonz/jj) which does lots of similar things to Baobranch, but with more complexity and more concepts.

### Why chain branches?

It makes it easier to create focused PRs for easy and quick reviewing.

### Why not just use Git?

Baobranch makes it easy to chain branches together. Consider the following Git tree:

```
* 0b20366 (D)
* 6708db3 (C)
| * b62d30d (B)
|/
* f048e9c (HEAD -> A)
* 0e59234 (main)
```

You have the main branch, from there you have a commit-branch A. From there B and C branch off of A, and D branches off of C. We are also currently on branch A.

If you want to make a change to A, for example, make a new file "e". You can do the following:

```bash
touch e && echo 'contents of e' > e
```

If you commit this, you now have a new commit on branch A:

```bash
git add e && git commit -m 'add file e'
```

You now have the following:

```
* 9b664c7 (HEAD -> A) add file e
| * 0b20366 (D)
| * 6708db3 (C)
|/
| * b62d30d (B)
|/
* f048e9c a (old commit)
* 0e59234 (main)
```

Now if you want to keep this in order so that you can merge PRs associated with these branches and handle any conflicts, you need to either merge the new tip of `A` into `B`, `C`, and `D`. Or you need to rebase `B` and `C`, onto the new tip of `A` and `D` onto the new tip of `C` to create the following:

```
*   993cc6a (HEAD -> D) Merge branch 'A' into D
|\
* | 0b20366 d (old commit)
| | * 3a9fbfd (C) Merge branch 'A' into C
| |/|
|/|/
* | 6708db3 c (old commit)
| | *   45d757d (B) Merge branch 'A' into B
| | |\
| | |/
| |/|
| * | 9b664c7 (A) add file e
|/ /
| * b62d30d b (old commit)
|/
* f048e9c a (old commit)
* 0e59234 (main)
```

Messy, and lots of work. Rebasing would also require you to resolve conflicts in each commit of each branch. This is why Baobranch is useful and tries to make it easy to enforce a commit-branch.

#### With baobranch

Okay let's see this workflow again with Baobranch.

```
* 90cb39a (D) d
* 30ee5d7 (HEAD -> C) c
| * c05d40e (B) b
|/
* 26106c3 (A) a
* 0e59234 (main) tip
```

Let's make a file `e` again.

```bash
touch e && echo 'contents of e' > e
```

Now instead, let's amend it to A

```bash
bb amend
# or more explicitly
bb amend e
```

Now let's look at the graph:

```
* 94fc6bf (HEAD -> A) a
| * 90cb39a (D) d
| * 30ee5d7 (C) c
| | * c05d40e (B) b
| |/
| * 26106c3 (A - STALE REF) a
|/
* 0e59234 (main) tip
```

You can see it looks similar to before, but with the `bb` or `bb list tree` command, you can see that the `A` branch has been updated to the new commit which is **NOT** a new commit on `A`, but rather a modified commit on `main`. You will also notice that `B` and `C` are now children of a stale reference to `A`.

Let's use Baobranch to see the children:

```bash
bb ls children

B (orphaned)
C (orphaned)
```

You will see that B and C are now considered "orphans" of `A`. To resolve this we can do one of the following:

1. We can `bb rebase` onto `A` to make them children of `A` again and then again for `D` on `C`, but that would take a lot of work.
2. We can use the `bb evolve` command which will automatically do all the rebasing for us:

Let's go with 2.

```bash
bb evolve

Rebasing A onto main...
Current branch A is up to date.
Rebase complete.
Rebasing B onto A...
Rebase complete.
Rebasing C onto A...
Rebase complete.
Rebasing D onto C...
Rebase complete.
Evolve operation complete.
```

Now the tree is balanced again:

```
* a769873 (HEAD -> D) d
* 8756a5b (C) c
| * c4d085d (B) b
|/
* 94fc6bf (A) a
* 0e59234 (main) tip
```

### Committing vs branching

A branch is a single commit. When you perform a `bb commit`, you are creating a new branch. If you want to make changes to a branch, you probably want to amend or unamend from it using `bb amend [parital filepath]` or `bb unamend [parital filepath]`.

## Usage

### Help

```bash
bb help
# or
bb --help

Show branch tree (default)

Commands:
  bb                     Show branch tree (default)            [default]
  bb list [command]      List parent or children branches  [aliases: ls]
  bb next                Check out to a child branch
  bb prev                Check out to the parent branch
  bb amend [filename]    Amend changes to the previous commit
  bb unamend <filename>  Remove files from the last commit and move them
                          to staging
  bb evolve              Rebase the current orphaned branch onto a fresh
                          reference of its parent branch as well as all
                         of its descendants
  bb rebase [branch]     Rebase the current branch-commit onto the given
                          branch
  bb commit              Create a new branch and commit changes
  bb sync [command]      Synchronizes with remotes
  bb push <command>      Pushes changes to remotes          [aliases: p]
  bb pull                Pull updates and track orphaned branches
  bb completion          Generate shell completion script

Options:
      --version  Show version number                           [boolean]
  -h, --help     Show help                                     [boolean]
```

### Show the tree

```bash
bb
# or
bb list tree
# or
bb ls t
```

### Create a new branch-commit

Creates a new git branch and initializes a commit. Don't forget to stage your changes!

```bash
git add -A && bb commit
```

### Amend to a branch-commit

Amends the current branch-commit with the changes you have staged.

```bash
bb amend
```

Alternatively you can specify a file to amend:

```bash
touch partial/path/to/file && \
touch partial/path/to/another/file && \
bb amend partial/path/to
```

### Unamend from a branch-commit

Unamends the current branch-commit with the changes you have staged.

```bash
bb unamend partial/path/to/file
```

### Navigate between branch-commits

#### Children (orphaned or not)

```bash
bb next
```

#### Parent (stale or not)

```bash
bb prev
```

#### Any branch-commit

```bash
git checkout <branch name>
```

### Rebase a branch-commit

Currently you have to check out the current branch-commit you want to rebase and list its destination parent.

```bash
git checkout <branch name> && bb rebase <parent branch name>
```

**NOTE:** You must use `bb reabse` and `bb rebase --continue / --abort` to rebase a branch-commit instead of using `git rebase` or else baobranch will lose track of the orphaned children.

### Evolve the tree

#### Self, all descendants including orphans

Automatically rebases the current branch-commit onto its parent as well as all of its descendants, orphaned or not onto their updated locations. For example, if you have the following tree:

```
* e7680fc (D) d
* ed97e04 (C) c
* 201996a (A - STALE REF) a
| * 8d30562 (B) b
| * 2c654e4 (HEAD -> A) a
| | * 0e59234 (main) tip
| |/
| * 40531e1 (main - OLD TIP) mid
|/
* 78dd470 (main - OLD TIP) base
```

and run:

```bash
bb evolve
# or
bb evolve --scope=full
```

The result:

```bash
bb evolve

Rebasing A onto main...
Rebase complete.
Rebasing B onto A...
Rebase complete.
Rebasing C onto A...
Rebase complete.
Rebasing D onto C...
Rebase complete.
Evolve operation complete.


bb

* cdae2a2 (HEAD -> D) d
* 803240d (C) c
| * ca8b9f9 (B) b
|/
* dd4d2c4 (A) a
* 0e59234 (main) tip
```

#### Only direct descendants

Automatically rebases the current branch-commit onto its parent as well as all of its non-orphaned descendants onto their updated locations. For example, if you have the following tree:

```
* e7680fc (D) d
* ed97e04 (C) c
* 201996a (A - STALE REF) a
| * 8d30562 (B) b
| * 2c654e4 (HEAD -> A) a
| | * 0e59234 (main) tip
| |/
| * 40531e1 (main - OLD TIP) mid
|/
* 78dd470 (main - OLD TIP) base
```

and run:

```bash
bb evolve --scope=directs
```

The result:

```bash
bb evolve --scope=directs

Rebasing A onto main...
Rebase complete.
Rebasing B onto A...
Rebase complete.
Evolve operation complete.


bb

* 0a14960 (HEAD -> B) b
* 1689d5b (A) a
* 0e59234 (main) tip
| * e7680fc (D) d
| * ed97e04 (C) c
| * 201996a (A - STALE REF) a
|/
* 78dd470 (main - OLD TIP) base
```

#### Only the current branch-commit

Automatically rebases the current branch-commit onto its parent. For example, if you have the following tree:

```
* e7680fc (D) d
* ed97e04 (C) c
* 201996a (A - STALE REF) a
| * 8d30562 (B) b
| * 2c654e4 (HEAD -> A) a
| | * 0e59234 (main) tip
| |/
| * 40531e1 (main - OLD TIP) mid
|/
* 78dd470 (main - OLD TIP) base
```

and run:

```bash
bb evolve --scope=self
```

The result:

```bash
bb evolve --scope=self

✔ Attempt to rebase single branch-commit (A) onto branch main? yes
Rebasing A onto main...
Rebase complete.


bb

* 7a48e4b (HEAD -> A) a
* 0e59234 (main) tip
| * e7680fc (D) d
| * ed97e04 (C) c
| * 201996a (A - STALE REF) a
| | * 8d30562 (B) b
| | * 2c654e4 (A - STALE REF) a
| |/
|/|
* | 40531e1 (main - OLD TIP) mid
|/
* 78dd470 (main - OLD TIP) base
```

### Listing branches

#### List current branch

Lists the current branch and associated PR number.

```bash
bb ls
# or
bb list
```

Accepts a `--format` flag to specify the output format. The default is `both`.

```bash
bb ls --format=both

my-branch-name#123


bb ls --format=branch

my-branch-name


bb ls --format=pr

#123
```

#### List children

Lists the children of the current branch.

```bash
bb ls children
# or
bb ls c
```

#### List parent

Lists the parent of the current branch.

```bash
bb ls parent
# or
bb ls p
```

### Pushing branches to remotes

#### Push the current branch

Pushes the current branch to the remote.

```bash
git push -f
```

#### Push all branches

Pushes all branches to the remote.

```bash
bb push all
```

#### Push the current branch-commit and all direct descendants

Pushes the current branch-commit and all of its non-orphaned descendants to the remote.

```bash
bb push chain
```

### Synchronizing with remotes

#### Pull the main branch and clean up branches with merged / closed PRs

Pulls the main branch and deletes local branches with merged / closed PRs. This helps clean up `bb list tree` output.

```bash
bb sync
```

#### Synchronize PRs with branch layout

This command does the following:

1. Finds all PRs associated with the local branches of the repo
2. Updates their descriptions to include a table linking to children an parent branches' PRs if they exist
3. Updates the PRs' merge-base to the associated parent branch

```bash
bb sync prs
```

