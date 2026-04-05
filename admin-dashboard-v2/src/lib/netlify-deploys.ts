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

  const siteRes = await fetch(`${API}/sites/${siteId}`, {
    headers: authHeaders(token),
  });
  const site = siteRes.ok
    ? ((await siteRes.json()) as { published_deploy?: { id: string } })
    : null;
  const currentDeployId = site?.published_deploy?.id ?? null;

  const deploys = (await res.json()) as {
    id: string;
    state: string;
    title: string | null;
    commit_ref: string | null;
    branch: string | null;
    created_at: string;
    published_at: string | null;
    deploy_ssl_url: string;
  }[];

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

/** Netlify returns deploys newest-first; find the first `ready` deploy older than the live one. */
export function findPreviousReadyDeploy(deploys: DeployInfo[]): DeployInfo | undefined {
  const curIdx = deploys.findIndex((d) => d.isCurrent);
  if (curIdx < 0) return undefined;
  for (let i = curIdx + 1; i < deploys.length; i++) {
    if (deploys[i].state === "ready") return deploys[i];
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
