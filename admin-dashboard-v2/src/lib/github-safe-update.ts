const GH = "https://api.github.com";

function headers(token: string): HeadersInit {
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "Content-Type": "application/json",
  };
}

export async function dispatchSafeUpdateWorkflow(token: string, repo: string): Promise<void> {
  const res = await fetch(
    `${GH}/repos/${repo}/actions/workflows/sync-upstream.yml/dispatches`,
    {
      method: "POST",
      headers: headers(token),
      body: JSON.stringify({ ref: "main" }),
    },
  );

  if (!res.ok) {
    throw new Error(`GitHub workflow dispatch failed: ${res.status}`);
  }
}
