import { Card, Reading } from '../types';

export const CARDS: Record<string, Card> = {
  'fool': { id: 'fool', name: 'The Fool', numeral: '0', arcana: 'Major', generalMeaning: 'New beginnings, innocence, spontaneity, a free spirit.' },
  'magician': { id: 'magician', name: 'The Magician', numeral: 'I', arcana: 'Major', generalMeaning: 'Manifestation, resourcefulness, power, inspired action.' },
  'high_priestess': { id: 'high_priestess', name: 'The High Priestess', numeral: 'II', arcana: 'Major', generalMeaning: 'Intuition, sacred knowledge, divine feminine, the subconscious mind.' },
  'empress': { id: 'empress', name: 'The Empress', numeral: 'III', arcana: 'Major', generalMeaning: 'Femininity, beauty, nature, nurturing, abundance.' },
  'emperor': { id: 'emperor', name: 'The Emperor', numeral: 'IV', arcana: 'Major', generalMeaning: 'Authority, establishment, structure, a father figure.' },
  'hierophant': { id: 'hierophant', name: 'The Hierophant', numeral: 'V', arcana: 'Major', generalMeaning: 'Spiritual wisdom, religious beliefs, conformity, tradition.' },
  'lovers': { id: 'lovers', name: 'The Lovers', numeral: 'VI', arcana: 'Major', generalMeaning: 'Love, harmony, relationships, values alignment, choices.' },
  'chariot': { id: 'chariot', name: 'The Chariot', numeral: 'VII', arcana: 'Major', generalMeaning: 'Control, willpower, success, action, determination.' },
  'strength': { id: 'strength', name: 'Strength', numeral: 'VIII', arcana: 'Major', generalMeaning: 'Strength, courage, persuasion, influence, compassion.' },
  'hermit': { id: 'hermit', name: 'The Hermit', numeral: 'IX', arcana: 'Major', generalMeaning: 'Soul-searching, introspection, being alone, inner guidance.' },
  'wheel_of_fortune': { id: 'wheel_of_fortune', name: 'Wheel of Fortune', numeral: 'X', arcana: 'Major', generalMeaning: 'Good luck, karma, life cycles, destiny, a turning point.' },
  'justice': { id: 'justice', name: 'Justice', numeral: 'XI', arcana: 'Major', generalMeaning: 'Justice, fairness, truth, cause and effect, law.' },
  'hanged_man': { id: 'hanged_man', name: 'The Hanged Man', numeral: 'XII', arcana: 'Major', generalMeaning: 'Pause, surrender, letting go, new perspectives.' },
  'death': { id: 'death', name: 'Death', numeral: 'XIII', arcana: 'Major', generalMeaning: 'Endings, change, transformation, transition.' },
  'temperance': { id: 'temperance', name: 'Temperance', numeral: 'XIV', arcana: 'Major', generalMeaning: 'Balance, moderation, patience, purpose.' },
  'devil': { id: 'devil', name: 'The Devil', numeral: 'XV', arcana: 'Major', generalMeaning: 'Shadow self, attachment, addiction, restriction, sexuality.' },
  'tower': { id: 'tower', name: 'The Tower', numeral: 'XVI', arcana: 'Major', generalMeaning: 'Sudden change, upheaval, chaos, revelation, awakening.' },
  'star': { id: 'star', name: 'The Star', numeral: 'XVII', arcana: 'Major', generalMeaning: 'Hope, faith, purpose, renewal, spirituality.' },
  'moon': { id: 'moon', name: 'The Moon', numeral: 'XVIII', arcana: 'Major', generalMeaning: 'Illusion, fear, anxiety, subconscious, intuition.' },
  'sun': { id: 'sun', name: 'The Sun', numeral: 'XIX', arcana: 'Major', generalMeaning: 'Positivity, fun, warmth, success, vitality.' },
  'judgement': { id: 'judgement', name: 'Judgement', numeral: 'XX', arcana: 'Major', generalMeaning: 'Judgement, rebirth, inner calling, absolution.' },
  'world': { id: 'world', name: 'The World', numeral: 'XXI', arcana: 'Major', generalMeaning: 'Completion, integration, accomplishment, travel.' },
  'ace_of_pentacles': { id: 'ace_of_pentacles', name: 'Ace of Pentacles', numeral: 'Ace', arcana: 'Minor', suit: 'Pentacles', generalMeaning: 'A new financial or career opportunity, manifestation, abundance.' },
  'two_of_cups': { id: 'two_of_cups', name: 'Two of Cups', numeral: 'II', arcana: 'Minor', suit: 'Cups', generalMeaning: 'Unified love, partnership, mutual attraction.' },
  'three_of_swords': { id: 'three_of_swords', name: 'Three of Swords', numeral: 'III', arcana: 'Minor', suit: 'Swords', generalMeaning: 'Heartbreak, emotional pain, sorrow, grief, hurt.' },
  'eight_of_wands': { id: 'eight_of_wands', name: 'Eight of Wands', numeral: 'VIII', arcana: 'Minor', suit: 'Wands', generalMeaning: 'Rapid action, movement, quick decisions.' },
};

