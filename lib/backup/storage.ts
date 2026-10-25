import { getVercelOidcToken } from "@vercel/oidc";
import { BackupError, MAX_BACKUP_BYTES, md5 } from "./format";

export function backupConfig() {
  const bucket = process.env.GCP_BACKUP_BUCKET || "";
  const projectNumber = process.env.GCP_BACKUP_PROJECT_NUMBER || "";
  const account = process.env.GCP_BACKUP_SERVICE_ACCOUNT || "";
  const pool = process.env.GCP_BACKUP_POOL || "";
  const provider = process.env.GCP_BACKUP_PROVIDER || "";
  if (
    !/^[a-z0-9][a-z0-9.-]{2,220}$/.test(bucket) ||
    !/^\d+$/.test(projectNumber) ||
    !/^[a-z0-9-]+@[a-z0-9-]+\.iam\.gserviceaccount\.com$/.test(account) ||
    !/^[a-z0-9-]+$/.test(pool) ||
    !/^[a-z0-9-]+$/.test(provider)
  )
    return null;
  return { bucket, projectNumber, account, pool, provider };
}
export type StoredObject = {
  name: string;
  size: number;
  md5: string;
  generation: string;
};
export type BackupStorage = {
  metadata(name: string): Promise<StoredObject | null>;
  listPhotos(): Promise<StoredObject[]>;
  put(name: string, bytes: Buffer, contentType: string): Promise<StoredObject>;
  get(name: string): Promise<Buffer>;
};
export async function cloudBackupStorage(): Promise<BackupStorage> {
  const config = backupConfig();
  if (!config)
    throw new BackupError(
      "not_configured",
      "Falta conectar el almacenamiento privado de Google Cloud.",
    );
  const oidc = await getVercelOidcToken().catch(() => {
    throw new BackupError("identity_unavailable");
  });
  const tokenResponse = await fetch("https://sts.googleapis.com/v1/token", {
    method: "POST",
    cache: "no-store",
    signal: AbortSignal.timeout(20000),
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      audience: `//iam.googleapis.com/projects/${config.projectNumber}/locations/global/workloadIdentityPools/${config.pool}/providers/${config.provider}`,
      grantType: "urn:ietf:params:oauth:grant-type:token-exchange",
      requestedTokenType: "urn:ietf:params:oauth:token-type:access_token",
      scope: "https://www.googleapis.com/auth/cloud-platform",
      subjectTokenType: "urn:ietf:params:oauth:token-type:jwt",
      subjectToken: oidc,
    }),
  });
  if (!tokenResponse.ok) throw new BackupError("federation_failed");
  const { access_token: stsToken } = await tokenResponse.json();
  const accountResponse = await fetch(
    `https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/${config.account}:generateAccessToken`,
    {
      method: "POST",
      cache: "no-store",
      signal: AbortSignal.timeout(20000),
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${stsToken}`,
      },
      body: JSON.stringify({
        scope: ["https://www.googleapis.com/auth/devstorage.read_write"],
        lifetime: "900s",
      }),
    },
  );
  if (!accountResponse.ok) throw new BackupError("service_identity_failed");
  const { accessToken } = await accountResponse.json();
  if (typeof accessToken !== "string" || !accessToken)
    throw new BackupError("service_identity_failed");
  const root = `https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(config.bucket)}/o`;
  const request = async (url: string, init: RequestInit = {}) =>
    fetch(url, {
      ...init,
      cache: "no-store",
      signal: AbortSignal.timeout(30000),
      headers: { ...init.headers, Authorization: `Bearer ${accessToken}` },
    });
  const object = (r: {
    name: string;
    size: string;
    md5Hash: string;
    generation: string;
  }): StoredObject => ({
    name: r.name,
    size: Number(r.size),
    md5: r.md5Hash,
    generation: r.generation,
  });
  function allowed(name: string) {
    if (
      !/^(?:database|reports)\/[a-zA-Z0-9_.-]+\.json(?:\.gz)?$/.test(name) &&
      !/^photos\/[a-f0-9]{64}\.jpg$/.test(name)
    )
      throw new BackupError("invalid_object");
  }
  return {
    async metadata(name) {
      allowed(name);
      const response = await request(`${root}/${encodeURIComponent(name)}`);
      if (response.status === 404) return null;
      if (!response.ok) throw new BackupError("storage_read_failed");
      return object(await response.json());
    },
    async listPhotos() {
      const all: StoredObject[] = [];
      let next = "";
      do {
        const params = new URLSearchParams({
          prefix: "photos/",
          maxResults: "1000",
          fields: "items(name,size,md5Hash,generation),nextPageToken",
        });
        if (next) params.set("pageToken", next);
        const response = await request(`${root}?${params}`);
        if (!response.ok) throw new BackupError("storage_list_failed");
        const data = await response.json();
        all.push(...(data.items || []).map(object));
        next = data.nextPageToken || "";
        if (all.length > 20000) throw new BackupError("photo_count_limit");
      } while (next);
      return all;
    },
    async put(name, bytes, contentType) {
      allowed(name);
      if (bytes.length > MAX_BACKUP_BYTES)
        throw new BackupError("object_too_large");
      const params = new URLSearchParams({
        uploadType: "media",
        name,
        ifGenerationMatch: "0",
      });
      const response = await request(
        `https://storage.googleapis.com/upload/storage/v1/b/${encodeURIComponent(config.bucket)}/o?${params}`,
        {
          method: "POST",
          headers: { "Content-Type": contentType, "Content-MD5": md5(bytes) },
          body: new Uint8Array(bytes),
        },
      );
      if (!response.ok)
        throw new BackupError(
          response.status === 412
            ? "object_already_exists"
            : "storage_write_failed",
        );
      const stored = object(await response.json());
      if (stored.md5 !== md5(bytes) || stored.size !== bytes.length)
        throw new BackupError("upload_checksum_mismatch");
      return stored;
    },
    async get(name) {
      allowed(name);
      const response = await request(
        `${root}/${encodeURIComponent(name)}?alt=media`,
      );
      if (!response.ok) throw new BackupError("storage_download_failed");
      const parts: Uint8Array[] = [];
      let total = 0;
      if (!response.body) throw new BackupError("empty_object");
      const reader = response.body.getReader();
      try {
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          total += value.byteLength;
          if (total > MAX_BACKUP_BYTES)
            throw new BackupError("object_too_large");
          parts.push(value);
        }
      } finally {
        await reader.cancel();
      }
      return Buffer.concat(parts);
    },
  };
}
