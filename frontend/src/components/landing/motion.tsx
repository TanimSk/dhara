import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";

import { cx } from "../ui";

export function useReducedMotion() {
  const [reduced, setReduced] = useState(() => {
    try {
      return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    } catch {
      return false;
    }
  });
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const on = () => setReduced(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return reduced;
}

/** Puts the marketing pages in the dark theme while mounted. */
export function useDarkTheme() {
  useEffect(() => {
    document.body.classList.add("theme-dark");
    return () => document.body.classList.remove("theme-dark");
  }, []);
}

/** True once the element is on screen. */
export function useInView<T extends Element>(margin = "0px 0px -12% 0px") {
  const ref = useRef<T>(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true);
          io.disconnect();
        }
      },
      { rootMargin: margin },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [margin]);
  return [ref, inView] as const;
}

export function Reveal({ children, delay = 0, className, as: Tag = "div" }: { children: ReactNode; delay?: number; className?: string; as?: "div" | "li" | "section" }) {
  const [ref, inView] = useInView<HTMLDivElement>();
  return (
    <Tag ref={ref as any} className={cx("reveal", inView && "in", className)} style={{ transitionDelay: `${delay}ms` } as CSSProperties}>
      {children}
    </Tag>
  );
}

/**
 * Calls `apply(progress, el)` on scroll with progress clamped to 0..1. Writes styles directly, no re-render.
 * - "enter": 0 when the element's top is at `start` of the viewport height, 1 when it reaches `end`.
 * - "sticky": 0 -> 1 across a tall container whose child is position: sticky.
 */
export function useScrollProgress<T extends HTMLElement>(
  apply: (p: number, el: T) => void,
  opts: { mode?: "enter" | "sticky"; start?: number; end?: number } = {},
) {
  const { mode = "enter", start = 1, end = 0.3 } = opts;
  const ref = useRef<T>(null);
  const fn = useRef(apply);
  fn.current = apply;
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      fn.current(1, el);
      return;
    }
    let raf = 0;
    const update = () => {
      raf = 0;
      const r = el.getBoundingClientRect();
      const vh = window.innerHeight;
      const p = mode === "sticky" ? -r.top / Math.max(1, r.height - vh) : (vh * start - r.top) / Math.max(1, vh * (start - end));
      fn.current(Math.max(0, Math.min(1, p)), el);
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, [mode, start, end]);
  return ref;
}
