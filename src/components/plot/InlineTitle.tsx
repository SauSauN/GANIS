import { useRef, useState } from "react";

/** Titre modifié directement sur la carte (double-clic, F2). */
export function InlineTitle({ initial, fontSize, label, onDone }: { initial: string; fontSize: number; label: string; onDone: (value: string | null) => void }) {
  const [value, setValue] = useState(initial);
  const done = useRef(false);
  const finish = (save: boolean) => {
    if (done.current) return;
    done.current = true;
    onDone(save ? value.trim() : null);
  };
  return (
    <textarea
      autoFocus
      value={value}
      aria-label={label}
      placeholder={label}
      maxLength={200}
      onFocus={(e) => e.target.select()}
      onChange={(e) => setValue(e.target.value)}
      onPointerDown={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          finish(true);
        } else if (e.key === "Escape") {
          e.preventDefault();
          finish(false);
        }
      }}
      onBlur={() => finish(true)}
      className="h-[2.6em] w-full resize-none rounded border border-[var(--lane)] bg-card px-1 leading-tight font-semibold outline-none"
      style={{ fontSize }}
    />
  );
}
