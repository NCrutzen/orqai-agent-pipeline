import { KlachtenDashboard } from "./klachten-dashboard";
import { createClient } from "@/lib/supabase/server";

export default async function KlachtenPage() {
  const supabase = await createClient();

  const { data: categoryRows } = await supabase
    .from("klachten")
    .select("categorie")
    .not("categorie", "is", null);

  const categories = Array.from(
    new Set((categoryRows ?? []).map((r) => r.categorie as string).filter(Boolean))
  ).sort();

  return (
    <div className="min-h-full bg-slate-50">
      {/* Branded header band */}
      <div
        className="px-6 md:px-8 py-6 border-b-4"
        style={{ backgroundColor: "#0D2340", borderBottomColor: "#F5C518" }}
      >
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-white">
          Klachtenoverzicht
        </h1>
        <p className="mt-1 text-sm text-slate-200">
          Filter op categorie, periode of klantnaam. Exporteer een selectie ter voorbereiding van
          klantgesprekken.
        </p>
      </div>

      <div className="p-6 md:p-8">
        <KlachtenDashboard initialCategories={categories} />
      </div>
    </div>
  );
}
