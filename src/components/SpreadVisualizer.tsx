import React from 'react';
import { DrawnCard } from '../types';

interface SpreadVisualizerProps {
  drawnCards: DrawnCard[];
  selectedCardId: string | null;
  onCardClick: (card: DrawnCard) => void;
  spreadType: string;
}

export function SpreadVisualizer({ drawnCards, selectedCardId, onCardClick, spreadType }: SpreadVisualizerProps) {
  if (spreadType === 'Celtic Cross') {
    return <CelticCross cards={drawnCards} selectedCardId={selectedCardId} onCardClick={onCardClick} />;
  }
  if (spreadType === 'ten_card_inner_outer') {
    return <TenCardInnerOuter cards={drawnCards} selectedCardId={selectedCardId} onCardClick={onCardClick} />;
  }
  
  // Default simple row layout (like 3-card spread)
  return (
    <div className="flex flex-wrap justify-center gap-6 p-8">
      {drawnCards.map((dc) => (
        <CardVisual 
          key={dc.position.id} 
          drawnCard={dc} 
          isSelected={selectedCardId === dc.card.id}
          onClick={() => onCardClick(dc)} 
        />
      ))}
    </div>
  );
}

function CelticCross({ cards, selectedCardId, onCardClick }: { cards: DrawnCard[], selectedCardId: string | null, onCardClick: (card: DrawnCard) => void }) {
  const getCard = (posId: string) => cards.find(c => c.position.id === posId);

  const present = getCard('present');
  const challenge = getCard('challenge');
  const past = getCard('past');
  const future = getCard('future');
  const above = getCard('above');
  const below = getCard('below');
  
  const advice = getCard('advice');
  const external = getCard('external');
  const hopesFears = getCard('hopes_fears');
  const outcome = getCard('outcome');

  return (
    <div className="flex justify-center items-center gap-16 p-8 overflow-x-auto min-h-[600px]">
      {/* The Cross */}
      <div className="relative w-[400px] h-[500px]">
        {above && <div className="absolute top-0 left-1/2 -translate-x-1/2"><CardVisual drawnCard={above} isSelected={selectedCardId === above.card.id} onClick={() => onCardClick(above)} /></div>}
        {below && <div className="absolute bottom-0 left-1/2 -translate-x-1/2"><CardVisual drawnCard={below} isSelected={selectedCardId === below.card.id} onClick={() => onCardClick(below)} /></div>}
        {past && <div className="absolute top-1/2 left-0 -translate-y-1/2"><CardVisual drawnCard={past} isSelected={selectedCardId === past.card.id} onClick={() => onCardClick(past)} /></div>}
        {future && <div className="absolute top-1/2 right-0 -translate-y-1/2"><CardVisual drawnCard={future} isSelected={selectedCardId === future.card.id} onClick={() => onCardClick(future)} /></div>}
        
        {/* Center Cross */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
          {present && <CardVisual drawnCard={present} isSelected={selectedCardId === present.card.id} onClick={() => onCardClick(present)} />}
          {challenge && (
            <div className="absolute top-0 left-0 w-full h-full rotate-90 z-10 pointer-events-none transform origin-center">
               <div className="pointer-events-auto shadow-2xl">
                 <CardVisual drawnCard={challenge} isSelected={selectedCardId === challenge.card.id} onClick={() => onCardClick(challenge)} />
               </div>
            </div>
          )}
        </div>
      </div>

      {/* The Staff */}
      <div className="flex flex-col-reverse gap-6">
        {advice && <CardVisual drawnCard={advice} isSelected={selectedCardId === advice.card.id} onClick={() => onCardClick(advice)} />}
        {external && <CardVisual drawnCard={external} isSelected={selectedCardId === external.card.id} onClick={() => onCardClick(external)} />}
        {hopesFears && <CardVisual drawnCard={hopesFears} isSelected={selectedCardId === hopesFears.card.id} onClick={() => onCardClick(hopesFears)} />}
        {outcome && <CardVisual drawnCard={outcome} isSelected={selectedCardId === outcome.card.id} onClick={() => onCardClick(outcome)} />}
      </div>
    </div>
  );
}

const CardVisual: React.FC<{ drawnCard: DrawnCard, isSelected: boolean, onClick: () => void }> = ({ drawnCard, isSelected, onClick }) => {
  const { card } = drawnCard;
  const [imgError, setImgError] = React.useState(false);

  return (
    <div 
      onClick={onClick}
      className={`relative w-24 h-36 bg-[#0D0D12] border-2 rounded-lg flex flex-col justify-center items-center cursor-pointer transition-all duration-300 overflow-hidden
        ${isSelected ? 'border-[#DEB564] shadow-[0_0_20px_rgba(212,175,55,0.4)] scale-110 z-20' : 'border-white/20 hover:border-white/50 hover:scale-105 z-0'}`}
    >
      {!imgError && (
        <img 
          src={`/cards/${card.id}.png`} 
          alt={card.name}
          onError={() => setImgError(true)}
          className="absolute inset-0 w-full h-full object-cover z-0"
        />
      )}
      
      <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent z-10 rounded-lg pointer-events-none"></div>
      
      {imgError && (
        <div className="text-center z-20 absolute inset-0 flex items-center justify-center pointer-events-none">
          <span className="font-serif text-3xl opacity-20 text-[#DEB564]">{card.numeral}</span>
        </div>
      )}

      <div className="absolute bottom-2 left-0 w-full text-center z-20 px-1">
        <p className="text-[9px] uppercase tracking-wider text-amber-100/90 truncate">{card.name}</p>
        <p className="text-[7px] text-[#FFFAE3]/40 uppercase mt-0.5">{drawnCard.position.name}</p>
      </div>
    </div>
  );
}

function TenCardInnerOuter({ cards, selectedCardId, onCardClick }: { cards: DrawnCard[], selectedCardId: string | null, onCardClick: (card: DrawnCard) => void }) {
  const getCard = (posName: string, side: string) => cards.find(c => c.position.name.toLowerCase().includes(posName) && c.position.name.toLowerCase().includes(side));

  // External
  const extRuler = getCard('ruler', 'external');
  const fire = getCard('fire', 'external');
  const water = getCard('water', 'external');
  const air = getCard('air', 'external');
  const earth = getCard('earth', 'external');

  // Internal
  const intRuler = getCard('ruler', 'internal');
  const soul = getCard('soul', 'internal');
  const heart = getCard('heart', 'internal');
  const head = getCard('head', 'internal');
  const gut = getCard('gut', 'internal');

  return (
    <div className="flex flex-col items-center justify-center p-8 overflow-x-auto min-h-[700px] w-full">
      <div className="relative w-[500px] h-[500px] mx-auto scale-90 sm:scale-100">
        {/* Outer Circle */}
        {fire && <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-4"><CardVisual drawnCard={fire} isSelected={selectedCardId === fire.card.id} onClick={() => onCardClick(fire)} /></div>}
        {water && <div className="absolute top-1/2 right-0 translate-x-4 -translate-y-1/2"><CardVisual drawnCard={water} isSelected={selectedCardId === water.card.id} onClick={() => onCardClick(water)} /></div>}
        {earth && <div className="absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-4"><CardVisual drawnCard={earth} isSelected={selectedCardId === earth.card.id} onClick={() => onCardClick(earth)} /></div>}
        {air && <div className="absolute top-1/2 left-0 -translate-x-4 -translate-y-1/2"><CardVisual drawnCard={air} isSelected={selectedCardId === air.card.id} onClick={() => onCardClick(air)} /></div>}
        
        {/* Outer Ruler - Top Right */}
        {extRuler && <div className="absolute -top-8 -right-8"><CardVisual drawnCard={extRuler} isSelected={selectedCardId === extRuler.card.id} onClick={() => onCardClick(extRuler)} /></div>}

        {/* Inner Circle */}
        {head && <div className="absolute top-1/4 left-1/2 -translate-x-1/2 translate-y-2"><CardVisual drawnCard={head} isSelected={selectedCardId === head.card.id} onClick={() => onCardClick(head)} /></div>}
        {heart && <div className="absolute top-1/2 right-1/4 -translate-x-2 -translate-y-1/2"><CardVisual drawnCard={heart} isSelected={selectedCardId === heart.card.id} onClick={() => onCardClick(heart)} /></div>}
        {gut && <div className="absolute bottom-1/4 left-1/2 -translate-x-1/2 -translate-y-2"><CardVisual drawnCard={gut} isSelected={selectedCardId === gut.card.id} onClick={() => onCardClick(gut)} /></div>}
        {soul && <div className="absolute top-1/2 left-1/4 translate-x-2 -translate-y-1/2"><CardVisual drawnCard={soul} isSelected={selectedCardId === soul.card.id} onClick={() => onCardClick(soul)} /></div>}
        
        {/* Center / Inner Ruler */}
        {intRuler && <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2"><CardVisual drawnCard={intRuler} isSelected={selectedCardId === intRuler.card.id} onClick={() => onCardClick(intRuler)} /></div>}
      </div>
    </div>
  );
}
