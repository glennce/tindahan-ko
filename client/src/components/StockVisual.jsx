import { useEffect, useRef, useState } from 'react';

// Constants for camel-style packs: e.g. Camel with units_per_pack 20 shows 🐪 + 20 stick
// icons. Whenever a sale drops stock, one stick animates out (pop + fade) and the count updates.
const MAX_UNITS = 60;

// Suggests an emoji icon from the product's name/category when none is set.
const NAME_HINTS = [
  [/cigaret|camel|marlboro|malbor|photographer|newport|dunhill|pall\s?mall|hope|marl/i, '🚬'],
  [/coke|coca|pepsi|sprite|royal|sarsi|soft ?drink|juice|mirinda/i, '🥤'],
  [/water|mineral|gatorade|sting|flavored/i, '💧'],
  [/chips|jack ?n|piattos|v?\s?cut|snake|pastry|biscuit|cookie|oreo|cracker|otap|pia/i, '🍪'],
  [/coffee|nescafe|great ?taste|cafe|milo/i, '☕'],
  [/noodle|pancit|mami|ramen|lucky/i, '🍜'],
  [/lotion|soap|shampoo|sachet|colgate|tooth|detergent|joy|zest/i, '🧴'],
  [/candy|gum|choco|chocolate|kisses|cloud|menthol/i, '🍬'],
  [/ice ?cream|magnum|cornetto|selecta/i, '🍦'],
  [/egg/i, '🥚'],
  [/rice|bigasan|sinangag/i, '🍚'],
  [/load|e ?load|gcash/i, '📱'],
  [/sardinas|sardine|tomato|corned|liver|can(ful)?d|canned/i, '🥫'],
  [/bread|turon|pan ?desal|ensaymada|puto/i, '🍞'],
];

export function suggestIcon(product = {}) {
  const text = `${product.name || ''} ${product.category || ''}`;
  for (const [re, icon] of NAME_HINTS) if (re.test(text)) return icon;
  return '📦';
}

const newDot = () => ({ id: `d${Date.now()}_${Math.random().toString(36).slice(2, 8)}` });

/**
 * Live stock visual: product icon + one small unit icon per remaining piece.
 * When stock decreases, the removed units animate out; when it rises, they pop in.
 */
export default function StockVisual({ product, icon, stock, unitLabel, maxUnits = MAX_UNITS, className = '' }) {
  const resolvedIcon = icon ?? product?.stock_icon ?? suggestIcon(product ?? {});
  const current = Math.max(0, Math.floor(Number(stock ?? product?.stock_quantity) || 0));
  const capped = Math.min(current, maxUnits);

  const [dots, setDots] = useState(() => Array.from({ length: capped }, newDot));
  const timer = useRef(null);

  useEffect(() => {
    setDots((cur) => {
      // Stock went up: pop in new units at the end.
      if (cur.length < capped) {
        clearTimeout(timer.current);
        return [...cur, ...Array.from({ length: capped - cur.length }, newDot)];
      }
      // Stock went down: mark the excess units as "sold" so they animate out,
      // then drop them from the list after the animation finishes.
      if (cur.length > capped) {
        const keep = cur.slice(0, capped);
        const sold = cur.slice(capped).map((d) => ({ id: d.id, sold: true }));
        clearTimeout(timer.current);
        timer.current = setTimeout(() => setDots(keep), 650);
        return [...keep, ...sold];
      }
      return cur;
    });
    return () => clearTimeout(timer.current);
  }, [capped]);

  return (
    <div className={`flex items-center gap-2 ${className}`} data-testid="stock-visual">
      <span key={resolvedIcon} className="stock-visual-icon text-lg leading-none select-none">
        {resolvedIcon}
      </span>
      <div className="flex flex-wrap gap-[3px] max-w-[8.5rem]">
        {dots.map((dot) => (
          <span
            key={dot.id}
            aria-hidden="true"
            className={`stock-unit ${dot.sold ? 'stock-unit-sold' : 'stock-unit-in'}`}
          />
        ))}
      </div>
      <span key={current} className="stock-count text-xs text-on-surface-variant whitespace-nowrap">
        {current} {unitLabel ?? product?.unit_label ?? 'pcs'}
      </span>
      {current > maxUnits && <span className="text-xs text-on-surface-variant">+{current - maxUnits} more</span>}
    </div>
  );
}
