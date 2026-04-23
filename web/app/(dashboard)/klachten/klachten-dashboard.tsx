"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  format,
  subDays,
  startOfDay,
  endOfDay,
  differenceInCalendarDays,
  eachDayOfInterval,
} from "date-fns";
import { nl } from "date-fns/locale";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

// --- Cura BHV palette ---
const CURA = {
  navy: "#0D2340",
  navySoft: "#15315A",
  yellow: "#F5C518",
  red: "#E53935",
  green: "#2E7D32",
  amber: "#E6A100",
  muted: "#64748B",
};

type Klacht = {
  id: string;
  received_at: string;
  klantnaam: string;
  klant_email: string | null;
  klant_telefoon: string | null;
  categorie: string;
  subcategorie: string | null;
  prioriteit: string | null;
  onderwerp: string | null;
  omschrijving: string;
  status: string;
  behandelaar: string | null;
  bron: string | null;
};

function toIsoDate(d: Date) {
  return format(d, "yyyy-MM-dd");
}

export function KlachtenDashboard({ initialCategories }: { initialCategories: string[] }) {
  const today = useMemo(() => new Date(), []);
  const defaultFrom = useMemo(() => subDays(today, 6), [today]);

  const [from, setFrom] = useState<string>(toIsoDate(defaultFrom));
  const [to, setTo] = useState<string>(toIsoDate(today));
  const [categorie, setCategorie] = useState<string>("__all__");
  const [klantzoek, setKlantzoek] = useState<string>("");
  const [rows, setRows] = useState<Klacht[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const supabase = useMemo(() => createClient(), []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);

      const fromDate = startOfDay(new Date(from));
      const toDate = endOfDay(new Date(to));

      let q = supabase
        .from("klachten")
        .select(
          "id, received_at, klantnaam, klant_email, klant_telefoon, categorie, subcategorie, prioriteit, onderwerp, omschrijving, status, behandelaar, bron"
        )
        .gte("received_at", fromDate.toISOString())
        .lte("received_at", toDate.toISOString())
        .order("received_at", { ascending: false })
        .limit(2000);

      if (categorie !== "__all__") q = q.eq("categorie", categorie);
      if (klantzoek.trim().length > 0) q = q.ilike("klantnaam", `%${klantzoek.trim()}%`);

      const { data, error } = await q;
      if (cancelled) return;

      if (error) {
        setError(error.message);
        setRows([]);
      } else {
        setRows((data ?? []) as Klacht[]);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [supabase, from, to, categorie, klantzoek]);

  // Stats
  const stats = useMemo(() => {
    const fromDate = startOfDay(new Date(from));
    const toDate = endOfDay(new Date(to));
    const dayCount = Math.max(1, differenceInCalendarDays(toDate, fromDate) + 1);
    const weekCount = Math.max(1, dayCount / 7);

    const total = rows.length;
    const avgPerWeek = total / weekCount;

    const last7Start = subDays(endOfDay(new Date()), 6);
    const last7 = rows.filter((r) => new Date(r.received_at) >= startOfDay(last7Start));

    const prev7End = subDays(startOfDay(new Date()), 7);
    const prev7Start = subDays(prev7End, 6);
    const prev7 = rows.filter((r) => {
      const d = new Date(r.received_at);
      return d >= startOfDay(prev7Start) && d <= endOfDay(prev7End);
    });

    const open = rows.filter((r) => r.status === "nieuw" || r.status === "in_behandeling").length;

    return {
      total,
      avgPerWeek,
      last7: last7.length,
      prev7: prev7.length,
      open,
      dayCount,
    };
  }, [rows, from, to]);

  // Chart data: klachten per dag binnen selectie
  const perDay = useMemo(() => {
    const fromDate = startOfDay(new Date(from));
    const toDate = endOfDay(new Date(to));
    const days = eachDayOfInterval({ start: fromDate, end: toDate });
    const buckets = new Map<string, number>();
    days.forEach((d) => buckets.set(toIsoDate(d), 0));
    rows.forEach((r) => {
      const k = toIsoDate(new Date(r.received_at));
      if (buckets.has(k)) buckets.set(k, (buckets.get(k) ?? 0) + 1);
    });
    return Array.from(buckets.entries()).map(([date, count]) => ({
      date,
      label: format(new Date(date), "d MMM", { locale: nl }),
      count,
    }));
  }, [rows, from, to]);

  // Verdeling per categorie binnen selectie
  const perCategory = useMemo(() => {
    const c = new Map<string, number>();
    rows.forEach((r) => c.set(r.categorie, (c.get(r.categorie) ?? 0) + 1));
    return Array.from(c.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);
  }, [rows]);

  function applyPreset(days: number) {
    setFrom(toIsoDate(subDays(today, days - 1)));
    setTo(toIsoDate(today));
  }

  function exportCsv() {
    if (rows.length === 0) return;
    const headers = [
      "received_at",
      "klantnaam",
      "klant_email",
      "klant_telefoon",
      "categorie",
      "subcategorie",
      "prioriteit",
      "status",
      "onderwerp",
      "omschrijving",
      "behandelaar",
      "bron",
    ] as const;
    const escape = (v: unknown) => {
      const s = v == null ? "" : String(v);
      return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const lines = [
      headers.join(","),
      ...rows.map((r) =>
        headers.map((h) => escape((r as unknown as Record<string, unknown>)[h])).join(",")
      ),
    ];
    const bom = "﻿";
    const blob = new Blob([bom + lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const stamp = format(new Date(), "yyyyMMdd-HHmm");
    a.download = `klachten-${stamp}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-6">
      {/* Stats tiles */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatTile
          label="In selectie"
          value={stats.total}
          hint={`${stats.dayCount} dagen`}
          accent={CURA.navy}
        />
        <StatTile
          label="Laatste 7 dagen"
          value={stats.last7}
          hint={`vorige 7 dgn: ${stats.prev7}`}
          trend={stats.last7 - stats.prev7}
          accent={CURA.yellow}
        />
        <StatTile
          label="Gemiddeld per week"
          value={stats.avgPerWeek.toFixed(1)}
          hint="binnen selectie"
          accent={CURA.navySoft}
        />
        <StatTile
          label="Open klachten"
          value={stats.open}
          hint="nieuw + in behandeling"
          accent={CURA.red}
        />
      </div>

      {/* Chart row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold" style={{ color: CURA.navy }}>
              Klachten per dag
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-2">
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={perDay} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 11, fill: CURA.muted }}
                    tickLine={false}
                    axisLine={{ stroke: "#E5E7EB" }}
                  />
                  <YAxis
                    allowDecimals={false}
                    tick={{ fontSize: 11, fill: CURA.muted }}
                    tickLine={false}
                    axisLine={false}
                    width={28}
                  />
                  <Tooltip
                    cursor={{ fill: "#F3F4F6" }}
                    contentStyle={{
                      borderRadius: 6,
                      border: "1px solid #E5E7EB",
                      fontSize: 12,
                    }}
                  />
                  <Bar dataKey="count" fill={CURA.navy} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold" style={{ color: CURA.navy }}>
              Top categorieën
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-2">
            {perCategory.length === 0 ? (
              <p className="text-sm text-muted-foreground">Geen data.</p>
            ) : (
              <ul className="space-y-2">
                {perCategory.slice(0, 6).map((c) => {
                  const max = perCategory[0].count;
                  const pct = Math.round((c.count / max) * 100);
                  return (
                    <li key={c.name}>
                      <div className="flex items-center justify-between text-sm">
                        <span className="truncate mr-2">{c.name}</span>
                        <span
                          className="tabular-nums text-xs font-medium"
                          style={{ color: CURA.navy }}
                        >
                          {c.count}
                        </span>
                      </div>
                      <div className="h-1.5 w-full rounded bg-slate-100 mt-1 overflow-hidden">
                        <div
                          className="h-full rounded"
                          style={{ width: `${pct}%`, backgroundColor: CURA.yellow }}
                        />
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Filter bar */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold" style={{ color: CURA.navy }}>
            Filters
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Van</label>
              <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} max={to} />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Tot en met</label>
              <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} min={from} />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Categorie</label>
              <Select value={categorie} onValueChange={setCategorie}>
                <SelectTrigger>
                  <SelectValue placeholder="Alle categorieën" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">Alle categorieën</SelectItem>
                  {initialCategories.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1 md:col-span-2">
              <label className="text-xs text-muted-foreground">Klantnaam bevat</label>
              <Input
                placeholder="bv. 'Jansen' of 'Walker'"
                value={klantzoek}
                onChange={(e) => setKlantzoek(e.target.value)}
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-muted-foreground mr-1">Snel:</span>
            <PresetButton onClick={() => applyPreset(7)}>7 dagen</PresetButton>
            <PresetButton onClick={() => applyPreset(30)}>30 dagen</PresetButton>
            <PresetButton onClick={() => applyPreset(90)}>90 dagen</PresetButton>
            <PresetButton onClick={() => applyPreset(365)}>Jaar</PresetButton>
            <div className="ml-auto flex items-center gap-3">
              <span className="text-xs text-muted-foreground">
                {rows.length.toLocaleString("nl-NL")} resultaten
              </span>
              <Button
                size="sm"
                onClick={exportCsv}
                disabled={rows.length === 0}
                style={{ backgroundColor: CURA.navy, color: "white" }}
              >
                Exporteer CSV
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {error && <div className="p-4 text-sm text-red-600">Fout bij laden: {error}</div>}
          {loading ? (
            <div className="p-8 text-sm text-muted-foreground">Laden…</div>
          ) : rows.length === 0 ? (
            <div className="p-8 text-sm text-muted-foreground">
              Geen klachten gevonden binnen de huidige filters.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow style={{ backgroundColor: "#F8FAFC" }}>
                    <TableHead>Datum</TableHead>
                    <TableHead>Klant</TableHead>
                    <TableHead>Categorie</TableHead>
                    <TableHead>Onderwerp</TableHead>
                    <TableHead>Prioriteit</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Behandelaar</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="whitespace-nowrap text-sm">
                        {format(new Date(r.received_at), "d MMM yyyy", { locale: nl })}
                      </TableCell>
                      <TableCell className="text-sm">
                        <div className="font-medium" style={{ color: CURA.navy }}>
                          {r.klantnaam}
                        </div>
                        {r.klant_email && (
                          <div className="text-xs text-muted-foreground">{r.klant_email}</div>
                        )}
                      </TableCell>
                      <TableCell className="text-sm">
                        <span
                          className="inline-flex px-2 py-0.5 rounded text-xs font-medium"
                          style={{ backgroundColor: "#FEF9E7", color: CURA.navy }}
                        >
                          {r.categorie}
                        </span>
                        {r.subcategorie && (
                          <div className="text-xs text-muted-foreground mt-1">{r.subcategorie}</div>
                        )}
                      </TableCell>
                      <TableCell className="text-sm max-w-md">
                        <div className="font-medium truncate" style={{ color: CURA.navy }}>
                          {r.onderwerp ?? "—"}
                        </div>
                        <div className="text-xs text-muted-foreground line-clamp-2">
                          {r.omschrijving}
                        </div>
                      </TableCell>
                      <TableCell className="text-sm">
                        <PriorityBadge value={r.prioriteit} />
                      </TableCell>
                      <TableCell className="text-sm">
                        <StatusBadge value={r.status} />
                      </TableCell>
                      <TableCell className="text-sm">{r.behandelaar ?? "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function PresetButton({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <Button size="sm" variant="outline" onClick={onClick}>
      {children}
    </Button>
  );
}

function StatTile({
  label,
  value,
  hint,
  trend,
  accent,
}: {
  label: string;
  value: number | string;
  hint?: string;
  trend?: number;
  accent: string;
}) {
  return (
    <Card
      className="relative overflow-hidden"
      style={{ borderLeft: `4px solid ${accent}` }}
    >
      <CardContent className="pt-6">
        <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
        <div className="mt-1 text-3xl font-semibold tabular-nums" style={{ color: CURA.navy }}>
          {value}
        </div>
        {(hint || typeof trend === "number") && (
          <div className="mt-1 text-xs text-muted-foreground flex items-center gap-2">
            {hint && <span>{hint}</span>}
            {typeof trend === "number" && trend !== 0 && (
              <span style={{ color: trend > 0 ? CURA.red : CURA.green, fontWeight: 600 }}>
                {trend > 0 ? "▲" : "▼"} {Math.abs(trend)}
              </span>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function PriorityBadge({ value }: { value: string | null }) {
  if (!value) return <span className="text-muted-foreground">—</span>;
  const map: Record<string, { bg: string; fg: string }> = {
    urgent: { bg: "#FEE2E2", fg: CURA.red },
    hoog: { bg: "#FEF3C7", fg: CURA.amber },
    normaal: { bg: "#E0F2FE", fg: "#0369A1" },
    laag: { bg: "#F1F5F9", fg: CURA.muted },
  };
  const s = map[value] ?? { bg: "#F1F5F9", fg: CURA.muted };
  return (
    <span
      className="inline-flex px-2 py-0.5 rounded text-xs font-medium"
      style={{ backgroundColor: s.bg, color: s.fg }}
    >
      {value}
    </span>
  );
}

function StatusBadge({ value }: { value: string }) {
  const map: Record<string, { bg: string; fg: string }> = {
    nieuw: { bg: "#DBEAFE", fg: "#1E40AF" },
    in_behandeling: { bg: "#FEF3C7", fg: "#92400E" },
    opgelost: { bg: "#DCFCE7", fg: "#166534" },
    gesloten: { bg: "#F1F5F9", fg: CURA.muted },
    heropend: { bg: "#F3E8FF", fg: "#6B21A8" },
  };
  const s = map[value] ?? { bg: "#F1F5F9", fg: CURA.muted };
  return (
    <span
      className="inline-flex px-2 py-0.5 rounded text-xs font-medium"
      style={{ backgroundColor: s.bg, color: s.fg }}
    >
      {value.replace(/_/g, " ")}
    </span>
  );
}
