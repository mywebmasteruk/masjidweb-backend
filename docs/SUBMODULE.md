# `ycode-masjidweb` git submodule

The builder app lives in a **separate repository** referenced from this repo (see [`.gitmodules`](../.gitmodules)).

## Clone

```bash
git clone --recurse-submodules <repo-url>
```

If you already cloned without submodules:

```bash
git submodule update --init --recursive
```

## Work on the builder

```bash
cd ycode-masjidweb
# make changes, commit, push to the submodule remote
cd ..
git add ycode-masjidweb
git commit -m "Bump ycode-masjidweb submodule"
```

## Bump upstream YCode

1. In `ycode-masjidweb`, add upstream if needed: `git remote add upstream https://github.com/ycode/ycode.git` (or your fork).
2. Merge or rebase upstream `main` into the submodule branch, resolve conflicts, test.
3. Commit in the submodule and push.
4. In the **parent** repo, commit the new submodule pointer and document verification in the PR.

## CI (parent repo)

[`.github/workflows/ci.yml`](../.github/workflows/ci.yml) runs on **`main`**. Checkout uses **`submodules: recursive`** so `ycode-masjidweb` is present for jobs that need the builder tree. Pushes that only touch the parent without bumping the submodule still get a green run as long as the recorded submodule commit is fetchable.

## Release checklist

- [ ] `bash scripts/verify-all.sh` passes with the new submodule commit.
- [ ] [`.github/workflows/ci.yml`](../.github/workflows/ci.yml) green on the branch.
- [ ] Spot-check builder and admin flows per [`TEST_PLAN.md`](../TEST_PLAN.md).
