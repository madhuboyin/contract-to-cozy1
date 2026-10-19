import { useCallback, useEffect, useState } from 'react';

export function useMeasuredElementHeight() {
  const [element, setElement] = useState<HTMLElement | null>(null);
  const [height, setHeight] = useState(0);
  const ref = useCallback((node: HTMLElement | null) => setElement(node), []);

  useEffect(() => {
    if (!element) {
      setHeight(0);
      return;
    }
    const measure = () => setHeight(Math.ceil(element.getBoundingClientRect().height));
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [element]);

  return { ref, height };
}