export const MOCK_READINGS: Reading[] = [
  {
    id: 'r_1',
    date: '2026-01-14T10:00:00Z',
    querent: 'Julian Thorne',
    question: 'Should I leave my current esoteric order to walk my own path?',
    type: 'Celtic Cross',
    summary: 'A journey of solitude is necessary, but it will be challenged by material attachments.',
    drawnCards: [
      {
        card: CARDS['hermit'],
        position: { id: 'present', name: 'The Present', description: 'Current state of the querent.' },
        specificMeaning: 'You are currently deeply introspective and seeking your own inner truth.',
        isReversed: false,
      },
      {
        card: CARDS['devil'],
        position: { id: 'challenge', name: 'The Challenge', description: 'The immediate problem.' },
        specificMeaning: 'Your material attachments or fears of losing security are binding you.',
        isReversed: false,
      },
      {
        card: CARDS['moon'],
        position: { id: 'past', name: 'The Past', description: 'Events leading up to the present.' },
        specificMeaning: 'Past illusions or deceptions have created your current need for truth.',
        isReversed: false,
      },
      {
        card: CARDS['star'],
        position: { id: 'future', name: 'The Future', description: 'What is likely to occur next.' },
        specificMeaning: 'Hope and healing will follow once you embrace your solitary path.',
        isReversed: false,
      },
      {
        card: CARDS['high_priestess'],
        position: { id: 'above', name: 'Above (Conscious)', description: 'Querent\'s goals and conscious mind.' },
        specificMeaning: 'You consciously desire deeper spiritual wisdom and connection to the divine.',
        isReversed: false,
      },
      {
        card: CARDS['hanged_man'],
        position: { id: 'below', name: 'Below (Subconscious)', description: 'Underlying foundation.' },
        specificMeaning: 'Subconsciously, you feel suspended, waiting for a shift in perspective.',
        isReversed: false,
      },
      {
        card: CARDS['fool'],
        position: { id: 'advice', name: 'Advice', description: 'What the querent should do.' },
        specificMeaning: 'Take a leap of faith. Trust the universe and step into the unknown.',
        isReversed: false,
      },
      {
        card: CARDS['hierophant'],
        position: { id: 'external', name: 'External Influences', description: 'Environment and others.' },
        specificMeaning: 'The esoteric order itself or orthodox traditions exert pressure on you.',
        isReversed: false,
      },
      {
        card: CARDS['death'],
        position: { id: 'hopes_fears', name: 'Hopes & Fears', description: 'Querent\'s hopes or fears.' },
        specificMeaning: 'You fear the massive transformation this change will bring.',
        isReversed: false,
      },
      {
        card: CARDS['world'],
        position: { id: 'outcome', name: 'Outcome', description: 'The ultimate result.' },
        specificMeaning: 'A successful completion of this cycle, bringing you wholeness and enlightenment.',
        isReversed: false,
      }
    ]
  },
  {
    id: 'r_2',
    date: '2026-01-13T14:30:00Z',
    querent: 'Sarah Miller',
    question: 'What is the nature of my new relationship?',
    type: '3-Card Insight',
    summary: 'A strong pure connection that requires balancing intellect and emotion.',
    drawnCards: [
      {
        card: CARDS['two_of_cups'],
        position: { id: 'past', name: 'The Past', description: 'Foundation of the question.' },
        specificMeaning: 'The relationship began with a strong, mutual emotional connection.',
        isReversed: false,
      },
      {
        card: CARDS['three_of_swords'],
        position: { id: 'present', name: 'The Present', description: 'Current state.' },
        specificMeaning: 'There is currently some heartache, perhaps due to miscommunication or past wounds resurfacing.',
        isReversed: false,
      },
      {
        card: CARDS['temperance'],
        position: { id: 'future', name: 'The Future', description: 'Expected outcome.' },
        specificMeaning: 'Patience and moderation will heal the rift, bringing balance.',
        isReversed: false,
      }
    ]
  },
  {
    id: 'r_3',
    date: '2026-01-12T09:15:00Z',
    querent: 'Leo Vance',
    question: 'How will my new business venture unfold?',
    type: '3-Card Insight',
    summary: 'Rapid action leading to material success if grounded.',
    drawnCards: [
      {
        card: CARDS['ace_of_pentacles'],
        position: { id: 'past', name: 'Past/Foundation', description: 'Root of the situation.' },
        specificMeaning: 'You started with a solid, tangible seed of an idea or investment.',
        isReversed: false,
      },
      {
        card: CARDS['eight_of_wands'],
        position: { id: 'present', name: 'Present Context', description: 'Current situation.' },
        specificMeaning: 'Things are moving very quickly right now. Keep up with the momentum.',
        isReversed: false,
      },
      {
        card: CARDS['emperor'],
        position: { id: 'future', name: 'Future Path', description: 'Where this is heading.' },
        specificMeaning: 'You will establish a structured, authoritative presence in your field.',
        isReversed: false,
      }
    ]
  }
];
