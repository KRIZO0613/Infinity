export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  public: {
    Tables: {
      clubs: {
        Row: {
          id: string;
          name: string;
          slug: string;
          city: string | null;
          type: string;
          plan: string;
          max_seats: number;
          created_by: string | null;
          created_at: string | null;
        };
        Insert: {
          id?: string;
          name: string;
          slug: string;
          city?: string | null;
          type?: string;
          plan?: string;
          max_seats?: number;
          created_by?: string | null;
          created_at?: string | null;
        };
        Update: {
          id?: string;
          name?: string;
          slug?: string;
          city?: string | null;
          type?: string;
          plan?: string;
          max_seats?: number;
          created_by?: string | null;
          created_at?: string | null;
        };
        Relationships: [];
      };
      club_members: {
        Row: {
          club_id: string;
          user_id: string;
          role: string;
          status: string;
          joined_at: string | null;
        };
        Insert: {
          club_id: string;
          user_id: string;
          role: string;
          status?: string;
          joined_at?: string | null;
        };
        Update: {
          club_id?: string;
          user_id?: string;
          role?: string;
          status?: string;
          joined_at?: string | null;
        };
        Relationships: [];
      };
      teams: {
        Row: {
          id: string;
          club_id: string | null;
          user_id: string | null;
          name: string;
          category: string | null;
          level: string | null;
          photo_url: string | null;
          players_count: number;
          custom_fields: Json | null;
          created_at: string | null;
        };
        Insert: {
          id?: string;
          club_id?: string | null;
          user_id?: string | null;
          name: string;
          category?: string | null;
          level?: string | null;
          photo_url?: string | null;
          players_count?: number;
          custom_fields?: Json | null;
          created_at?: string | null;
        };
        Update: {
          id?: string;
          club_id?: string | null;
          user_id?: string | null;
          name?: string;
          category?: string | null;
          level?: string | null;
          photo_url?: string | null;
          players_count?: number;
          custom_fields?: Json | null;
          created_at?: string | null;
        };
        Relationships: [];
      };
      players: {
        Row: {
          id: string;
          club_id: string;
          team_id: string | null;
          first_name: string;
          last_name: string;
          license_number: string;
          photo_url: string | null;
          custom_fields: Json;
          created_at: string | null;
        };
        Insert: {
          id?: string;
          club_id: string;
          team_id?: string | null;
          first_name: string;
          last_name: string;
          license_number: string;
          photo_url?: string | null;
          custom_fields?: Json;
          created_at?: string | null;
        };
        Update: {
          id?: string;
          club_id?: string;
          team_id?: string | null;
          first_name?: string;
          last_name?: string;
          license_number?: string;
          photo_url?: string | null;
          custom_fields?: Json;
          created_at?: string | null;
        };
        Relationships: [];
      };
      team_events: {
        Row: {
          id: string;
          club_id: string;
          team_id: string;
          type: string;
          start_at: string;
          end_at: string | null;
          status: string | null;
          title: string | null;
          created_by: string;
          created_at: string | null;
        };
        Insert: {
          id?: string;
          club_id: string;
          team_id: string;
          type: string;
          start_at: string;
          end_at?: string | null;
          status?: string | null;
          title?: string | null;
          created_by: string;
          created_at?: string | null;
        };
        Update: {
          id?: string;
          club_id?: string;
          team_id?: string;
          type?: string;
          start_at?: string;
          end_at?: string | null;
          status?: string | null;
          title?: string | null;
          created_by?: string;
          created_at?: string | null;
        };
        Relationships: [];
      };
      matches: {
        Row: {
          id: string;
          event_id: string;
          created_at: string | null;
        };
        Insert: {
          id?: string;
          event_id: string;
          created_at?: string | null;
        };
        Update: {
          id?: string;
          event_id?: string;
          created_at?: string | null;
        };
        Relationships: [];
      };
      training_sessions: {
        Row: {
          id: string;
          event_id: string;
          created_at: string | null;
        };
        Insert: {
          id?: string;
          event_id: string;
          created_at?: string | null;
        };
        Update: {
          id?: string;
          event_id?: string;
          created_at?: string | null;
        };
        Relationships: [];
      };
      training_exercises: {
        Row: {
          id: string;
          team_id: string | null;
          title: string;
          category: string;
          duration: number;
          type: string;
          animation_data: Json;
          is_global: boolean;
          created_by: string;
          created_at: string | null;
          updated_at: string | null;
        };
        Insert: {
          id?: string;
          team_id?: string | null;
          title: string;
          category?: string;
          duration?: number;
          type?: string;
          animation_data?: Json;
          is_global?: boolean;
          created_by?: string;
          created_at?: string | null;
          updated_at?: string | null;
        };
        Update: {
          id?: string;
          team_id?: string | null;
          title?: string;
          category?: string;
          duration?: number;
          type?: string;
          animation_data?: Json;
          is_global?: boolean;
          created_by?: string;
          created_at?: string | null;
          updated_at?: string | null;
        };
        Relationships: [];
      };
      event_players: {
        Row: {
          id: string;
          event_id: string;
          player_id: string;
          created_at: string | null;
        };
        Insert: {
          id?: string;
          event_id: string;
          player_id: string;
          created_at?: string | null;
        };
        Update: {
          id?: string;
          event_id?: string;
          player_id?: string;
          created_at?: string | null;
        };
        Relationships: [];
      };
      stat_types: {
        Row: {
          id: string;
          key: string;
          label: string | null;
          created_at: string | null;
        };
        Insert: {
          id?: string;
          key: string;
          label?: string | null;
          created_at?: string | null;
        };
        Update: {
          id?: string;
          key?: string;
          label?: string | null;
          created_at?: string | null;
        };
        Relationships: [];
      };
      player_event_stats: {
        Row: {
          id: string;
          player_id: string;
          event_id: string;
          stat_type_id: string;
          value: number;
          created_at: string | null;
        };
        Insert: {
          id?: string;
          player_id: string;
          event_id: string;
          stat_type_id: string;
          value: number;
          created_at?: string | null;
        };
        Update: {
          id?: string;
          player_id?: string;
          event_id?: string;
          stat_type_id?: string;
          value?: number;
          created_at?: string | null;
        };
        Relationships: [];
      };
      match_events: {
        Row: {
          id: string;
          match_id: string;
          created_at: string | null;
        };
        Insert: {
          id?: string;
          match_id: string;
          created_at?: string | null;
        };
        Update: {
          id?: string;
          match_id?: string;
          created_at?: string | null;
        };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
