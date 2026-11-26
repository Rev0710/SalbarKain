import { useEffect, useRef } from 'react';
import { animate, splitText } from 'animejs';

export function useTextReveal(enabled = true) {
  const ref = useRef(null);
  useEffect(() => {
    if (!enabled || !ref.current || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return undefined;
    const split = splitText(ref.current, { words: { wrap: 'clip' }, chars: true, accessible: true });
    split.addEffect(({ words, chars }) => animate([words, chars], {
      opacity: { from: 0 },
      translateY: { from: 12 },
      duration: 600,
      delay: (_target, index) => index * 25,
      ease: 'out(3)',
    }));
    return () => split.revert();
  }, [enabled]);
  return ref;
}
