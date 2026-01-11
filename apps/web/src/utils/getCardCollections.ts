import type {
  Project,
  SummaryBlock,
  SummaryCardEntry,
  SummaryCardField,
  SummarySection,
} from "@/store/projectStore";

export type CardCollectionItem = {
  id: string;
  title: string;
  label: string;
  fieldValues: string[];
};

export type CardCollection = {
  collectionId: string;
  title: string;
  items: CardCollectionItem[];
  template?: SummaryCardField[];
};

const isAutoTitle = (title: string, cardId: string) => {
  const normalized = title.trim().toLowerCase();
  if (!normalized) return true;
  if (normalized === cardId.trim().toLowerCase()) return true;
  return /^card(s)?[-_\\d]/.test(normalized);
};

const getCardLabel = (card: SummaryCardEntry, template: SummaryCardField[]) => {
  const title = card.title?.trim() ?? "";
  if (title && !isAutoTitle(title, card.id)) return title;
  for (const field of template) {
    const value = card.values?.[field.id]?.trim();
    if (value) return value;
  }
  const fallback = Object.values(card.values ?? {}).find((value) => value.trim());
  return fallback?.trim() || "Carte";
};

const collectBlocks = (sections?: SummarySection[]) => {
  if (!sections) return [] as SummaryBlock[];
  return sections.flatMap((section) => section.blocks ?? []);
};

export const getCardCollections = (project?: Project | null): CardCollection[] => {
  if (!project) return [];
  const blocks: SummaryBlock[] = [
    ...collectBlocks(project.summarySections),
    ...(project.pages ?? []).flatMap((page) => collectBlocks(page.summarySections)),
  ];
  const seen = new Set<string>();
  const collections: CardCollection[] = [];
  let untitledIndex = 1;
  blocks.forEach((block) => {
    if (block.type !== "card") return;
    if (seen.has(block.id)) return;
    seen.add(block.id);
    const template = block.template ?? [];
    const items = (block.cards ?? []).map((card) => {
      const rawValues = template.length
        ? template.map((field) => card.values?.[field.id] ?? "")
        : Object.values(card.values ?? {});
      const fieldValues = rawValues.map((value) => value.trim());
      const displayLabel = fieldValues.filter(Boolean).slice(0, 2).join(" ").trim();
      return {
        id: card.id,
        title: card.title ?? "",
        label: displayLabel || getCardLabel(card, template),
        fieldValues,
      };
    });
    const baseTitle = block.title?.trim() || "";
    const title = baseTitle || `Collection ${untitledIndex++}`;
    collections.push({
      collectionId: block.id,
      title,
      items,
      template,
    });
  });
  return collections;
};
