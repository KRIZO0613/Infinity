export type WidgetKind =
  | "stat"           // une valeur (ex: total €)
  | "chart"          // mini graphique
  | "table"          // aperçu d’un tableau
  | "card"           // aperçu d’une fiche
  | "calendarPeek";  // aperçu calendrier

export type WidgetSize = "xs" | "sm" | "md" | "lg" | "xl";

export type WidgetBase = {
  id: string;
  kind: WidgetKind;
  title?: string;
  description?: string;
  size?: WidgetSize;
  pinned?: boolean; // épinglé au dashboard
};

export type StatWidget = WidgetBase & {
  kind: "stat";
  value: number | string;
  suffix?: string;   // ex: "€", "pts"
};

export type ChartPoint = { x: string | number; y: number };
export type ChartWidget = WidgetBase & {
  kind: "chart";
  series: Array<{ label: string; data: ChartPoint[] }>;
};

export type TableWidget = WidgetBase & {
  kind: "table";
  columns: string[];
  rows: Array<Record<string, string | number>>;
};

export type CardWidget = WidgetBase & {
  kind: "card";
  imageUrl?: string;
  lines: string[]; // petits textes
};

export type CalendarPeekWidget = WidgetBase & {
  kind: "calendarPeek";
  date: string; // ISO yyyy-mm-dd
  items: Array<{ time?: string; label: string }>;
};

export type AnyWidget =
  | StatWidget
  | ChartWidget
  | TableWidget
  | CardWidget
  | CalendarPeekWidget;

export type DashboardState = {
  widgets: AnyWidget[];
  layout: Array<{ id: string; x: number; y: number }>; // simple grid-lite
};
