import { Reading, ReadingDetail, ReadingListItem, DrawnCard, Card, SpreadPosition, BareCard } from '../types';
import { CARDS } from '../data/mockData';

function normalizeCardName(name: string | undefined): string {
  if (!name) return 'unknown';
  let normalized = name.toLowerCase();
  if (normalized.startsWith("the ")) {
    normalized = normalized.substring(4);
  }
  return normalized.replace(/ /g, "_");
}

function getCardMetadata(apiCard: any): Card {
  // Support both list view shape (c.name) and detail view shape (c.card.name)
  const name = apiCard.name || (apiCard.card && apiCard.card.name) || 'Unknown';
  const normalizedName = normalizeCardName(name);
  const metadata = CARDS[normalizedName];
  
  if (metadata) {
    return {
      id: normalizedName,
      name: name,
      numeral: metadata.numeral || '?',
      arcana: metadata.arcana || 'Unknown',
      suit: metadata.suit,
      generalMeaning: metadata.generalMeaning || 'No description available.'
    };
  }

  // Fallback parsing for unknown cards that aren't mapped in mockData
  let arcana = (apiCard.card && apiCard.card.arcana) || 'Unknown';
  let suit = (apiCard.card && apiCard.card.suit) || undefined;
  let numeral = '?';

  if (suit === "") suit = undefined;

  if (suit) {
    if (suit.toLowerCase() === 'cups') suit = 'Chalices';
    arcana = 'Minor';
  } else {
    if (arcana.includes('Major') || arcana === 'MajorArcana' || arcana === 'MajesticArcana') {
       arcana = 'Major';
    }
  }

  const lowerName = name.toLowerCase();
  
  if (lowerName.includes(' of ')) {
    arcana = 'Minor';
    const parts = lowerName.split(' of ');
    if (parts.length === 2) {
      numeral = parts[0].charAt(0).toUpperCase() + parts[0].slice(1);
      const s = parts[1].trim();
      if (!suit) suit = s.charAt(0).toUpperCase() + s.slice(1);
      if (suit.toLowerCase() === 'cups') suit = 'Chalices';
    }
  } else if (name !== 'Unknown') {
    if (arcana === 'Unknown') arcana = 'Major'; 
  }

  return {
    id: normalizedName,
    name: name,
    numeral: numeral,
    arcana: arcana,
    suit: suit,
    generalMeaning: 'No description available.'
  };
}

function normalizePositionId(id: string | number | null | undefined): string {
  if (!id) return '';
  const normalized = String(id).toLowerCase();
  if (normalized.includes('present')) return 'present';
  if (normalized.includes('challenge')) return 'challenge';
  if (normalized.includes('past')) return 'past';
  if (normalized.includes('future')) return 'future';
  if (normalized.includes('above') || normalized.includes('conscious') || normalized.includes('goal')) return 'above';
  if (normalized.includes('below') || normalized.includes('subconscious') || normalized.includes('foundation')) return 'below';
  if (normalized.includes('advice') || normalized.includes('guidance')) return 'advice';
  if (normalized.includes('external')) return 'external';
  if (normalized.includes('hope') || normalized.includes('fear')) return 'hopes_fears';
  if (normalized.includes('outcome') || normalized.includes('result')) return 'outcome';
  return normalized.replace(/ /g, '_');
}

export function mapListItemToReading(item: ReadingListItem): Reading {
  return {
    id: item.id,
    date: item.reading_date,
    querent: item.reader || 'Unknown Reader', 
    question: item.question_summary || 'No question provided.',
    type: item.spread_type,
    drawnCards: Array.isArray(item.cards) ? item.cards.map((c: BareCard) => {
      const posId = normalizePositionId(c.position || c.label) + (c.side ? `_${c.side}` : '');
      return {
        card: getCardMetadata(c),
        position: {
           id: posId || `pos_${c.order}`,
           name: (c.label || c.position || `Position ${c.order}`) + (c.side ? ` (${c.side})` : ''),
           description: ''
        },
        specificMeaning: '',
        isReversed: c.side === 'reversed'
      }
    }) : [],
    summary: item.question_summary || '',
    notes: null
  };
}

export function mapDetailToReading(detail: ReadingDetail): Reading {
  return {
    id: detail.id,
    date: detail.reading_date,
    querent: detail.reader || 'Unknown Reader',
    question: detail.question || 'No question recorded.',
    type: detail.spread_type,
    drawnCards: Array.isArray(detail.cards) ? detail.cards.map((c: any) => {
      const card = getCardMetadata(c);
      const rawPosId = c.position || c.label || `pos_${c.order}`;
      const posId = normalizePositionId(rawPosId) + (c.side ? `_${c.side}` : '');
      
      const interpretations = detail.interpretations || {};
      const meaning = interpretations[c.side || ''] ||
                      interpretations[posId] || 
                      interpretations[rawPosId] || 
                      interpretations[c.label] || 
                      interpretations[c.position] || 
                      '';
      
      return {
        card,
        position: {
          id: posId,
          name: (c.label || c.position || `Position ${c.order}`) + (c.side ? ` (${c.side})` : ''),
          description: '' 
        },
        specificMeaning: meaning,
        isReversed: c.side === 'reversed'
      };
    }) : [],
    summary: detail.notes || '',
    notes: detail.notes,
    interpretations: detail.interpretations
  };
}

export async function fetchReadings(): Promise<Reading[]> {
  try {
    const response = await fetch('/api/readings');
    const data = await response.json();
    console.log('[API] fetchReadings response:', data);
    
    if (!response.ok) {
      throw new Error(`Failed to fetch readings: ${response.status} ${JSON.stringify(data)}`);
    }
    
    if (!data || !Array.isArray(data.items)) {
      console.warn('API returned unexpected format for readings list:', data);
      return [];
    }
    return data.items.map(mapListItemToReading);
  } catch (error) {
    console.error('Error in fetchReadings:', error);
    throw error;
  }
}

export async function fetchReadingDetail(id: string): Promise<Reading> {
  try {
    const response = await fetch(`/api/readings/${id}`);
    if (!response.ok) {
      throw new Error(`Failed to fetch reading detail: ${response.status} ${response.statusText}`);
    }
    const data = await response.json();
    return mapDetailToReading(data);
  } catch (error) {
    console.error(`Error in fetchReadingDetail for id ${id}:`, error);
    throw error;
  }
}
