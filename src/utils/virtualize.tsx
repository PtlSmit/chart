import React, { useEffect, useMemo, useRef, useState } from 'react';

interface VirtualListProps<T> {
  items: T[];
  itemHeight: number; // fixed height for performance
  height: number; // viewport height
  overscan?: number;
  render: (item: T, index: number) => React.ReactNode;
}

export function VirtualList<T>({ items, itemHeight, height, overscan = 6, render }: VirtualListProps<T>) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const totalHeight = items.length * itemHeight;
  const startIndex = Math.max(0, Math.floor(scrollTop / itemHeight) - overscan);
  const endIndex = Math.min(items.length, Math.ceil((scrollTop + height) / itemHeight) + overscan);
  const visible = useMemo(() => items.slice(startIndex, endIndex), [items, startIndex, endIndex]);

  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const onScroll = () => setScrollTop(el.scrollTop);
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <div ref={viewportRef} className="list" style={{ height }}>
      <div style={{ height: totalHeight, position: 'relative' }}>
        {visible.map((item, i) => {
          const index = startIndex + i;
          const top = index * itemHeight;
          return (
            <div key={index} className="list-row" style={{ position: 'absolute', top, height: itemHeight, left: 0, right: 0 }}>
              {render(item, index)}
            </div>
          );
        })}
      </div>
    </div>
  );
}

