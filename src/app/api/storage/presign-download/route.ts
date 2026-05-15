import { NextResponse } from "next/server";
import { getGcsBucket, sanitizeFileName } from "@/lib/gcs";

type DownloadBody = {
  objectKey?: string;
  downloadName?: string;
  expiresInMinutes?: number;
};

export async function POST(request: Request) {
  let body: DownloadBody;
  try {
    body = (await request.json()) as DownloadBody;
  } catch {
    return NextResponse.json({ error: "JSON invalide" }, { status: 400 });
  }

  const objectKey = (body.objectKey ?? "").trim().replace(/^\/+/, "");
  if (!objectKey) {
    return NextResponse.json({ error: "Champ objectKey requis" }, { status: 400 });
  }

  const downloadName = body.downloadName ? sanitizeFileName(body.downloadName) : undefined;
  const ttlMinutes = Math.min(Math.max(body.expiresInMinutes ?? 10, 1), 60);

  try {
    const bucket = getGcsBucket();
    const [downloadUrl] = await bucket.file(objectKey).getSignedUrl({
      version: "v4",
      action: "read",
      expires: Date.now() + ttlMinutes * 60_000,
      responseDisposition: downloadName ? `attachment; filename="${downloadName}"` : undefined,
    });

    return NextResponse.json({
      downloadUrl,
      expiresInMinutes: ttlMinutes,
      objectKey,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erreur GCS";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
