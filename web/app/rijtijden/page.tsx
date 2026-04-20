"use client";

import { useState, useCallback, useRef } from "react";
import * as XLSX from "xlsx";
import { Upload, FileSpreadsheet, Download, Send, X, FileDown, Calendar } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

// ─── Kolom-indices in het Data-tabblad (0-based, data begint op rij 11) ───
const COL = {
  FIRSTNAME: 5,
  LASTNAME:  6,
  START:     13,
  DRIVE_DUR: 14,
  STOP:      15,
  DISTANCE:  16,
  STOP_DUR:  17,
  LOCATION:  20,
};

// ─── Hulpfuncties ─────────────────────────────────────────────────────────

function toSeconds(val: unknown): number {
  if (val instanceof Date) {
    return val.getUTCHours() * 3600 + val.getUTCMinutes() * 60 + val.getUTCSeconds();
  }
  if (typeof val === "number") return Math.round(val * 86400);
  return 0;
}

function fmtDur(seconds: number): string {
  const h = Math.floor(Math.abs(seconds) / 3600);
  const m = Math.floor((Math.abs(seconds) % 3600) / 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function fmtTime(date: Date | null): string {
  if (!date) return "";
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function fmtDate(date: Date): string {
  const days = ["zondag", "maandag", "dinsdag", "woensdag", "donderdag", "vrijdag", "zaterdag"];
  const months = ["januari", "februari", "maart", "april", "mei", "juni", "juli", "augustus", "september", "oktober", "november", "december"];
  return `${days[date.getDay()]} ${date.getDate()} ${months[date.getMonth()]} ${date.getFullYear()}`;
}

// ─── Types ────────────────────────────────────────────────────────────────

interface SummaryRow {
  naam: string;
  datumRaw: Date;
  vertrek: string;
  aankomst1eKlant: string;
  vertrekLaatsteKlant: string;
  aankomst: string;
  opslag: string;
  heeftOpslag: boolean;
  werktijd: string;
  werktijdSec: number;
  rijtijd: string;
  rijtijdSec: number;
  gemaakteUren: string;
  gemaakteUrenSec: number;
  afstandKm: number;
  kmPerUur: number;
}

// ─── Excel verwerken ──────────────────────────────────────────────────────

function processExcel(file: File): Promise<SummaryRow[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target!.result as ArrayBuffer);
        const wb = XLSX.read(data, { type: "array", cellDates: true });

        const ws = wb.Sheets["Data"];
        if (!ws) throw new Error("Geen 'Data' tabblad gevonden in dit Excel-bestand.");

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null });

        const tripRows = rows.slice(11).filter((row) => row[COL.START] instanceof Date);

        const groups = new Map<string, unknown[][]>();
        for (const row of tripRows) {
          const key = `${row[COL.FIRSTNAME]}|${row[COL.LASTNAME]}|${(row[COL.START] as Date).toDateString()}`;
          if (!groups.has(key)) groups.set(key, []);
          groups.get(key)!.push(row);
        }

        const results: SummaryRow[] = [];

        for (const trips of groups.values()) {
          trips.sort((a, b) =>
            (a[COL.START] as Date).getTime() - (b[COL.START] as Date).getTime()
          );

          const first = trips[0];
          const last  = trips[trips.length - 1];

          const vertrekStart   = first[COL.START] as Date;
          const aankomst1e     = first[COL.STOP]  as Date;
          const vertrekLaatste = last[COL.START]  as Date;
          const aankomstThuis  = last[COL.STOP]   as Date;

          let opslagSec = 0, heeftOpslag = false;
          for (const trip of trips) {
            if (String(trip[COL.LOCATION] ?? "").includes("Opslagruimte")) {
              opslagSec = toSeconds(trip[COL.STOP_DUR]);
              heeftOpslag = true;
              break;
            }
          }

          const rijtijdSec      = trips.reduce((s, t) => s + toSeconds(t[COL.DRIVE_DUR]), 0);
          const gemaakteUrenSec = Math.round((aankomstThuis.getTime() - vertrekStart.getTime()) / 1000);
          const werktijdSec     = Math.round((vertrekLaatste.getTime() - aankomst1e.getTime()) / 1000);
          const afstandKm       = Math.round(
            trips.reduce((s, t) => s + (typeof t[COL.DISTANCE] === "number" ? (t[COL.DISTANCE] as number) : 0), 0) * 10
          ) / 10;

          // Gemiddelde snelheid: afstand / rijtijd in uren
          const kmPerUur = rijtijdSec > 0
            ? Math.round((afstandKm / (rijtijdSec / 3600)) * 10) / 10
            : 0;

          results.push({
            naam: `${first[COL.FIRSTNAME]} ${first[COL.LASTNAME]}`,
            datumRaw: vertrekStart,
            vertrek: fmtTime(vertrekStart),
            aankomst1eKlant: fmtTime(aankomst1e),
            vertrekLaatsteKlant: fmtTime(vertrekLaatste),
            aankomst: fmtTime(aankomstThuis),
            opslag: heeftOpslag ? fmtDur(opslagSec) : "",
            heeftOpslag,
            werktijd: fmtDur(werktijdSec),
            werktijdSec,
            rijtijd: fmtDur(rijtijdSec),
            rijtijdSec,
            gemaakteUren: fmtDur(gemaakteUrenSec),
            gemaakteUrenSec,
            afstandKm,
            kmPerUur,
          });
        }

        results.sort((a, b) => {
          const n = a.naam.localeCompare(b.naam, "nl");
          return n !== 0 ? n : a.datumRaw.getTime() - b.datumRaw.getTime();
        });

        resolve(results);
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = () => reject(new Error("Bestand kon niet worden gelezen."));
    reader.readAsArrayBuffer(file);
  });
}

