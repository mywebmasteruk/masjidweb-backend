const GH = "https://api.github.com";

/** Official Ycode repo — must match tenant `checkForUpdates` upstream. */
export const YCODE_UPSTREAM_REPO = "ycode/ycode";

function headers(token: string): HeadersInit {
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
}

// ── Fork status ──────────────────────────────────────────────────────────────

export interface ForkStatus {
  behindBy: number;
  aheadBy: number;
  upstreamRepo: string;
  lastPush: string | null;
}

export async function getUpdateStatus(
  token: string,
  repo: string,
): Promise<ForkStatus> {
  const repoRes = await fetch(`${GH}/repos/${repo}`, {
    headers: headers(token),
  });
  if (!repoRes.ok) throw new Error(`GitHub get repo: ${repoRes.status}`);
  const repoData = (await repoRes.json()) as {
    parent?: { full_name: string; default_branch: string };
    default_branch: string;
    pushed_at: string | null;
  };

  if (!repoData.parent) {
    return { behindBy: 0, aheadBy: 0, upstreamRepo: "(not a fork)", lastPush: repoData.pushed_at };
  }

  const upstream = repoData.parent.full_name;
  const upstreamOwner = upstream.split("/")[0];
  const forkOwner = repo.split("/")[0];
  const base = repoData.parent.default_branch;
  const head = repoData.default_branch;

  const cmpRes = await fetch(
    `${GH}/repos/${repo}/compare/${upstreamOwner}:${base}...${forkOwner}:${head}`,
    { headers: headers(token) },
  );
  if (!cmpRes.ok) throw new Error(`GitHub compare: ${cmpRes.status}`);
  const cmp = (await cmpRes.json()) as {
    behind_by?: number;
    ahead_by?: number;
    status?: string;
    total_commits?: number;
  };

  let behindBy = cmp.behind_by ?? 0;
  let aheadBy = cmp.ahead_by ?? 0;
  if (
    (behindBy === 0 && aheadBy === 0) &&
    cmp.status &&
    cmp.status !== "identical" &&
    typeof cmp.total_commits === "number" &&
    cmp.total_commits > 0
  ) {
    if (cmp.status === "behind") {
      behindBy = cmp.total_commits;
    } else if (cmp.status === "ahead") {
      aheadBy = cmp.total_commits;
    }
  }

  return {
    behindBy,
    aheadBy,
    upstreamRepo: upstream,
    lastPush: repoData.pushed_at,
  };
}

/** Read `version` from `package.json` at any commit/branch ref (same tree the builder bakes at build time). */
export async function fetchPackageJsonVersion(
  token: string,
  forkRepo: string,
  ref: string,
): Promise<string | null> {
  const pkgRes = await fetch(
    `${GH}/repos/${forkRepo}/contents/package.json?ref=${encodeURIComponent(ref.trim())}`,
    { headers: headers(token) },
  );
  if (!pkgRes.ok) return null;
  const raw = (await pkgRes.json()) as {
    content?: string;
    encoding?: string;
  };
  if (!raw.content || raw.encoding !== "base64") return null;
  try {
    const json = JSON.parse(
      Buffer.from(raw.content, "base64").toString("utf8"),
    ) as { version?: string };
    return typeof json.version === "string" ? json.version : null;
  } catch {
    return null;
  }
}

/** Same semver rules as `ycode-masjidweb/lib/updates/check-updates.ts`. */
export function compareVersions(a: string, b: string): number {
  const aParts = a.split(".").map(Number);
  const bParts = b.split(".").map(Number);
  for (let i = 0; i < Math.max(aParts.length, bParts.length); i++) {
    const aNum = aParts[i] || 0;
    const bNum = bParts[i] || 0;
    if (aNum > bNum) return 1;
    if (aNum < bNum) return -1;
  }
  return 0;
}

export interface ReleaseSemverVsFork {
  latestReleaseVersion: string | null;
  forkPackageVersion: string | null;
  /** Git branch (or ref) used to read `package.json` for semver (production deploy branch, not necessarily the repo default). */
  packageJsonRefUsed: string;
  /** True when latest GitHub Release tag is newer than `version` in fork package.json (matches tenant Settings → Updates). */
  releaseAheadOfForkPackage: boolean;
  releaseUrl: string | null;
}

