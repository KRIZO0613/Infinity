export type TeamFieldType = "text" | "number" | "year" | "date" | "select";

export type TeamFieldDefinition = {
  key: string;
  label: string;
  type: TeamFieldType;
  options?: string[];
};

export const TEAM_FIELD_LIBRARY: TeamFieldDefinition[] = [
  // STAFF
  { key: "coach", label: "Coach", type: "text" },
  { key: "assistant_coach", label: "Coach adjoint", type: "text" },
  { key: "gk_coach", label: "Entraineur gardiens", type: "text" },
  { key: "category_responsible", label: "Responsable categorie", type: "text" },
  { key: "manager", label: "Dirigeant", type: "text" },
  { key: "parents_contact", label: "Referent parents", type: "text" },

  // EQUIPE / GROUPE
  {
    key: "category",
    label: "Categorie",
    type: "select",
    options: [
      "U6",
      "U7",
      "U8",
      "U9",
      "U10",
      "U11",
      "U12",
      "U13",
      "U14",
      "U15",
      "U16",
      "U17",
      "U18",
      "Seniors",
      "Veterans",
    ],
  },
  { key: "year", label: "Annee", type: "year" },
  { key: "group", label: "Groupe", type: "text" },
  {
    key: "level",
    label: "Niveau",
    type: "select",
    options: [
      "Departemental 3",
      "Departemental 2",
      "Departemental 1",
      "Regional 3",
      "Regional 2",
      "Regional 1",
      "Niv 1",
      "Niv 2",
      "Niv 3",
      "Niv 4",
      "Espoir",
      "Gabit robert",
      "Criterium",
    ],
  },
  { key: "squad_size", label: "Effectif max", type: "number" },
  { key: "season_goal", label: "Objectif saison", type: "text" },

  // LOGISTIQUE
  { key: "pitch", label: "Terrain", type: "text" },
  { key: "stadium", label: "Stade", type: "text" },
  { key: "pitch_address", label: "Adresse terrain", type: "text" },
  {
    key: "training_day",
    label: "Jour entrainement",
    type: "select",
    options: [
      "Lundi",
      "Mardi",
      "Mercredi",
      "Jeudi",
      "Vendredi",
      "Samedi",
      "Dimanche",
    ],
  },
  { key: "training_time", label: "Heure entrainement", type: "text" },
  { key: "locker_room", label: "Vestiaire", type: "text" },

  // COMPETITION
  { key: "championship", label: "Championnat", type: "text" },
  { key: "district", label: "District", type: "text" },
  { key: "league", label: "Ligue", type: "text" },
  { key: "season", label: "Saison", type: "text" },
  {
    key: "phase",
    label: "Phase",
    type: "select",
    options: ["Aller", "Retour"],
  },
  { key: "pool", label: "Poule", type: "text" },

  // CLUB / ADMIN
  { key: "team_code", label: "Code equipe", type: "text" },
  { key: "club_code", label: "Code club", type: "text" },
  { key: "team_number", label: "Numero equipe", type: "number" },
  { key: "jersey_color", label: "Couleur maillot", type: "text" },
  { key: "sponsor", label: "Sponsor", type: "text" },

  // BONUS / NOTE
  { key: "coach_notes", label: "Notes coach", type: "text" },
  { key: "special_rule", label: "Regle specifique", type: "text" },
  { key: "specificity", label: "Particularite", type: "text" },
  { key: "strength", label: "Point fort", type: "text" },
  { key: "weakness", label: "Axe de progression", type: "text" },
];
