const API = "https://api.netlify.com/api/v1";

function authHeaders(token: string): HeadersInit {
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
}

export interface DeployInfo {
  id: string;
  state: string;
  title: string | null;
  commitRef: string | null;
  branch: string | null;
  createdAt: string;
  publishedAt: string | null;
  deployUrl: string;
  isCurrent: boolean;
}

type NetlifyDeployRow = {
  id: string;
  state: string;
  title: string | null;
  commit_ref: string | null;
  branch: string | null;
  created_at: string;
  published_at: string | null;
  deploy_ssl_url: string;
};

async function fetchCurrentDeployId(
  token: string,
  siteId: string,
): Promise<string | null> {
  const siteRes = await fetch(`${API}/sites/${siteId}`, {
    headers: authHeaders(token),
  });
  if (!siteRes.ok) return null;
  const site = (await siteRes.json()) as { published_deploy?: { id: string } };
  return site.published_deploy?.id ?? null;
}

function mapDeployRows(
  deploys: NetlifyDeployRow[],
  currentDeployId: string | null,
): DeployInfo[] {
  return deploys.map((d) => ({
    id: d.id,
    state: d.state,
    title: d.title,
    commitRef: d.commit_ref,
    branch: d.branch,
    createdAt: d.created_at,
    publishedAt: d.published_at,
    deployUrl: d.deploy_ssl_url,
    isCurrent: d.id === currentDeployId,
  }));
}

export async function listRecentDeploys(
  token: string,
  siteId: string,
  limit = 10,
): Promise<DeployInfo[]> {
  const res = await fetch(
    `${API}/sites/${siteId}/deploys?per_page=${limit}`,
    { headers: authHeaders(token) },
  );
  if (!res.ok) throw new Error(`Netlify list deploys: ${res.status}`);

  const currentDeployId = await fetchCurrentDeployId(token, siteId);
  const deploys = (await res.json()) as NetlifyDeployRow[];
  return mapDeployRows(deploys, currentDeployId);
}

/** Paginate Netlify deploys and return ready builds from the production branch (newest first). */
export async function listProductionBranchDeploys(
  token: string,
  siteId: string,
  productionBranch: string,
  options?: { maxItems?: number; maxPages?: number },
): Promise<DeployInfo[]> {
  const maxItems = options?.maxItems ?? 50;
  const maxPages = options?.maxPages ?? 10;
  const perPage = 100;
  const branch = productionBranch.trim();
  const collected: DeployInfo[] = [];
  const currentDeployId = await fetchCurrentDeployId(token, siteId);

  for (let page = 1; page <= maxPages; page++) {
    const res = await fetch(
      `${API}/sites/${siteId}/deploys?per_page=${perPage}&page=${page}`,
      { headers: authHeaders(token) },
    );
    if (!res.ok) throw new Error(`Netlify list deploys: ${res.status}`);

    const rows = (await res.json()) as NetlifyDeployRow[];
    if (rows.length === 0) break;

    for (const deploy of mapDeployRows(rows, currentDeployId)) {
      if (deploy.state !== "ready") continue;
      if ((deploy.branch ?? "").trim() !== branch) continue;
      collected.push(deploy);
      if (collected.length >= maxItems) break;
    }

    if (collected.length >= maxItems) break;
    if (rows.length < perPage) break;
  }

  return collected;
}

export async function getDeployById(
  token: string,
  siteId: string,
  deployId: string,
): Promise<DeployInfo | null> {
  const res = await fetch(`${API}/sites/${siteId}/deploys/${deployId}`, {
    headers: authHeaders(token),
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Netlify get deploy: ${res.status}`);

  const currentDeployId = await fetchCurrentDeployId(token, siteId);
  const d = (await res.json()) as NetlifyDeployRow;
  return mapDeployRows([d], currentDeployId)[0] ?? null;
}

/** Netlify returns deploys newest-first; find the first `ready` deploy older than the live one. */
export function findPreviousReadyDeploy(deploys: DeployInfo[]): DeployInfo | undefined {
  const curIdx = deploys.findIndex((d) => d.isCurrent);
  if (curIdx < 0) return undefined;

  const current = deploys[curIdx];
  for (let i = curIdx + 1; i < deploys.length; i++) {
    if (deploys[i].state === "ready" && deploys[i].branch === current.branch) {
      return deploys[i];
    }
  }
  return undefined;
}

export async function publishDeploy(
  token: string,
  siteId: string,
  deployId: string,
): Promise<{ ok: boolean; message: string }> {
  const res = await fetch(
    `${API}/sites/${siteId}/deploys/${deployId}/restore`,
    { method: "POST", headers: authHeaders(token) },
  );
  if (!res.ok) {
    const text = await res.text();
    return { ok: false, message: `Rollback failed: ${res.status} ${text}` };
  }
  return { ok: true, message: "Deploy published. Site is now serving this version." };
}

/** Start a new production build from the linked Git branch (same as “Trigger deploy” in Netlify UI). */
export async function triggerProductionBuild(
  token: string,
  siteId: string,
  options?: { clearCache?: boolean },
): Promise<{ ok: boolean; message: string; buildId?: string }> {
  const body =
    options?.clearCache === true ? JSON.stringify({ clear_cache: true }) : "{}";
  const res = await fetch(`${API}/sites/${siteId}/builds`, {
    method: "POST",
    headers: authHeaders(token),
    body,
  });
  if (!res.ok) {
    const text = await res.text();
    return {
      ok: false,
      message: `Netlify could not start a build (${res.status}). ${text.slice(0, 300)}`,
    };
  }
  const data = (await res.json()) as { id?: string; deploy_id?: string };
  return {
    ok: true,
    message: options?.clearCache
      ? "Production build started (cache cleared)."
      : "Production build started.",
    buildId: data.id ?? data.deploy_id,
  };
}