/**
 * Compare latest upstream **GitHub Release** semver to the fork’s **package.json** on the branch you deploy
 * (e.g. `main`). If `packageJsonRef` is omitted, uses the fork’s GitHub default branch — which often
 * does **not** match Netlify production and makes the admin look “up to date” while tenants still show
 * “Update available”.
 */
export async function getReleaseSemverVsFork(
  token: string,
  forkRepo: string,
  /** Branch/ref for `package.json` (e.g. `main`). Omit to use the repo default branch. */
  packageJsonRef?: string,
): Promise<ReleaseSemverVsFork> {
  const refDesired = packageJsonRef?.trim();
  let latestReleaseVersion: string | null = null;
  let forkPackageVersion: string | null = null;
  let releaseUrl: string | null = null;
  let packageJsonRefUsed = refDesired || "main";

  try {
    const metaRes = await fetch(`${GH}/repos/${forkRepo}`, {
      headers: headers(token),
    });
    if (!metaRes.ok) {
      return {
        latestReleaseVersion: null,
        forkPackageVersion: null,
        packageJsonRefUsed: refDesired || "main",
        releaseAheadOfForkPackage: false,
        releaseUrl: null,
      };
    }
    const meta = (await metaRes.json()) as { default_branch?: string };
    const defaultBranch = (meta.default_branch || "main").trim();
    const branch = (packageJsonRef?.trim() || defaultBranch).trim();
    packageJsonRefUsed = branch;

    forkPackageVersion = await fetchPackageJsonVersion(token, forkRepo, branch);

    const relRes = await fetch(
      `${GH}/repos/${YCODE_UPSTREAM_REPO}/releases/latest`,
      { headers: headers(token) },
    );
    if (relRes.ok) {
      const rel = (await relRes.json()) as {
        tag_name?: string;
        html_url?: string;
      };
      latestReleaseVersion =
        rel.tag_name?.replace(/^v/, "")?.trim() || null;
      releaseUrl = rel.html_url ?? null;
    }
  } catch {
    return {
      latestReleaseVersion: null,
      forkPackageVersion: null,
      packageJsonRefUsed: refDesired || "main",
      releaseAheadOfForkPackage: false,
      releaseUrl: null,
    };
  }

  const releaseAheadOfForkPackage = Boolean(
    latestReleaseVersion &&
      forkPackageVersion &&
      compareVersions(latestReleaseVersion, forkPackageVersion) > 0,
  );

  return {
    latestReleaseVersion,
    forkPackageVersion,
    packageJsonRefUsed,
    releaseAheadOfForkPackage,
    releaseUrl,
  };
}

// ── Sync fork ────────────────────────────────────────────────────────────────

export interface SyncForkResult {
  merged: boolean;
  message: string;
  /** Fork branch GitHub merged upstream into (merge-upstream API). */
  branch?: string;
  httpStatus?: number;
  /** Open in browser: fork base vs upstream head (conflict triage). */
  compareUrl?: string;
}

function upstreamCompareUrl(
  forkRepo: string,
  forkBranch: string,
  parent?: { full_name: string; default_branch: string },
): string | undefined {
  if (!parent?.full_name) return undefined;
  const headRef = `${parent.full_name.replace("/", ":")}:${parent.default_branch}`;
  return `https://github.com/${forkRepo}/compare/${forkBranch}...${headRef}`;
}

