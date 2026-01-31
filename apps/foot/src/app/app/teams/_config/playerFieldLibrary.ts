export type PlayerFieldType = "text" | "number" | "date" | "select" | "link";

export type PlayerFieldDefinition = {
  key: string;
  label: string;
  type: PlayerFieldType;
  options?: string[];
};

export const PLAYER_FIELD_LIBRARY: PlayerFieldDefinition[] = [
  {
    key: "position",
    label: "Poste",
    type: "select",
    options: ["Gardien", "Defenseur", "Milieu", "Attaquant"],
  },
  { key: "strength", label: "Point fort", type: "text" },
  {
    key: "strong_foot",
    label: "Pied fort",
    type: "select",
    options: ["Gauche", "Droit", "Ambidextre"],
  },
  { key: "height", label: "Taille", type: "number" },
  { key: "weight", label: "Poids", type: "number" },
  { key: "birth_year", label: "Annee de naissance", type: "number" },
  { key: "jersey_number", label: "Numero de maillot", type: "number" },
  { key: "district", label: "District", type: "text" },
  { key: "official_link", label: "Lien fiche officielle", type: "link" },
];
