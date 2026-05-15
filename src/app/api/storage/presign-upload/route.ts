import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import {
  getGcsBucket,
  getGcsBucketName,
  sanitizeFileName,
  sanitizeFolder,
  toGcsPublicUrl,
} from "@/lib/gcs";

type UploadBody = {
  filename?: string;
  contentType?: string;
  folder?: string;
  expiresInMinutes?: number;
};

export async function POST(request: Request) {
  let body: UploadBody;
  try {
    body = (await request.json()) as UploadBody;
  } catch {
    return NextResponse.json({ error: "JSON invalide" }, { status: 400 });
  }

  const filename = sanitizeFileName(body.filename ?? "");
  const contentType = (body.contentType ?? "application/octet-stream").trim();
  const folder = sanitizeFolder(body.folder);
  const ttlMinutes = Math.min(Math.max(body.expiresInMinutes ?? 15, 1), 60);
  const objectKey = `${folder}/${Date.now()}-${randomUUID()}-${filename}`;

  try {
    const bucket = getGcsBucket();
    const [uploadUrl] = await bucket.file(objectKey).getSignedUrl({
      version: "v4",
      action: "write",
      expires: Date.now() + ttlMinutes * 60_000,
      contentType,
    });

    return NextResponse.json({
      uploadUrl,
      method: "PUT",
      objectKey,
      bucket: getGcsBucketName(),
      contentType,
      expiresInMinutes: ttlMinutes,
      // Valable uniquement si l'objet est public ou servi derrière un proxy.
      publicUrl: toGcsPublicUrl(getGcsBucketName(), objectKey),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erreur GCS";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
