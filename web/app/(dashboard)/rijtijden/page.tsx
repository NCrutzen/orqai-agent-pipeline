"use client";

import { useState, useCallback, useRef } from "react";
import * as XLSX from "xlsx";
import { Upload, FileSpreadsheet, Download, Send, X, FileDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

// ─── Kolom-indices in het Data-tabblad (0-based, data begint op rij 11) ───
const COL = {
  FIRSTNAME: 5,   // F – UserFirstName
  LASTNAME:  6,   // G – UserLastName
  START:     13,  // N – TripDetailStartDateTime
  DRIVE_DUR: 14,  // O – TripDetailDrivingDuration
  STOP:      15,  // P – TripDetailStopDateTime
  DISTANCE:  16,  // Q – TripDetailDistance (km)
  STOP_DUR:  17,  // R – TripDetailStopDuration (stilstandtijd bij bestemming)
  LOCATION:  20,  // U – TripDetailLocation (Bestemming)
};

// ─── Hulpfuncties ─────────────────────────────────────────────────────────

/** Excel-duur (getal als fractie van een dag, of Date) → seconden */
function toSeconds(val: unknown): number {
  if (val instanceof Date) {
    return val.getUTCHours() * 3600 + val.getUTCMinutes() * 60 + val.getUTCSeconds();
  }
  if (typeof val === "number") return Math.round(val * 86400);
  return 0;
}

/** Seconden → "HH:MM" */
function fmtDur(seconds: number): string {
  const h = Math.floor(Math.abs(seconds) / 3600);
  const m = Math.floor((Math.abs(seconds) % 3600) / 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** Date → "HH:MM" */
function fmtTime(date: Date | null): string {
  if (!date) return "";
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

/** Date → "DD-MM-YYYY" */
function fmtDate(date: Date): string {
  return `${String(date.getDate()).padStart(2, "0")}-${String(date.getMonth() + 1).padStart(2, "0")}-${date.getFullYear()}`;
}

// ─── Types ────────────────────────────────────────────────────────────────

interface SummaryRow {
  naam: string;
  datum: string;
  datumRaw: Date;
  vertrek: string;
  aankomst1eKlant: string;
  vertrekLaatsteKlant: string;
  aankomst: string;
  opslag: string;           // "HH:MM" als bezocht, anders ""
  heeftOpslag: boolean;
  rijtijd: string;
  rijtijdSec: number;
  gemaakteUren: string;
  gemaakteUrenSec: number;
  werktijd: string;
  werktijdSec: number;
  afstandKm: number;
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
        const rows: any[][] = XLSX.utils.sheet_to_json(ws, {
          header: 1,
          raw: true,
          defval: null,
        });

        // Rij 0–10 = metadata + header; data begint op index 11
        const tripRows = rows.slice(11).filter((row) => row[COL.START] instanceof Date);

        // Groepeer per persoon + dag
        const groups = new Map<string, unknown[][]>();
        for (const row of tripRows) {
          const key = `${row[COL.FIRSTNAME]}|${row[COL.LASTNAME]}|${(row[COL.START] as Date).toDateString()}`;
          if (!groups.has(key)) groups.set(key, []);
          groups.get(key)!.push(row);
        }

        const results: SummaryRow[] = [];

        for (const trips of groups.values()) {
          // Sorteer op starttijd
          trips.sort((a, b) =>
            (a[COL.START] as Date).getTime() - (b[COL.START] as Date).getTime()
          );

          const first = trips[0];
          const last  = trips[trips.length - 1];

          const vertrekStart      = first[COL.START] as Date;
          const aankomst1e        = first[COL.STOP]  as Date;
          const vertrekLaatste    = last[COL.START]  as Date;
          const aankomstThuis     = last[COL.STOP]   as Date;

          // Opslag: eerste rit met "Opslagruimte" in de bestemming
          let opslagSec   = 0;
          let heeftOpslag = false;
          for (const trip of trips) {
            if (String(trip[COL.LOCATION] ?? "").includes("Opslagruimte")) {
              opslagSec   = toSeconds(trip[COL.STOP_DUR]);
              heeftOpslag = true;
              break;
            }
          }

          // Rijtijd = som van alle rijtijden
          const rijtijdSec = trips.reduce((s, t) => s + toSeconds(t[COL.DRIVE_DUR]), 0);

          // Gemaakte uren = aankomst thuis − vertrek thuis
          const gemaakteUrenSec = Math.round(
            (aankomstThuis.getTime() - vertrekStart.getTime()) / 1000
          );

          // Werktijd = vertrek laatste klant − aankomst 1e klant
          const werktijdSec = Math.round(
            (vertrekLaatste.getTime() - aankomst1e.getTime()) / 1000
          );

          // Afstand km
          const afstandKm =
            Math.round(
              trips.reduce(
                (s, t) => s + (typeof t[COL.DISTANCE] === "number" ? (t[COL.DISTANCE] as number) : 0),
                0
              ) * 10
            ) / 10;

          results.push({
            naam: `${first[COL.FIRSTNAME]} ${first[COL.LASTNAME]}`,
            datum: fmtDate(vertrekStart),
            datumRaw: vertrekStart,
            vertrek: fmtTime(vertrekStart),
            aankomst1eKlant: fmtTime(aankomst1e),
            vertrekLaatsteKlant: fmtTime(vertrekLaatste),
            aankomst: fmtTime(aankomstThuis),
            opslag: heeftOpslag ? fmtDur(opslagSec) : "",
            heeftOpslag,
            rijtijd: fmtDur(rijtijdSec),
            rijtijdSec,
            gemaakteUren: fmtDur(gemaakteUrenSec),
            gemaakteUrenSec,
            werktijd: fmtDur(werktijdSec),
            werktijdSec,
            afstandKm,
          });
        }

        // Sorteer op naam, dan datum
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

function exportExcel(rows: SummaryRow[]) {
  const headers = [
    "Naam", "Datum", "Vertrek", "Aankomst 1e klant",
    "Vertrek laatste klant", "Aankomst", "Opslag",
    "Rijtijd", "Gemaakte uren", "Werktijd", "Afstand (km)",
  ];
  const data = rows.map((r) => [
    r.naam, r.datum, r.vertrek, r.aankomst1eKlant,
    r.vertrekLaatsteKlant, r.aankomst, r.opslag,
    r.rijtijd, r.gemaakteUren, r.werktijd, r.afstandKm,
  ]);
  const ws = XLSX.utils.aoa_to_sheet([headers, ...data]);
  const wbOut = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wbOut, ws, "Rijtijden");
  XLSX.writeFile(wbOut, "rijtijden-analyse.xlsx");
}

function exportCSV(rows: SummaryRow[]) {
  const headers = [
    "Naam", "Datum", "Vertrek", "Aankomst 1e klant",
    "Vertrek laatste klant", "Aankomst", "Opslag",
    "Rijtijd", "Gemaakte uren", "Werktijd", "Afstand (km)",
  ];
  const lines = [headers.join(";")];
  for (const r of rows) {
    lines.push([
      r.naam, r.datum, r.vertrek, r.aankomst1eKlant,
      r.vertrekLaatsteKlant, r.aankomst, r.opslag,
      r.rijtijd, r.gemaakteUren, r.werktijd, r.afstandKm,
    ].join(";"));
  }
  const blob = new Blob(["\uFEFF" + lines.join("\n")], { type: "text/csv;charset=utf-8;" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href     = url;
  a.download = "rijtijden-analyse.csv";
  a.click();
  URL.revokeObjectURL(url);
}

async function sendToZapier(rows: SummaryRow[], webhookUrl: string) {
  const payload = rows.map((r) => ({
    naam:                   r.naam,
    datum:                  r.datum,
    vertrek:                r.vertrek,
    aankomst_1e_klant:      r.aankomst1eKlant,
    vertrek_laatste_klant:  r.vertrekLaatsteKlant,
    aankomst:               r.aankomst,
    opslag:                 r.opslag,
    rijtijd:                r.rijtijd,
    gemaakte_uren:          r.gemaakteUren,
    werktijd:               r.werktijd,
    afstand_km:             r.afstandKm,
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
  const [rows, setRows]           = useState<SummaryRow[]>([]);
  const [fileName, setFileName]   = useState("");
  const [loading, setLoading]     = useState(false);
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

  const onInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
    e.target.value = "";
  };

  const handleZapier = async () => {
    if (!webhookUrl) { toast.error("Voer eerst een Zapier webhook URL in."); return; }
    setSendingZapier(true);
    try {
      await sendToZapier(rows, webhookUrl);
      toast.success("Data verstuurd naar Zapier.");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Fout bij versturen.");
    } finally {
      setSendingZapier(false);
    }
  };

  const reset = () => { setRows([]); setFileName(""); };

  // 8,5 uur in seconden
  const GRENS = 8.5 * 3600;

  return (
    <div className="p-6 max-w-[1400px] mx-auto">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-semibold">Rijtijden analyse</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Upload een Smeba Excel-rapport (.xlsx) voor een samenvatting per monteur per dag.
        </p>
      </div>

      {/* Upload zone */}
      {rows.length === 0 && (
        <div
          className={`border-2 border-dashed rounded-xl p-12 flex flex-col items-center justify-center cursor-pointer transition-colors ${
            isDragging
              ? "border-primary bg-primary/5"
              : "border-muted-foreground/25 hover:border-primary/50 hover:bg-muted/30"
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
            onChange={onInputChange}
          />
          {loading ? (
            <div className="flex flex-col items-center gap-3 text-muted-foreground">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              <span className="text-sm">Bestand verwerken…</span>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-3 text-muted-foreground">
              <div className="rounded-full bg-muted p-4">
                <Upload className="h-8 w-8" />
              </div>
              <div className="text-center">
                <p className="text-sm font-medium text-foreground">
                  Sleep een bestand hierheen of klik om te kiezen
                </p>
                <p className="mt-1 text-xs">Ondersteund: .xlsx (Smeba Tripdetails rapport)</p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Resultaten */}
      {rows.length > 0 && (
        <div className="space-y-4">
          {/* Toolbar */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <FileSpreadsheet className="h-4 w-4" />
              <span className="font-medium text-foreground">{fileName}</span>
              <span>— {rows.length} monteur{rows.length !== 1 ? "s" : ""}</span>
            </div>
            <div className="ml-auto flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={() => exportExcel(rows)}>
                <Download className="h-4 w-4 mr-1" /> Excel
              </Button>
              <Button variant="outline" size="sm" onClick={() => exportCSV(rows)}>
                <FileDown className="h-4 w-4 mr-1" /> CSV
              </Button>
              <Button variant="outline" size="sm" onClick={reset}>
                <X className="h-4 w-4 mr-1" /> Nieuw bestand
              </Button>
            </div>
          </div>

          {/* Zapier */}
          <div className="flex gap-2">
            <Input
              placeholder="Zapier webhook URL"
              value={webhookUrl}
              onChange={(e) => setWebhookUrl(e.target.value)}
              className="max-w-sm text-sm"
            />
            <Button
              size="sm"
              onClick={handleZapier}
              disabled={sendingZapier || !webhookUrl}
            >
              <Send className="h-4 w-4 mr-1" />
              {sendingZapier ? "Versturen…" : "Verstuur naar Zapier"}
            </Button>
          </div>

          {/* Legenda */}
          <div className="flex gap-4 text-xs text-muted-foreground">
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
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  {[
                    "Naam", "Datum", "Vertrek",
                    "Aankomst 1e klant", "Vertrek laatste klant", "Aankomst",
                    "Opslag", "Rijtijd", "Gemaakte uren", "Werktijd", "Afstand (km)",
                  ].map((h) => (
                    <th
                      key={h}
                      className="whitespace-nowrap px-3 py-2.5 text-left text-xs font-medium text-muted-foreground"
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
                    className={`border-b last:border-0 transition-colors hover:bg-muted/30 ${
                      row.heeftOpslag ? "bg-emerald-50/60" : ""
                    }`}
                  >
                    <td className="px-3 py-2 font-medium">{row.naam}</td>
                    <td className="px-3 py-2 tabular-nums">{row.datum}</td>
                    <td className="px-3 py-2 tabular-nums">{row.vertrek}</td>
                    <td className="px-3 py-2 tabular-nums">{row.aankomst1eKlant}</td>
                    <td className="px-3 py-2 tabular-nums">{row.vertrekLaatsteKlant}</td>
                    <td className="px-3 py-2 tabular-nums">{row.aankomst}</td>
                    <td className="px-3 py-2 tabular-nums">{row.opslag}</td>
                    <td className="px-3 py-2 tabular-nums">{row.rijtijd}</td>
                    <td className="px-3 py-2 tabular-nums">{row.gemaakteUren}</td>
                    <td className="px-3 py-2 tabular-nums">
                      <span
                        className={`inline-block rounded px-1.5 py-0.5 text-xs font-semibold ${
                          row.werktijdSec >= GRENS
                            ? "bg-green-100 text-green-800"
                            : "bg-red-100 text-red-800"
                        }`}
                      >
                        {row.werktijd}
                      </span>
                    </td>
                    <td className="px-3 py-2 tabular-nums">{row.afstandKm}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