export async function syncForkFromUpstream(
  token: string,
  repo: string,
  branchOverride?: string,
): Promise<SyncForkResult> {
  const metaRes = await fetch(`${GH}/repos/${repo}`, {
    headers: headers(token),
  });
  if (!metaRes.ok) {
    return {
      merged: false,
      message: `Cannot read fork repo (${metaRes.status}). Check GITHUB_REPO and token access.`,
    };
  }
  const meta = (await metaRes.json()) as {
    default_branch?: string;
    parent?: { full_name: string; default_branch: string };
  };
  const branch = (branchOverride || meta.default_branch || "main").trim();
  const compareUrl = upstreamCompareUrl(repo, branch, meta.parent);

  const res = await fetch(`${GH}/repos/${repo}/merge-upstream`, {
    method: "POST",
    headers: { ...headers(token), "Content-Type": "application/json" },
    body: JSON.stringify({ branch }),
  });

  const data = (await res.json()) as { merge_type?: string; message?: string };

  if (res.status === 409) {
    return {
      merged: false,
      message: data.message ?? "Merge conflict — resolve manually on GitHub.",
      branch,
      httpStatus: 409,
      compareUrl,
    };
  }
  if (!res.ok) {
    return {
      merged: false,
      message: `GitHub sync failed: ${res.status} ${data.message ?? ""}`,
      branch,
      httpStatus: res.status,
      compareUrl,
    };
  }

  return {
    merged: true,
    message: data.merge_type === "fast-forward"
      ? "Fast-forwarded to latest upstream."
      : data.message ?? "Merged upstream changes.",
    branch,
    httpStatus: res.status,
    compareUrl,
  };
}

// ── Pull requests ────────────────────────────────────────────────────────────

export interface SyncPR {
  number: number;
  title: string;
  base: string;
  state: string;
  createdAt: string;
  isDraft: boolean;
  labels: string[];
  /** false = branch has merge conflicts with base */
  mergeable: boolean | null;
  /** GitHub: clean | unstable | dirty | blocked | unknown */
  mergeableState: string | null;
  ciStatus: "success" | "failure" | "pending" | "unknown";
  htmlUrl: string;
}

/** Default: MasjidWeb v2 builder line (`main`). Override with `GITHUB_SYNC_PR_BASES` if you add more base branches. */
export const DEFAULT_SYNC_PR_BASE_BRANCHES = ["main"] as const;

export async function listSyncPRs(
  token: string,
  repo: string,
  /** If omitted, uses {@link DEFAULT_SYNC_PR_BASE_BRANCHES}. */
  baseBranches?: string[],
): Promise<SyncPR[]> {
  const branches =
    baseBranches && baseBranches.length > 0
      ? baseBranches
      : [...DEFAULT_SYNC_PR_BASE_BRANCHES];
  const prs: SyncPR[] = [];

  for (const base of branches) {
    const res = await fetch(
      `${GH}/repos/${repo}/pulls?base=${base}&state=open&per_page=5`,
      { headers: headers(token) },
    );
    if (!res.ok) continue;
    const list = (await res.json()) as {
      number: number;
      title: string;
      base: { ref: string };
      state: string;
      draft?: boolean;
      labels?: { name?: string }[];
      created_at: string;
      mergeable: boolean | null;
      mergeable_state?: string | null;
      head: { sha: string };
      html_url: string;
    }[];

    for (const pr of list) {
      const detailRes = await fetch(`${GH}/repos/${repo}/pulls/${pr.number}`, {
        headers: headers(token),
      });
      let mergeable = pr.mergeable;
      let mergeableState: string | null = pr.mergeable_state ?? null;
      let headSha = pr.head.sha;
      if (detailRes.ok) {
        const d = (await detailRes.json()) as {
          mergeable: boolean | null;
          mergeable_state?: string | null;
          head: { sha: string };
        };
        mergeable = d.mergeable;
        mergeableState = d.mergeable_state ?? null;
        headSha = d.head.sha;
      }
      const ci = await getHeadCheckStatus(token, repo, headSha);
      prs.push({
        number: pr.number,
        title: pr.title,
        base: pr.base.ref,
        state: pr.state,
        createdAt: pr.created_at,
        isDraft: pr.draft === true,
        labels: (pr.labels ?? []).map((label) => label.name).filter((label): label is string => Boolean(label)),
        mergeable,
        mergeableState,
        ciStatus: ci,
        htmlUrl: pr.html_url,
      });
    }
  }

  return prs;
}

