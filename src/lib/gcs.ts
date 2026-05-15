import { Storage } from "@google-cloud/storage";

const gcsProjectId = process.env.GCS_PROJECT_ID?.trim();
const gcsBucketName = process.env.GCS_BUCKET_NAME?.trim();
const gcsClientEmail = process.env.GCS_CLIENT_EMAIL?.trim();
const gcsPrivateKey = process.env.GCS_PRIVATE_KEY?.replace(/\\n/g, "\n");

let storageInstance: Storage | null = null;

function createStorageClient(): Storage {
  if (gcsClientEmail && gcsPrivateKey) {
    return new Storage({
      projectId: gcsProjectId,
      credentials: {
        client_email: gcsClientEmail,
        private_key: gcsPrivateKey,
      },
    });
  }

  // Fallback ADC: local gcloud auth or runtime service account.
  return new Storage({ projectId: gcsProjectId });
}

export function getGcsBucketName(): string {
  if (!gcsBucketName) {
    throw new Error("GCS_BUCKET_NAME est requis.");
  }
  return gcsBucketName;
}

export function getGcsStorage(): Storage {
  if (storageInstance) return storageInstance;
  storageInstance = createStorageClient();
  return storageInstance;
}

export function getGcsBucket() {
  const storage = getGcsStorage();
  return storage.bucket(getGcsBucketName());
}

export function sanitizeFileName(raw: string): string {
  const value = raw.trim();
  if (!value) return "file.bin";
  return value.replace(/[^a-zA-Z0-9._-]/g, "_");
}

export function sanitizeFolder(raw?: string): string {
  if (!raw) return "uploads";
  return raw
    .trim()
    .replace(/^\/+|\/+$/g, "")
    .replace(/[^a-zA-Z0-9/_-]/g, "_");
}

export function toGcsPublicUrl(bucketName: string, objectKey: string): string {
  const encoded = objectKey
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/");
  return `https://storage.googleapis.com/${bucketName}/${encoded}`;
}
