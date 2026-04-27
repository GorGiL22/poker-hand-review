import { NextResponse } from "next/server";

type InboxBody = {
  sourceFile?: string;
  text?: string;
  sourceRoom?: string;
};

/**
 * Réception des fichiers .txt envoyés par l’agent Electron (dev local).
 * Les mains ne sont pas encore fusionnées automatiquement dans l’UI : l’agent confirme l’envoi HTTP.
 * Si `PHR_WATCHER_TOKEN` est défini dans `.env.local`, l’en-tête `x-phr-watcher-token` doit correspondre.
 */
export async function POST(request: Request) {
  const expected = process.env.PHR_WATCHER_TOKEN?.trim();
  if (expected) {
    const got = request.headers.get("x-phr-watcher-token")?.trim() ?? "";
    if (got !== expected) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON invalide" }, { status: 400 });
  }

  const b = body as InboxBody;
  const text = typeof b.text === "string" ? b.text : "";
  if (!text.trim()) {
    return NextResponse.json({ error: "Champ text requis" }, { status: 400 });
  }

  return NextResponse.json({
    ok: true,
    receivedBytes: text.length,
    sourceFile: typeof b.sourceFile === "string" ? b.sourceFile : null,
  });
}