async function getHeadCheckStatus(
  token: string,
  repo: string,
  sha: string,
): Promise<"success" | "failure" | "pending" | "unknown"> {
  const res = await fetch(
    `${GH}/repos/${repo}/commits/${sha}/check-runs`,
    { headers: headers(token) },
  );
  if (!res.ok) return "unknown";
  const data = (await res.json()) as {
    total_count: number;
    check_runs: { conclusion: string | null; status: string }[];
  };
  if (data.total_count > 0) {
    const hasFailure = data.check_runs.some((c) => c.conclusion === "failure");
    if (hasFailure) return "failure";

    const allDone = data.check_runs.every((c) => c.status === "completed");
    return allDone ? "success" : "pending";
  }

  const stRes = await fetch(
    `${GH}/repos/${repo}/commits/${sha}/status`,
    { headers: headers(token) },
  );
  if (!stRes.ok) return "pending";
  const st = (await stRes.json()) as {
    state?: string;
    statuses?: { state?: string }[];
  };
  const state = st.state;
  if (state === "success") return "success";
  if (state === "failure" || state === "error") return "failure";
  if (state === "pending") return "pending";
  return "pending";
}

export async function getCommitCiStatus(
  token: string,
  repo: string,
  sha: string,
): Promise<"success" | "failure" | "pending" | "unknown"> {
  return getHeadCheckStatus(token, repo, sha);
}

// ── Merge PR ─────────────────────────────────────────────────────────────────

export async function mergePR(
  token: string,
  repo: string,
  prNumber: number,
): Promise<{ merged: boolean; message: string }> {
  const res = await fetch(`${GH}/repos/${repo}/pulls/${prNumber}/merge`, {
    method: "PUT",
    headers: { ...headers(token), "Content-Type": "application/json" },
    body: JSON.stringify({ merge_method: "merge" }),
  });
  const data = (await res.json()) as { merged?: boolean; message?: string };

  return {
    merged: data.merged ?? false,
    message: data.message ?? (res.ok ? "PR merged." : `Merge failed: ${res.status}`),
  };
}

export type MergeHeadIntoBaseResult =
  | { status: "merged"; sha: string; message: string }
  | { status: "already_up_to_date"; message: string }
  | { status: "conflict"; message: string }
  | { status: "error"; message: string; httpStatus: number };

export interface EnsureMergePRResult {
  ok: boolean;
  number?: number;
  htmlUrl?: string;
  created?: boolean;
  message: string;
}

export interface ConflictIssueResult {
  ok: boolean;
  issueUrl?: string;
  number?: number;
  message: string;
}

export interface PullRequestMergeState {
  number: number;
  mergeable: boolean | null;
  mergeableState: string | null;
  headSha: string;
  htmlUrl: string;
}

/** Merge branch `head` into `base` via GitHub merge API (no PR). */
export async function mergeHeadIntoBase(
  token: string,
  repo: string,
  base: string,
  head: string,
  commitMessage: string,
): Promise<MergeHeadIntoBaseResult> {
  const res = await fetch(`${GH}/repos/${repo}/merges`, {
    method: "POST",
    headers: { ...headers(token), "Content-Type": "application/json" },
    body: JSON.stringify({
      base: base.trim(),
      head: head.trim(),
      commit_message: commitMessage,
    }),
  });

  if (res.status === 201) {
    const data = (await res.json()) as { sha?: string };
    return {
      status: "merged",
      sha: data.sha ?? "",
      message: `Merged ${head} into ${base}.`,
    };
  }

  if (res.status === 204) {
    return {
      status: "already_up_to_date",
      message: `${base} already includes everything from ${head}.`,
    };
  }

  if (res.status === 409) {
    let msg = "Merge conflict.";
    try {
      const data = (await res.json()) as { message?: string };
      if (data.message) msg = data.message;
    } catch {
      /* ignore */
    }
    return { status: "conflict", message: msg };
  }

  const text = await res.text();
  return {
    status: "error",
    message: text.slice(0, 500) || `GitHub merges API: ${res.status}`,
    httpStatus: res.status,
  };
}

/**
 * Ensure there is an open PR from `head` to `base`.
 * Used as a durable fallback path when direct merge API hits conflicts.
 */
