"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_fs_1 = require("node:fs");
const node_path_1 = __importDefault(require("node:path"));
const supabase_js_1 = require("@supabase/supabase-js");
const CSV_RELATIVE_PATH = ["data", "clubs", "clubs-mediterranee.csv"];
const BATCH_SIZE = 500;
async function loadEnvFile(filePath) {
    try {
        const contents = await node_fs_1.promises.readFile(filePath, "utf8");
        for (const rawLine of contents.split(/\r?\n/)) {
            const line = rawLine.trim();
            if (!line || line.startsWith("#"))
                continue;
            const equalsIndex = line.indexOf("=");
            if (equalsIndex === -1)
                continue;
            const key = line.slice(0, equalsIndex).trim();
            const value = line.slice(equalsIndex + 1).trim().replace(/^"|"$/g, "");
            if (!process.env[key]) {
                process.env[key] = value;
            }
        }
    }
    catch (error) {
        if (error.code !== "ENOENT") {
            throw error;
        }
    }
}
function normalizeCell(value) {
    return value.trim().replace(/^"|"$/g, "");
}
function splitCsvLine(line) {
    const result = [];
    let current = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i += 1) {
        const char = line[i];
        if (char === "\"") {
            if (inQuotes && line[i + 1] === "\"") {
                current += "\"";
                i += 1;
            }
            else {
                inQuotes = !inQuotes;
            }
            continue;
        }
        if (char === ";" && !inQuotes) {
            result.push(normalizeCell(current));
            current = "";
            continue;
        }
        current += char;
    }
    result.push(normalizeCell(current));
    return result;
}
function slugify(value) {
    return value
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)/g, "");
}
async function readCsv(filePath) {
    const raw = await node_fs_1.promises.readFile(filePath, "utf8");
    const lines = raw.split(/\r?\n/).filter((line) => line.trim().length > 0);
    if (lines.length === 0) {
        return [];
    }
    const headers = splitCsvLine(lines[0]).map((value) => value.toLowerCase());
    const rows = [];
    for (const line of lines.slice(1)) {
        const values = splitCsvLine(line);
        const row = {};
        headers.forEach((header, index) => {
            row[header] = values[index] ?? "";
        });
        rows.push(row);
    }
    return rows;
}
async function run() {
    const appRoot = node_path_1.default.resolve(__dirname, "..");
    await loadEnvFile(node_path_1.default.join(appRoot, ".env.local"));
    const supabaseUrl = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !serviceRoleKey) {
        console.error("Missing SUPABASE_URL/NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
        process.exitCode = 1;
        return;
    }
    const csvPath = node_path_1.default.join(appRoot, ...CSV_RELATIVE_PATH);
    const rows = await readCsv(csvPath);
    if (rows.length === 0) {
        console.log("No rows found in CSV.");
        return;
    }
    const supabase = (0, supabase_js_1.createClient)(supabaseUrl, serviceRoleKey, {
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
    const existingSlugs = new Set((existing ?? []).map((club) => club.slug).filter(Boolean));
    const toInsert = [];
    let ignored = 0;
    for (const row of rows) {
        const name = row.nom?.trim();
        if (!name) {
            ignored += 1;
            continue;
        }
        const city = row.ville?.trim() || null;
        const district = row.district?.trim() || null;
        const league = row.ligue?.trim() || null;
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
        const { error } = await supabase.from("external_clubs").insert(batch);
        if (error) {
            console.error("Insert failed:", error.message);
            process.exitCode = 1;
            return;
        }
        inserted += batch.length;
    }
    console.log(`Import terminé: ${inserted} insérés, ${ignored} ignorés (doublons ou vides).`);
}
run().catch((error) => {
    console.error("Import failed:", error);
    process.exitCode = 1;
});
