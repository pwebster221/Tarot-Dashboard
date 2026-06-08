import React, { useState } from 'react';
import { motion } from 'motion/react';
import { DrawnCard } from '../types';

interface SpreadVisualizerProps {
  readingId: string;
  drawnCards: DrawnCard[];
  selectedCardId: string | null;
  onCardClick: (card: DrawnCard) => void;
  spreadType: string;
}

export function SpreadVisualizer({ readingId: _readingId, drawnCards, selectedCardId, onCardClick, spreadType }: SpreadVisualizerProps) {
  const [positions, setPositions] = useState<Record<string, { x: number, y: number }>>({});

  const handleDragEnd = (cardId: string, offset: { x: number, y: number }) => {
    const currentX = positions[cardId]?.x || 0;
    const currentY = positions[cardId]?.y || 0;
    setPositions(prev => ({
      ...prev,
      [cardId]: { x: currentX + offset.x, y: currentY + offset.y }
    }));
  };

  const layoutProps = { cards: drawnCards, selectedCardId, onCardClick, positions, onDragEnd: handleDragEnd };

  if (spreadType === 'Celtic Cross') {
    return <CelticCross {...layoutProps} />;
  }
  if (spreadType === 'ten_card_inner_outer') {
    return <TenCardInnerOuter {...layoutProps} />;
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
          position={positions[dc.card.id] || { x: 0, y: 0 }}
          onDragEnd={(offset) => handleDragEnd(dc.card.id, offset)}
        />
      ))}
    </div>
  );
}

type LayoutProps = { 
  cards: DrawnCard[], 
  selectedCardId: string | null, 
  onCardClick: (card: DrawnCard) => void,
  positions: Record<string, { x: number, y: number }>,
  onDragEnd: (cardId: string, offset: { x: number, y: number }) => void
};

function CelticCross({ cards, selectedCardId, onCardClick, positions, onDragEnd }: LayoutProps) {
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

  const renderCard = (card: DrawnCard | undefined) => {
    if (!card) return null;
    return (
      <CardVisual 
        drawnCard={card} 
        isSelected={selectedCardId === card.card.id} 
        onClick={() => onCardClick(card)} 
        position={positions[card.card.id] || { x: 0, y: 0 }}
        onDragEnd={(offset) => onDragEnd(card.card.id, offset)}
      />
    );
  };

  return (
    <div className="flex justify-center items-center gap-16 p-8 overflow-x-auto min-h-[600px]">
      {/* The Cross */}
      <div className="relative w-[400px] h-[500px]">
        {above && <div className="absolute top-0 left-1/2 -translate-x-1/2">{renderCard(above)}</div>}
        {below && <div className="absolute bottom-0 left-1/2 -translate-x-1/2">{renderCard(below)}</div>}
        {past && <div className="absolute top-1/2 left-0 -translate-y-1/2">{renderCard(past)}</div>}
        {future && <div className="absolute top-1/2 right-0 -translate-y-1/2">{renderCard(future)}</div>}
        
        {/* Center Cross */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
          {present && renderCard(present)}
          {challenge && (
            <div className="absolute top-0 left-0 w-full h-full rotate-90 z-10 pointer-events-none transform origin-center">
               <div className="pointer-events-auto shadow-2xl">
                 {renderCard(challenge)}
               </div>
            </div>
          )}
        </div>
      </div>

      {/* The Staff */}
      <div className="flex flex-col-reverse gap-6">
        {advice && renderCard(advice)}
        {external && renderCard(external)}
        {hopesFears && renderCard(hopesFears)}
        {outcome && renderCard(outcome)}
      </div>
    </div>
  );
}

const CardVisual: React.FC<{ 
  drawnCard: DrawnCard, 
  isSelected: boolean, 
  onClick: () => void,
  position: { x: number, y: number },
  onDragEnd: (offset: { x: number, y: number }) => void 
}> = ({ drawnCard, isSelected, onClick, position, onDragEnd }) => {
  const { card } = drawnCard;
  const [imgError, setImgError] = React.useState(false);

  return (
    <motion.div 
      drag
      dragMomentum={false}
      style={{ x: position.x, y: position.y }}
      onDragEnd={(e, info) => onDragEnd({ x: info.offset.x, y: info.offset.y })}
      whileDrag={{ scale: 1.15, zIndex: 50, cursor: 'grabbing' }}
      onClick={onClick}
      className={`relative w-24 h-36 bg-[#0D0D12] border-2 rounded-lg flex flex-col justify-center items-center cursor-grab overflow-hidden
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

      <div className="absolute bottom-2 left-0 w-full text-center z-20 px-1 pointer-events-none">
        <p className="text-[9px] uppercase tracking-wider text-amber-100/90 truncate">{card.name}</p>
        <p className="text-[7px] text-[#FFFAE3]/40 uppercase mt-0.5">{drawnCard.position.name}</p>
      </div>
    </motion.div>
  );
}

function TenCardInnerOuter({ cards, selectedCardId, onCardClick, positions, onDragEnd }: LayoutProps) {
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

  const renderCard = (card: DrawnCard | undefined) => {
    if (!card) return null;
    return (
      <CardVisual 
        drawnCard={card} 
        isSelected={selectedCardId === card.card.id} 
        onClick={() => onCardClick(card)} 
        position={positions[card.card.id] || { x: 0, y: 0 }}
        onDragEnd={(offset) => onDragEnd(card.card.id, offset)}
      />
    );
  };

  return (
    <div className="flex flex-col items-center justify-center p-8 overflow-x-auto min-h-[700px] w-full">
      <div className="relative w-[500px] h-[500px] mx-auto scale-90 sm:scale-100">
        {/* Outer Circle */}
        {fire && <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-4">{renderCard(fire)}</div>}
        {water && <div className="absolute top-1/2 right-0 translate-x-4 -translate-y-1/2">{renderCard(water)}</div>}
        {earth && <div className="absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-4">{renderCard(earth)}</div>}
        {air && <div className="absolute top-1/2 left-0 -translate-x-4 -translate-y-1/2">{renderCard(air)}</div>}
        
        {/* Outer Ruler - Top Right */}
        {extRuler && <div className="absolute -top-8 -right-8">{renderCard(extRuler)}</div>}

        {/* Inner Circle */}
        {head && <div className="absolute top-1/4 left-1/2 -translate-x-1/2 translate-y-2">{renderCard(head)}</div>}
        {heart && <div className="absolute top-1/2 right-1/4 -translate-x-2 -translate-y-1/2">{renderCard(heart)}</div>}
        {gut && <div className="absolute bottom-1/4 left-1/2 -translate-x-1/2 -translate-y-2">{renderCard(gut)}</div>}
        {soul && <div className="absolute top-1/2 left-1/4 translate-x-2 -translate-y-1/2">{renderCard(soul)}</div>}
        
        {/* Center / Inner Ruler */}
        {intRuler && <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">{renderCard(intRuler)}</div>}
      </div>
    </div>
  );
}