export async function ensureMergePR(
  token: string,
  repo: string,
  head: string,
  base: string,
  title: string,
  body: string,
): Promise<EnsureMergePRResult> {
  const [owner] = repo.split("/");
  const headRef = `${owner}:${head.trim()}`;
  const baseRef = base.trim();

  const existingRes = await fetch(
    `${GH}/repos/${repo}/pulls?state=open&base=${encodeURIComponent(baseRef)}&head=${encodeURIComponent(headRef)}`,
    { headers: headers(token) },
  );
  if (!existingRes.ok) {
    return {
      ok: false,
      message: `Could not list open PRs (${existingRes.status}).`,
    };
  }

  const existing = (await existingRes.json()) as Array<{
    number: number;
    html_url: string;
  }>;
  if (existing.length > 0) {
    const pr = existing[0];
    return {
      ok: true,
      number: pr.number,
      htmlUrl: pr.html_url,
      created: false,
      message: `Using existing PR #${pr.number}.`,
    };
  }

  const createRes = await fetch(`${GH}/repos/${repo}/pulls`, {
    method: "POST",
    headers: { ...headers(token), "Content-Type": "application/json" },
    body: JSON.stringify({
      title,
      head: head.trim(),
      base: baseRef,
      body,
      maintainer_can_modify: true,
    }),
  });

  if (!createRes.ok) {
    const txt = await createRes.text();
    return {
      ok: false,
      message: `Could not create merge PR (${createRes.status}): ${txt.slice(0, 300)}`,
    };
  }

  const created = (await createRes.json()) as {
    number: number;
    html_url: string;
  };
  return {
    ok: true,
    number: created.number,
    htmlUrl: created.html_url,
    created: true,
    message: `Created PR #${created.number}.`,
  };
}

/** Create (or reuse) an open tracking issue for auto-update conflicts. */
export async function createOrUpdateConflictIssue(
  token: string,
  repo: string,
  productionBranch: string,
  details: {
    prUrl?: string;
    compareUrl?: string;
    error: string;
  },
): Promise<ConflictIssueResult> {
  const label = "auto-update-conflict";
  const title = `Auto update conflict: main -> ${productionBranch}`;

  const listRes = await fetch(
    `${GH}/repos/${repo}/issues?state=open&labels=${encodeURIComponent(label)}&per_page=30`,
    { headers: headers(token) },
  );
  if (!listRes.ok) {
    return {
      ok: false,
      message: `Could not list conflict issues (${listRes.status}).`,
    };
  }

  const existing = (await listRes.json()) as Array<{
    number: number;
    title: string;
    html_url: string;
  }>;
  const match = existing.find((i) => i.title === title);
  if (match) {
    return {
      ok: true,
      issueUrl: match.html_url,
      number: match.number,
      message: `Using existing issue #${match.number}.`,
    };
  }

  const bodyLines = [
    "Created automatically by Admin Dashboard while running Apply YCode update.",
    "",
    `Conflict while merging \`main\` into \`${productionBranch}\`.`,
    "",
    `Error: ${details.error}`,
    details.prUrl ? `Conflict PR: ${details.prUrl}` : "",
    details.compareUrl ? `Compare: ${details.compareUrl}` : "",
  ].filter(Boolean);

  const createRes = await fetch(`${GH}/repos/${repo}/issues`, {
    method: "POST",
    headers: { ...headers(token), "Content-Type": "application/json" },
    body: JSON.stringify({
      title,
      body: bodyLines.join("\n"),
      labels: [label],
    }),
  });

  if (!createRes.ok) {
    const txt = await createRes.text();
    return {
      ok: false,
      message: `Could not create issue (${createRes.status}): ${txt.slice(0, 250)}`,
    };
  }

  const created = (await createRes.json()) as {
    number: number;
    html_url: string;
  };
  return {
    ok: true,
    number: created.number,
    issueUrl: created.html_url,
    message: `Created issue #${created.number}.`,
  };
}

export async function getPullRequestMergeState(
  token: string,
  repo: string,
  prNumber: number,
): Promise<PullRequestMergeState | null> {
  const res = await fetch(`${GH}/repos/${repo}/pulls/${prNumber}`, {
    headers: headers(token),
  });
  if (!res.ok) return null;

  const pr = (await res.json()) as {
    number: number;
    mergeable: boolean | null;
    mergeable_state: string | null;
    html_url: string;
    head?: { sha?: string };
  };
  if (!pr.head?.sha) return null;
  return {
    number: pr.number,
    mergeable: pr.mergeable,
    mergeableState: pr.mergeable_state,
    headSha: pr.head.sha,
    htmlUrl: pr.html_url,
  };
}
