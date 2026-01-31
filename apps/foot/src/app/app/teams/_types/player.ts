import type { PlayerFieldType } from "@/app/app/teams/_config/playerFieldLibrary";

export type PlayerCustomField = {
  id: string;
  label: string;
  type: PlayerFieldType;
  value: string;
  order: number;
  active?: boolean;
};

export type Player = {
  id: string;
  club_id: string;
  team_id: string | null;
  first_name: string;
  last_name: string;
  license_number: string;
  photo_url: string | null;
  custom_fields: PlayerCustomField[];
  created_at?: string;
};

export type PlayerPayload = {
  club_id: string;
  team_id: string;
  first_name: string;
  last_name: string;
  license_number: string;
  photo_url: string | null;
  custom_fields: PlayerCustomField[];
};
