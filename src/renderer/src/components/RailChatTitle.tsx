import { useEffect, useRef } from "react";

/** Measure the title's actual viewport, including room taken by hover actions. */
export default function RailChatTitle({ name }: { name: string }): React.JSX.Element {
  const viewportRef = useRef<HTMLSpanElement>(null);
  const textRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const viewport = viewportRef.current;
    const text = textRef.current;
    if (!viewport || !text) return;
    const measure = (): void => {
      const distance = Math.max(0, text.scrollWidth - viewport.clientWidth);
      viewport.dataset.overflowing = String(distance > 1);
      viewport.style.setProperty("--chat-title-travel", `${distance}px`);
      viewport.style.setProperty("--chat-title-duration", `${distance / 30}s`);
    };
    const observer = new ResizeObserver(measure);
    observer.observe(viewport);
    observer.observe(text);
    measure();
    return () => observer.disconnect();
  }, []);

  return (
    <span ref={viewportRef} className="rail__chat-name">
      <span ref={textRef} className="rail__chat-name-text">{name}</span>
    </span>
  );
}
