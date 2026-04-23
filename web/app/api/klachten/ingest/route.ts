import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Ingest endpoint voor klachten vanuit Zapier (Webhooks by Zapier → POST).
 *
 * Authenticatie: shared secret via `X-Webhook-Secret` header.
 * Idempotentie: upsert op `bron_referentie`.
 */

type ZapierPayload = {
  tables_record_id?: string;
  tables_created_at?: string;
  Email?: string;
  Categorie?: string;
  Onderwerp?: string;
  "Kun je je klacht nader toelichten?"?: string;
  Klachtnaam?: string;
  Naam?: string;
  Klantnaam?: string;
  "Reactie Front Office"?: string;
  Opgelost?: string | boolean;
  [key: string]: unknown;
};

function mapStatus(opgelost: unknown): string {
  if (opgelost === true) return "opgelost";
  if (typeof opgelost === "string") {
    const v = opgelost.toLowerCase().trim();
    if (v === "true" || v === "ja" || v === "1" || v === "yes") return "opgelost";
  }
  return "nieuw";
}

export async function POST(req: Request) {
  const expected = process.env.AUTOMATION_WEBHOOK_SECRET;
  if (!expected) {
    return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
  }

  const provided = req.headers.get("x-webhook-secret");
  if (provided !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let payload: ZapierPayload;
  try {
    payload = (await req.json()) as ZapierPayload;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const klantnaam = (payload.Klantnaam ?? "").toString().trim();
  const categorie = (payload.Categorie ?? "").toString().trim();
  const omschrijving = (payload["Kun je je klacht nader toelichten?"] ?? "").toString().trim();

  if (!klantnaam || !categorie || !omschrijving) {
    return NextResponse.json(
      {
        error: "Missing required fields",
        required: ["Klantnaam", "Categorie", "Kun je je klacht nader toelichten?"],
      },
      { status: 400 }
    );
  }

  const row = {
    bron_referentie: payload.tables_record_id ?? null,
    received_at: payload.tables_created_at ?? new Date().toISOString(),
    klantnaam,
    categorie,
    onderwerp:
      (payload.Onderwerp?.toString().trim() || payload.Klachtnaam?.toString().trim()) ?? null,
    omschrijving,
    naam: payload.Naam?.toString().trim() || null,
    email: payload.Email?.toString().trim() || null,
    reactie_front_office: payload["Reactie Front Office"]?.toString().trim() || null,
    status: mapStatus(payload.Opgelost),
    bron: "zapier-form",
  };

  const supabase = createAdminClient();

  // Manuele upsert: partial unique index op bron_referentie werkt niet met ON CONFLICT.
  // Bij een bron_referentie eerst bestaande rij zoeken en updaten, anders inserten.
  if (row.bron_referentie) {
    const { data: existing, error: selectError } = await supabase
      .from("klachten")
      .select("id")
      .eq("bron_referentie", row.bron_referentie)
      .maybeSingle();

    if (selectError) {
      return NextResponse.json({ error: selectError.message }, { status: 500 });
    }

    if (existing?.id) {
      const { error: updateError } = await supabase
        .from("klachten")
        .update(row)
        .eq("id", existing.id);
      if (updateError) {
        return NextResponse.json({ error: updateError.message }, { status: 500 });
      }
      return NextResponse.json({ ok: true, id: existing.id, action: "updated" });
    }
  }

  const { data, error } = await supabase
    .from("klachten")
    .insert(row)
    .select("id")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, id: data?.id, action: "inserted" });
}
