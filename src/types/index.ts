export interface BareCard {
  order: number;
  position: string | null;
  side: string | null;
  label: string | null;
  name: string;
}

export interface ReadingListItem {
  id: string;
  spread_type: string;
  reader: string;
  reading_date: string;
  submitted_at: string;
  question_summary: string | null;
  card_count: number;
  cards: BareCard[];
}

export interface ReadingListResponse {
  items: ReadingListItem[];
  total: number;
  limit: number;
  offset: number;
}

export interface ReadingDetail {
  id: string;
  spread_type: string;
  reader: string;
  record_email: string | null;
  reading_date: string;
  submitted_at: string;
  question: string | null;
  notes: string | null;
  interpretations: Record<string, string | null>;
  cards: any[]; 
}

// Internal UI types
export interface Card {
  id: string;
  name: string;
  numeral: string;
  arcana: string;
  suit?: string;
  generalMeaning: string;
}

export interface SpreadPosition {
  id: string;
  name: string;
  description: string;
}

export interface DrawnCard {
  card: Card;
  position: SpreadPosition;
  specificMeaning: string;
  isReversed: boolean;
  summary?: string; // per-card interpretation summary, attached for the Oracle synthesis
}

export interface Reading {
  id: string;
  date: string;
  querent: string;
  question: string;
  type: string;
  drawnCards: DrawnCard[];
  summary: string;
  notes?: string | null;
  interpretations?: Record<string, string | null>;
}
