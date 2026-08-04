/**
 * The GitHub side of publishing: stage a raw upload, ask Actions to ingest it,
 * and read/write small committed files.
 *
 * Two rules from the spec are enforced here rather than trusted to callers:
 *
 * - **Raws never enter the repo.** A raw is uploaded as an asset on a release,
 *   which lives outside the git tree — nothing is committed, so nothing enters
 *   history. `deleteAsset` is what the ingest run calls when it is done.
 * - **The token never leaves the Worker.** It is a parameter here and a secret
 *   binding there; no function in this module returns it or echoes it into a
 *   response.
 *
 * `fetch` is injected so the whole module is testable without the network.
 */
export type GitHubConfig = {
  owner: string
  repo: string
  token: string
  fetch?: typeof fetch
}

/** The release that holds in-flight uploads. Never shown to anyone. */
export const STAGING_TAG = 'staging-uploads'

const api = 'https://api.github.com'

class GitHubError extends Error {
  constructor(readonly status: number, message: string) {
    // The upstream body is deliberately not interpolated: it can echo request
    // content, and this message reaches a log.
    super(`github ${status}: ${message}`)
  }
}

async function call(
  cfg: GitHubConfig,
  path: string,
  init: RequestInit & { raw?: BodyInit } = {},
): Promise<unknown> {
  const f = cfg.fetch ?? fetch
  const res = await f(path.startsWith('http') ? path : `${api}${path}`, {
    ...init,
    headers: {
      accept: 'application/vnd.github+json',
      authorization: `Bearer ${cfg.token}`,
      'user-agent': 'severedarchive-admin',
      'x-github-api-version': '2022-11-28',
      ...init.headers,
    },
  })
  if (!res.ok) throw new GitHubError(res.status, res.statusText)
  if (res.status === 204) return null
  const text = await res.text()
  return text ? JSON.parse(text) : null
}

type Release = { id: number; upload_url: string }

/**
 * The staging release, created on first use. Draft, so it never appears on the
 * repo's releases page — this is a scratch area, not a publication.
 */
export async function ensureStagingRelease(cfg: GitHubConfig): Promise<Release> {
  try {
    return (await call(cfg, `/repos/${cfg.owner}/${cfg.repo}/releases/tags/${STAGING_TAG}`)) as Release
  } catch (err) {
    if (!(err instanceof GitHubError) || err.status !== 404) throw err
  }
  return (await call(cfg, `/repos/${cfg.owner}/${cfg.repo}/releases`, {
    method: 'POST',
    body: JSON.stringify({
      tag_name: STAGING_TAG,
      name: 'Staging uploads (transient)',
      body: 'Raw uploads awaiting transcode. Assets here are deleted by the ingest run. Nothing in this release is committed.',
      draft: true,
      prerelease: true,
    }),
  })) as Release
}

export type StagedAsset = { id: number; url: string; name: string }

/** Uploads the raw and returns the asset the ingest run will download and delete. */
export async function stageRaw(
  cfg: GitHubConfig,
  name: string,
  body: ArrayBuffer,
  contentType: string,
): Promise<StagedAsset> {
  const release = await ensureStagingRelease(cfg)
  const upload = release.upload_url.replace(/\{.*\}$/, '')
  const asset = (await call(cfg, `${upload}?name=${encodeURIComponent(name)}`, {
    method: 'POST',
    headers: { 'content-type': contentType },
    body,
  })) as { id: number; url: string; name: string }
  return { id: asset.id, url: asset.url, name: asset.name }
}

export async function deleteAsset(cfg: GitHubConfig, assetId: number): Promise<void> {
  await call(cfg, `/repos/${cfg.owner}/${cfg.repo}/releases/assets/${assetId}`, { method: 'DELETE' })
}

/**
 * Hands the work to Actions. The Worker does no transcoding and holds no
 * media — it says "this asset, these fields" and stops.
 */
export async function dispatchIngest(
  cfg: GitHubConfig,
  payload: Record<string, unknown>,
): Promise<void> {
  await call(cfg, `/repos/${cfg.owner}/${cfg.repo}/dispatches`, {
    method: 'POST',
    body: JSON.stringify({ event_type: 'ingest-media', client_payload: payload }),
  })
}

/**
 * The same hand-off for an edit or a removal.
 *
 * A separate event type rather than a flag on the ingest one, because the two
 * runs do different work under different concurrency: an edit may have no file
 * at all, and a removal deletes committed renditions. Sharing the workflow would
 * mean a job that branches on payload shape before it knows if it has a file.
 */
export async function dispatchEdit(
  cfg: GitHubConfig,
  payload: Record<string, unknown>,
): Promise<void> {
  await call(cfg, `/repos/${cfg.owner}/${cfg.repo}/dispatches`, {
    method: 'POST',
    body: JSON.stringify({ event_type: 'edit-media', client_payload: payload }),
  })
}

export type CommittedFile = { content: string; sha: string }

export async function readFile(cfg: GitHubConfig, path: string, ref = 'main'): Promise<CommittedFile | null> {
  try {
    const res = (await call(
      cfg, `/repos/${cfg.owner}/${cfg.repo}/contents/${path}?ref=${ref}`,
    )) as { content: string; sha: string; encoding: string }
    const content = res.encoding === 'base64'
      ? new TextDecoder().decode(Uint8Array.from(atob(res.content.replace(/\n/g, '')), (c) => c.charCodeAt(0)))
      : res.content
    return { content, sha: res.sha }
  } catch (err) {
    if (err instanceof GitHubError && err.status === 404) return null
    throw err
  }
}

/**
 * Writes a small text file. `sha` is required for an update and must be the one
 * just read: GitHub rejects a stale sha, which is what stops two admin sessions
 * from silently overwriting each other's edits.
 */
export async function writeFile(
  cfg: GitHubConfig,
  path: string,
  content: string,
  message: string,
  sha?: string,
): Promise<void> {
  await call(cfg, `/repos/${cfg.owner}/${cfg.repo}/contents/${path}`, {
    method: 'PUT',
    body: JSON.stringify({
      message,
      content: btoa(String.fromCharCode(...new TextEncoder().encode(content))),
      ...(sha ? { sha } : {}),
    }),
  })
}

export { GitHubError }
