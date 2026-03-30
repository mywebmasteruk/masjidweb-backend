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
