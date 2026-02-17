import * as dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import * as path from "node:path";

dotenv.config({
  path: path.resolve(process.cwd(), "apps/foot/scripts/.env"),
});

const supabaseUrl = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false },
});

type ElementType = "player" | "ball" | "cone" | "disc";

type CanvasElement = {
  id: string;
  type: ElementType;
  x: number;
  y: number;
  color?: string;
  label?: string;
  size?: number;
};

type FrameSnapshot = {
  id: string;
  elementsSnapshot: Array<{ id: string; x: number; y: number }>;
};

const uid = () => randomUUID();

const makePlayer = (
  x: number,
  y: number,
  label: string,
  color = "#7B66FF",
): CanvasElement => ({
  id: uid(),
  type: "player",
  x,
  y,
  color,
  label,
  size: 0.035,
});

const makeBall = (x: number, y: number): CanvasElement => ({
  id: uid(),
  type: "ball",
  x,
  y,
  size: 0.018,
});

const makeCone = (x: number, y: number): CanvasElement => ({
  id: uid(),
  type: "cone",
  x,
  y,
  color: "#F8C12C",
  size: 0.03,
});

const snapshot = (
  elements: CanvasElement[],
  overrides: Record<string, { x: number; y: number }> = {},
): FrameSnapshot => ({
  id: uid(),
  elementsSnapshot: elements.map((el) => ({
    id: el.id,
    x: overrides[el.id]?.x ?? el.x,
    y: overrides[el.id]?.y ?? el.y,
  })),
});

const createdBy =
  process.env.SEED_USER_ID ?? "00000000-0000-0000-0000-000000000000";

const templates = [
  (() => {
    const players = [
      makePlayer(0.28, 0.3, "1"),
      makePlayer(0.72, 0.3, "2"),
      makePlayer(0.72, 0.7, "3"),
      makePlayer(0.28, 0.7, "4"),
      makePlayer(0.5, 0.5, "D", "#FF6F91"),
    ];
    const ball = makeBall(0.3, 0.32);
    const elements = [...players, ball];
    return {
      title: "Rondo 4v1",
      category: "echauffement",
      duration: 10,
      type: "animated",
      is_global: true,
      created_by: createdBy,
      animation_data: {
        pitchPreset: "standard",
        elements,
        keyframes: [
          snapshot(elements),
          snapshot(elements, { [ball.id]: { x: 0.7, y: 0.32 } }),
          snapshot(elements, { [ball.id]: { x: 0.7, y: 0.68 } }),
        ],
      },
    };
  })(),
  (() => {
    const teamA = [
      makePlayer(0.25, 0.3, "A1", "#6A5CFF"),
      makePlayer(0.25, 0.5, "A2", "#6A5CFF"),
      makePlayer(0.25, 0.7, "A3", "#6A5CFF"),
    ];
    const teamB = [
      makePlayer(0.75, 0.3, "B1", "#00C8B4"),
      makePlayer(0.75, 0.5, "B2", "#00C8B4"),
      makePlayer(0.75, 0.7, "B3", "#00C8B4"),
    ];
    const ball = makeBall(0.35, 0.5);
    const elements = [...teamA, ...teamB, ball];
    return {
      title: "Conservation 3v3",
      category: "echauffement",
      duration: 15,
      type: "animated",
      is_global: true,
      created_by: createdBy,
      animation_data: {
        pitchPreset: "standard",
        elements,
        keyframes: [
          snapshot(elements),
          snapshot(elements, { [ball.id]: { x: 0.5, y: 0.4 } }),
          snapshot(elements, { [ball.id]: { x: 0.65, y: 0.5 } }),
        ],
      },
    };
  })(),
  (() => {
    const a = makePlayer(0.3, 0.6, "1");
    const b = makePlayer(0.5, 0.3, "2");
    const c = makePlayer(0.7, 0.6, "3");
    const ball = makeBall(0.32, 0.58);
    const elements = [a, b, c, ball, makeCone(0.5, 0.8)];
    return {
      title: "Circuit passes triangle",
      category: "echauffement",
      duration: 12,
      type: "animated",
      is_global: true,
      created_by: createdBy,
      animation_data: {
        pitchPreset: "standard",
        elements,
        keyframes: [
          snapshot(elements),
          snapshot(elements, { [ball.id]: { x: 0.5, y: 0.34 } }),
          snapshot(elements, { [ball.id]: { x: 0.7, y: 0.58 } }),
        ],
      },
    };
  })(),
  (() => {
    const passer = makePlayer(0.55, 0.55, "9", "#6A5CFF");
    const finisher = makePlayer(0.75, 0.45, "11", "#00C8B4");
    const ball = makeBall(0.56, 0.52);
    const elements = [passer, finisher, ball];
    return {
      title: "Finition simple",
      category: "finition",
      duration: 10,
      type: "animated",
      is_global: true,
      created_by: createdBy,
      animation_data: {
        pitchPreset: "standard",
        elements,
        keyframes: [
          snapshot(elements),
          snapshot(elements, { [ball.id]: { x: 0.72, y: 0.46 } }),
          snapshot(elements, { [ball.id]: { x: 0.88, y: 0.5 } }),
        ],
      },
    };
  })(),
  (() => {
    const squad = [
      makePlayer(0.25, 0.28, "1", "#6A5CFF"),
      makePlayer(0.25, 0.5, "2", "#6A5CFF"),
      makePlayer(0.25, 0.72, "3", "#6A5CFF"),
      makePlayer(0.42, 0.35, "4", "#6A5CFF"),
      makePlayer(0.75, 0.28, "5", "#00C8B4"),
      makePlayer(0.75, 0.5, "6", "#00C8B4"),
      makePlayer(0.75, 0.72, "7", "#00C8B4"),
      makePlayer(0.58, 0.65, "8", "#00C8B4"),
    ];
    const ball = makeBall(0.5, 0.5);
    const elements = [...squad, ball];
    return {
      title: "Jeu réduit 4v4",
      category: "jeu",
      duration: 20,
      type: "animated",
      is_global: true,
      created_by: createdBy,
      animation_data: {
        pitchPreset: "standard",
        elements,
        keyframes: [
          snapshot(elements),
          snapshot(elements, { [ball.id]: { x: 0.62, y: 0.4 } }),
          snapshot(elements, { [ball.id]: { x: 0.38, y: 0.6 } }),
        ],
      },
    };
  })(),
];

async function run() {
  const { data: existing, error } = await supabase
    .from("training_exercises")
    .select("title")
    .eq("is_global", true);

  if (error) {
    console.error("Failed to fetch existing templates:", error.message);
    process.exitCode = 1;
    return;
  }

  const existingTitles = new Set((existing ?? []).map((row) => row.title));
  const toInsert = templates.filter(
    (template) => !existingTitles.has(template.title),
  );

  if (toInsert.length === 0) {
    console.log("No templates to insert.");
    return;
  }

  const { error: insertError } = await supabase
    .from("training_exercises")
    .insert(toInsert);

  if (insertError) {
    console.error("Insert failed:", insertError.message);
    process.exitCode = 1;
    return;
  }

  console.log(`Inserted ${toInsert.length} templates.`);
}

run().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
