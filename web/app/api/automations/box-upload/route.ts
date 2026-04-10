import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const WEBHOOK_SECRET = process.env.AUTOMATION_WEBHOOK_SECRET!;

export async function POST(request: NextRequest) {
  const secret = request.headers.get("x-automation-secret");
  if (secret !== WEBHOOK_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { files } = body as {
    files: { fileId: string; name: string; base64: string }[];
  };

  if (!files || files.length === 0) {
    return NextResponse.json({ error: "No files provided" }, { status: 400 });
  }

  const results: { fileId: string; name: string; url: string }[] = [];

  for (const file of files) {
    const binary = Uint8Array.from(atob(file.base64), (c) => c.charCodeAt(0));
    const storagePath = `${file.fileId}.jpg`;

    const { error } = await supabase.storage
      .from("box-files")
      .upload(storagePath, binary, {
        contentType: "image/jpeg",
        upsert: true,
      });

    if (error) {
      return NextResponse.json(
        { error: `Upload failed for ${file.fileId}: ${error.message}` },
        { status: 500 }
      );
    }

    const { data } = supabase.storage
      .from("box-files")
      .getPublicUrl(storagePath);

    results.push({
      fileId: file.fileId,
      name: file.name,
      url: data.publicUrl,
    });
  }

  return NextResponse.json({ files: results });
}