// ─── Exports ──────────────────────────────────────────────────────────────

function exportExcel(rows: SummaryRow[], datum: string) {
  const headers = [
    "Naam", "Vertrek", "Aankomst 1", "Vertrek laatste",
    "Aankomst laatste", "Opslag", "Werktijd", "Rijtijd",
    "Gemaakte uren", "Afstand (km)", "Km/uur",
  ];
  const data = rows.map((r) => [
    r.naam, r.vertrek, r.aankomst1eKlant, r.vertrekLaatsteKlant,
    r.aankomst, r.opslag, r.werktijd, r.rijtijd,
    r.gemaakteUren, r.afstandKm, r.kmPerUur,
  ]);
  const ws = XLSX.utils.aoa_to_sheet([headers, ...data]);
  const wbOut = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wbOut, ws, "Rijtijden");
  XLSX.writeFile(wbOut, `rijtijden-${datum.replace(/ /g, "-")}.xlsx`);
}

function exportCSV(rows: SummaryRow[]) {
  const headers = [
    "Naam", "Vertrek", "Aankomst 1", "Vertrek laatste",
    "Aankomst laatste", "Opslag", "Werktijd", "Rijtijd",
    "Gemaakte uren", "Afstand (km)", "Km/uur",
  ];
  const lines = [headers.join(";")];
  for (const r of rows) {
    lines.push([
      r.naam, r.vertrek, r.aankomst1eKlant, r.vertrekLaatsteKlant,
      r.aankomst, r.opslag, r.werktijd, r.rijtijd,
      r.gemaakteUren, r.afstandKm, r.kmPerUur,
    ].join(";"));
  }
  const blob = new Blob(["\uFEFF" + lines.join("\n")], { type: "text/csv;charset=utf-8;" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href = url;
  a.download = "rijtijden-analyse.csv";
  a.click();
  URL.revokeObjectURL(url);
}

async function sendToZapier(rows: SummaryRow[], webhookUrl: string, datum: string) {
  const payload = rows.map((r) => ({
    datum,
    naam:                  r.naam,
    vertrek:               r.vertrek,
    aankomst_1e_klant:     r.aankomst1eKlant,
    vertrek_laatste_klant: r.vertrekLaatsteKlant,
    aankomst:              r.aankomst,
    opslag:                r.opslag,
    werktijd:              r.werktijd,
    rijtijd:               r.rijtijd,
    gemaakte_uren:         r.gemaakteUren,
    afstand_km:            r.afstandKm,
    km_per_uur:            r.kmPerUur,
  }));
  const res = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`Zapier gaf status ${res.status}`);
}

// ─── Pagina ───────────────────────────────────────────────────────────────

export default function RijtijdenPage() {
  const [rows, setRows]             = useState<SummaryRow[]>([]);
  const [fileName, setFileName]     = useState("");
  const [loading, setLoading]       = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [webhookUrl, setWebhookUrl] = useState("");
  const [sendingZapier, setSendingZapier] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback(async (file: File) => {
    if (!file.name.endsWith(".xlsx")) {
      toast.error("Alleen .xlsx bestanden worden ondersteund.");
      return;
    }
    setLoading(true);
    setRows([]);
    try {
      const result = await processExcel(file);
      setRows(result);
      setFileName(file.name);
      toast.success(`${result.length} monteur${result.length !== 1 ? "s" : ""} verwerkt.`);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Fout bij verwerken.");
    } finally {
      setLoading(false);
    }
  }, []);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  const reset = () => { setRows([]); setFileName(""); };

  const GRENS = 8.5 * 3600;

  // Datum bovenaan: unieke datums uit de data
  const datums = rows.length > 0
    ? [...new Set(rows.map((r) => fmtDate(r.datumRaw)))]
    : [];
  const datumLabel = datums.join(" · ");

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header balk — rode huisstijl */}
      <div className="bg-[#C0392B] text-white px-6 py-4 shadow-md">
        <div className="max-w-[1400px] mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold tracking-tight">Smeba — Rijtijden analyse</h1>
            <p className="text-red-100 text-xs mt-0.5">Monteurs planner · dagrapport</p>
          </div>
          {rows.length > 0 && (
            <button
              onClick={reset}
              className="flex items-center gap-1.5 text-red-100 hover:text-white text-sm transition-colors"
            >
              <X className="h-4 w-4" /> Nieuw bestand
            </button>
          )}
        </div>
      </div>

      <div className="p-6 max-w-[1400px] mx-auto">
        {/* Upload zone */}
        {rows.length === 0 && (
          <div
            className={`mt-6 border-2 border-dashed rounded-xl p-16 flex flex-col items-center justify-center cursor-pointer transition-colors ${
              isDragging
                ? "border-[#C0392B] bg-red-50"
                : "border-gray-300 hover:border-[#C0392B]/60 hover:bg-red-50/30"
            }`}
            onClick={() => inputRef.current?.click()}
            onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={onDrop}
          >
            <input
              ref={inputRef}
              type="file"
              accept=".xlsx"
              className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ""; }}
            />
            {loading ? (
              <div className="flex flex-col items-center gap-3 text-gray-500">
                <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#C0392B] border-t-transparent" />
                <span className="text-sm">Bestand verwerken…</span>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-3 text-gray-400">
                <div className="rounded-full bg-red-50 border border-red-100 p-4">
                  <Upload className="h-8 w-8 text-[#C0392B]" />
                </div>
                <div className="text-center">
                  <p className="text-sm font-medium text-gray-700">
                    Sleep een bestand hierheen of klik om te kiezen
                  </p>
                  <p className="mt-1 text-xs text-gray-400">Ondersteund: .xlsx (Smeba Tripdetails rapport)</p>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Resultaten */}
        {rows.length > 0 && (
          <div className="mt-4 space-y-4">
            {/* Datum + bestandsnaam */}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-lg px-3 py-2 shadow-sm">
                  <Calendar className="h-4 w-4 text-[#C0392B]" />
                  <span className="text-sm font-semibold text-gray-800">{datumLabel}</span>
                </div>
                <span className="text-xs text-gray-400 flex items-center gap-1">
                  <FileSpreadsheet className="h-3.5 w-3.5" />
                  {fileName}
                </span>
              </div>

              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => exportExcel(rows, datumLabel)}
                  className="border-gray-200 text-gray-600 hover:bg-gray-50"
                >
                  <Download className="h-4 w-4 mr-1" /> Excel
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => exportCSV(rows)}
                  className="border-gray-200 text-gray-600 hover:bg-gray-50"
                >
                  <FileDown className="h-4 w-4 mr-1" /> CSV
                </Button>
              </div>
            </div>

            {/* Zapier */}
            <div className="flex gap-2">
              <Input
                placeholder="Zapier webhook URL"
                value={webhookUrl}
                onChange={(e) => setWebhookUrl(e.target.value)}
                className="max-w-sm text-sm border-gray-200"
              />
              <Button
                size="sm"
                onClick={async () => {
                  if (!webhookUrl) { toast.error("Voer eerst een Zapier webhook URL in."); return; }
                  setSendingZapier(true);
                  try {
                    await sendToZapier(rows, webhookUrl, datumLabel);
                    toast.success("Data verstuurd naar Zapier.");
                  } catch (err: unknown) {
                    toast.error(err instanceof Error ? err.message : "Fout bij versturen.");
                  } finally {
                    setSendingZapier(false);
                  }
                }}
                disabled={sendingZapier || !webhookUrl}
                className="bg-[#C0392B] hover:bg-[#A93226] text-white"
              >
                <Send className="h-4 w-4 mr-1" />
                {sendingZapier ? "Versturen…" : "Verstuur naar Zapier"}
              </Button>
            </div>

            {/* Legenda */}
            <div className="flex gap-4 text-xs text-gray-500">
              <span className="flex items-center gap-1.5">
                <span className="inline-block h-2.5 w-2.5 rounded-sm bg-green-100 border border-green-300" />
                Werktijd ≥ 8:30 uur
              </span>
              <span className="flex items-center gap-1.5">
                <span className="inline-block h-2.5 w-2.5 rounded-sm bg-red-100 border border-red-300" />
                Werktijd &lt; 8:30 uur
              </span>
              <span className="flex items-center gap-1.5">
                <span className="inline-block h-2.5 w-2.5 rounded-sm bg-emerald-50 border border-emerald-200" />
                Opslagbezoek
              </span>
            </div>

            {/* Tabel */}
            <div className="overflow-x-auto rounded-lg border border-gray-200 shadow-sm bg-white">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-[#C0392B]">
                    {[
                      "Naam", "Vertrek", "Aankomst 1",
                      "Vertrek laatste", "Aankomst laatste",
                      "Opslag", "Werktijd", "Rijtijd",
                      "Gemaakte uren", "Afstand", "Km/uur",
                    ].map((h) => (
                      <th
                        key={h}
                        className="whitespace-nowrap px-3 py-2.5 text-left text-xs font-semibold text-white"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, i) => (
                    <tr
                      key={i}
                      className={`border-b last:border-0 transition-colors hover:bg-gray-50 ${
                        row.heeftOpslag ? "bg-emerald-50/50" : i % 2 === 0 ? "bg-white" : "bg-gray-50/50"
                      }`}
                    >
                      <td className="px-3 py-2 font-medium text-gray-900">{row.naam}</td>
                      <td className="px-3 py-2 tabular-nums text-gray-700">{row.vertrek}</td>
                      <td className="px-3 py-2 tabular-nums text-gray-700">{row.aankomst1eKlant}</td>
                      <td className="px-3 py-2 tabular-nums text-gray-700">{row.vertrekLaatsteKlant}</td>
                      <td className="px-3 py-2 tabular-nums text-gray-700">{row.aankomst}</td>
                      <td className="px-3 py-2 tabular-nums text-gray-700">{row.opslag}</td>
                      <td className="px-3 py-2 tabular-nums">
                        <span className={`inline-block rounded px-1.5 py-0.5 text-xs font-semibold ${
                          row.werktijdSec >= GRENS
                            ? "bg-green-100 text-green-800"
                            : "bg-red-100 text-red-700"
                        }`}>
                          {row.werktijd}
                        </span>
                      </td>
                      <td className="px-3 py-2 tabular-nums text-gray-700">{row.rijtijd}</td>
                      <td className="px-3 py-2 tabular-nums text-gray-700">{row.gemaakteUren}</td>
                      <td className="px-3 py-2 tabular-nums text-gray-700">{row.afstandKm} km</td>
                      <td className="px-3 py-2 tabular-nums text-gray-700">{row.kmPerUur}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
