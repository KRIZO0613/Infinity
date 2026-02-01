import { promises as fs } from "node:fs";
import * as path from "node:path";
import * as dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

type ExternalClubRow = {
  name: string;
  city: string | null;
  district: string | null;
  league: string | null;
  slug: string;
};

type CsvClubRow = {
  name: string;
  city: string;
  district: string;
  league: string;
};

// ✅ Chemin ABSOLU vers ton CSV (à partir de la racine du repo Infinity)
const CSV_ABSOLUTE_PATH = path.resolve(
  process.cwd(),
  "apps/foot/data/clubs/clubs-mediterranee.csv",
);

const BATCH_SIZE = 500;

// ✅ On charge le .env.local spécifique de l’app foot
dotenv.config({
  path: path.resolve(process.cwd(), "apps/foot/.env.local"),
});

console.log("SUPABASE_URL =", process.env.SUPABASE_URL);
console.log(
  "SERVICE_ROLE_KEY présent ?",
  !!process.env.SUPABASE_SERVICE_ROLE_KEY,
);

function normalizeCell(value: string) {
  return value.trim().replace(/^"|"$/g, "");
}

function normalizeHeader(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function slugify(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

async function readCsv(filePath: string): Promise<{
  rows: CsvClubRow[];
  totalRows: number;
}> {
  const raw = await fs.readFile(filePath, "utf8");
  const lines = raw.split(/\r?\n/).filter((line) => line.trim().length > 0);

  if (lines.length === 0) {
    return { rows: [], totalRows: 0 };
  }

  const rawHeader = lines[0];

  // 🔍 Détection automatique du séparateur
  let delimiter = ";";
  if (rawHeader.includes(";")) {
    delimiter = ";";
  } else if (rawHeader.includes(",")) {
    delimiter = ",";
  } else if (rawHeader.includes("\t")) {
    delimiter = "\t";
  }

  console.log("Header brut:", rawHeader);
  console.log("Délimiteur détecté:", JSON.stringify(delimiter));

  const headerCells = rawHeader
    .split(delimiter)
    .map((v) => normalizeHeader(normalizeCell(v)));

  console.log("Headers splittés + normalisés:", headerCells);

  const headerMap = new Map<string, number>();
  headerCells.forEach((header, index) => {
    if (header) {
      headerMap.set(header, index);
    }
  });

  let nameIndex =
    headerMap.get("club") ?? headerMap.get("clubs") ?? headerMap.get("clb");
  let cityIndex = headerMap.get("ville");
  let districtIndex = headerMap.get("district");
  let leagueIndex = headerMap.get("ligues") ?? headerMap.get("ligue");

  // ✅ Fallback forcé pour ton CSV : Numéro ID ; CLub ; Ville ; Ligues ; District
  if (nameIndex === undefined && headerCells.length >= 5) {
    console.log(
      "⚠️ Impossible de détecter 'club' via les entêtes, fallback index fixe (1-4).",
    );
    nameIndex = 1; // CLub
    cityIndex = 2; // Ville
    leagueIndex = 3; // Ligues
    districtIndex = 4; // District
  }

  if (nameIndex === undefined) {
    throw new Error(
      "Impossible de trouver la colonne Club (headers normalisés: " +
        headerCells.join(", ") +
        ")",
    );
  }

  const rows: CsvClubRow[] = [];
  const totalRows = lines.length - 1;

  for (const line of lines.slice(1)) {
    const cells = line.split(delimiter).map((v) => normalizeCell(v));

    const safeGet = (index: number | undefined): string => {
      if (index === undefined) return "";
      if (index < 0 || index >= cells.length) return "";
      return cells[index] ?? "";
    };

    const name = safeGet(nameIndex);
    const city = safeGet(cityIndex);
    const district = safeGet(districtIndex);
    const league = safeGet(leagueIndex);

    rows.push({
      name,
      city,
      district,
      league,
    });
  }

  return { rows, totalRows };
}

async function run() {
  const supabaseUrl =
    process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    console.error(
      "Missing SUPABASE_URL/NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.",
    );
    process.exitCode = 1;
    return;
  }

  const { rows, totalRows } = await readCsv(CSV_ABSOLUTE_PATH);

  if (rows.length === 0) {
    console.log("No rows found in CSV.");
    return;
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  const { data: existing, error: existingError } = await supabase
    .from("external_clubs")
    .select("slug");

  if (existingError) {
    console.error("Failed to fetch existing clubs:", existingError.message);
    process.exitCode = 1;
    return;
  }

  const existingSlugs = new Set(
    (existing ?? []).map((club) => club.slug).filter(Boolean),
  );

  const toInsert: ExternalClubRow[] = [];
  let ignored = 0;
  let validRows = 0;

  for (const row of rows) {
    const name = (row.name ?? "").trim();
    if (!name || name.toUpperCase().includes("A SUPPRIMER")) {
      ignored += 1;
      continue;
    }
    validRows += 1;
    const city = (row.city ?? "").trim() || null;
    const district = (row.district ?? "").trim() || null;
    const league = (row.league ?? "").trim() || null;
    const slugSource = [name, city].filter(Boolean).join(" ");
    const slug = slugify(slugSource);

    if (!slug || existingSlugs.has(slug)) {
      ignored += 1;
      continue;
    }

    existingSlugs.add(slug);
    toInsert.push({ name, city, district, league, slug });
  }

  let inserted = 0;
  for (let i = 0; i < toInsert.length; i += BATCH_SIZE) {
    const batch = toInsert.slice(i, i + BATCH_SIZE);
    const { error } = await supabase
      .from("external_clubs")
      .upsert(batch, { onConflict: "slug", ignoreDuplicates: true });
    if (error) {
      console.error("Insert failed:", error.message);
      process.exitCode = 1;
      return;
    }
    inserted += batch.length;
  }

  console.log(
    `Import terminé: ${totalRows} lignes lues, ${validRows} valides, ${inserted} insérées, ${ignored} ignorées.`,
  );
}

run().catch((error) => {
  console.error("Import failed:", error);
  process.exitCode = 1;
});