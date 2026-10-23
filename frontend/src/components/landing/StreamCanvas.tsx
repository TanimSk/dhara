import { useEffect, useRef } from "react";

import { cx } from "../ui";

/**
 * The "dhara" background loop: a river of bytes.
 * Left: an upload source bursts chunks into the current. Middle: lanes of packets flow, with clay
 * "fast packets" streaking through. Right: viewer endpoints light up as packets arrive.
 * Lanes bend away from the cursor. Pauses offscreen / in background tabs; static for reduced motion.
 */

type Lane = { off: number; amp: number; freq: number; phase: number; drift: number; pulse: number };
type Packet = { lane: number; x: number; v: number; len: number; kind: 0 | 1 | 2; glyph: string; a: number };

const GLYPHS = ["0x1f", "0xa9", "1011", "0110", "0x3c", "ff", "7e", "0x00", "1101", "0xd4", "10", "0x8b"];
const TAU = Math.PI * 2;

export default function StreamCanvas({ variant = "light", className, labels = true }: { variant?: "light" | "dark"; className?: string; labels?: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const ink = variant === "dark" ? "255,255,255" : "29,29,31";
    const clay = variant === "dark" ? "240,165,134" : "201,100,66";

    let w = 0, h = 0, dpr = 1;
    let lanes: Lane[] = [];
    let packets: Packet[] = [];
    let mouse = { x: -9999, y: -9999, tx: -9999, ty: -9999 };
    let t = 0, last = performance.now(), raf = 0, visible = true, burstAt = 0, sourcePulse = 0;

    const rand = (a: number, b: number) => a + Math.random() * (b - a);
    const smooth = (u: number) => u * u * (3 - 2 * u);

    function spawn(lane: number, x: number, burst = false): Packet {
      const r = Math.random();
      const kind: 0 | 1 | 2 = burst ? 0 : r < 0.12 ? 2 : r < 0.3 ? 1 : 0;
      return {
        lane,
        x,
        kind,
        v: kind === 2 ? rand(720, 1150) : kind === 1 ? rand(55, 95) : rand(90, 190) * (burst ? 1.4 : 1),
        len: kind === 2 ? rand(90, 170) : rand(8, 22),
        glyph: GLYPHS[(Math.random() * GLYPHS.length) | 0],
        a: kind === 2 ? 0.9 : kind === 1 ? rand(0.16, 0.28) : rand(0.14, 0.34),
      };
    }

    function setup() {
      const rect = canvas.getBoundingClientRect();
      w = rect.width;
      h = rect.height;
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const n = Math.max(9, Math.min(22, Math.round(w / 68)));
      lanes = Array.from({ length: n }, (_, i) => ({
        off: n === 1 ? 0 : (i / (n - 1)) * 2 - 1,
        amp: rand(10, 26),
        freq: rand(0.8, 1.7),
        phase: rand(0, TAU),
        drift: rand(0.25, 0.6) * (Math.random() < 0.5 ? -1 : 1),
        pulse: 0,
      }));
      packets = [];
      for (let i = 0; i < n * 9; i++) packets.push(spawn((Math.random() * n) | 0, rand(0, w)));
    }

    // Lane geometry: narrow at the upload source on the left, widening into the current.
    function laneY(l: Lane, x: number) {
      const u = Math.max(0, Math.min(1, x / w));
      const spread = 0.1 + 0.9 * smooth(Math.min(1, u / 0.45));
      const cy = h * 0.5;
      let y = cy + l.off * h * 0.44 * spread + l.amp * spread * Math.sin(u * l.freq * TAU + t * l.drift + l.phase);
      const dx = x - mouse.x, dy = y - mouse.y;
      const f = Math.exp(-(dx * dx + dy * dy) / (2 * 110 * 110));
      if (f > 0.002) y += Math.sign(dy || 1) * f * 46;
      return y;
    }

    function drawLanes() {
      ctx.lineWidth = 1;
      ctx.strokeStyle = `rgba(${ink},${variant === "dark" ? 0.07 : 0.055})`;
      for (const l of lanes) {
        ctx.beginPath();
        for (let x = 0; x <= w; x += 14) {
          const y = laneY(l, x);
          x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
    }

    function drawPacket(p: Packet) {
      const l = lanes[p.lane];
      if (p.kind === 1) {
        const y = laneY(l, p.x);
        ctx.fillStyle = `rgba(${ink},${p.a})`;
        ctx.fillText(p.glyph, p.x, y + 3);
        return;
      }
      const steps = p.kind === 2 ? 10 : 3;
      const color = p.kind === 2 ? clay : ink;
      let px = p.x - p.len, py = laneY(l, px);
      ctx.lineWidth = p.kind === 2 ? 2.2 : 2.4;
      for (let s = 1; s <= steps; s++) {
        const x = p.x - p.len + (p.len * s) / steps;
        const y = laneY(l, x);
        // Trail fades from tail to head.
        ctx.strokeStyle = `rgba(${color},${(p.a * s) / steps})`;
        ctx.beginPath();
        ctx.moveTo(px, py);
        ctx.lineTo(x, y);
        ctx.stroke();
        px = x;
        py = y;
      }
      if (p.kind === 2) {
        ctx.fillStyle = `rgba(${clay},0.18)`;
        ctx.beginPath();
        ctx.arc(px, py, 6, 0, TAU);
        ctx.fill();
        ctx.fillStyle = `rgba(${clay},1)`;
        ctx.beginPath();
        ctx.arc(px, py, 2.2, 0, TAU);
        ctx.fill();
      }
    }

    function drawNodes() {
      // Upload source.
      const sx = 26, sy = h * 0.5;
      for (let k = 0; k < 2; k++) {
        const ph = (sourcePulse + k * 0.5) % 1;
        ctx.strokeStyle = `rgba(${clay},${0.35 * (1 - ph)})`;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(sx, sy, 6 + ph * 28, 0, TAU);
        ctx.stroke();
      }
      ctx.fillStyle = `rgba(${clay},0.95)`;
      ctx.beginPath();
      ctx.arc(sx, sy, 4.5, 0, TAU);
      ctx.fill();

      // Viewer endpoints.
      const ex = w - 22;
      for (const l of lanes) {
        const y = laneY(l, ex);
        ctx.fillStyle = `rgba(${ink},${0.22 + l.pulse * 0.6})`;
        ctx.beginPath();
        ctx.arc(ex, y, 2.6 + l.pulse * 1.4, 0, TAU);
        ctx.fill();
        if (l.pulse > 0.05) {
          ctx.strokeStyle = `rgba(${clay},${l.pulse * 0.55})`;
          ctx.lineWidth = 1.2;
          ctx.beginPath();
          ctx.arc(ex, y, 4 + (1 - l.pulse) * 12, 0, TAU);
          ctx.stroke();
        }
      }

      if (labels && w > 900) {
        ctx.font = "600 10px ui-monospace, SFMono-Regular, Menlo, monospace";
        ctx.fillStyle = `rgba(${ink},0.32)`;
        ctx.fillText("UPLOAD", sx - 8, sy - 40);
        ctx.textAlign = "right";
        ctx.fillText("VIEWERS", ex + 6, Math.max(14, h * 0.06 - 12));
        ctx.textAlign = "left";
      }
    }

    function frame(now: number) {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      t += dt;
      // Ease the cursor so lanes glide rather than snap.
      mouse.x += (mouse.tx - mouse.x) * 0.12;
      mouse.y += (mouse.ty - mouse.y) * 0.12;

      ctx.clearRect(0, 0, w, h);
      drawLanes();
      ctx.font = "500 10px ui-monospace, SFMono-Regular, Menlo, monospace";

      // Upload burst: a chunk breaks into packets at the source every ~3 s.
      if (t - burstAt > 3) {
        burstAt = t;
        sourcePulse = 0;
        for (let k = 0; k < 10; k++) packets.push(spawn((Math.random() * lanes.length) | 0, rand(-40, 0), true));
      }
      sourcePulse = Math.min(1, sourcePulse + dt * 0.7);

      for (const p of packets) {
        const near = Math.abs(p.x - mouse.x) < 140 ? 1.8 : 1;
        p.x += p.v * dt * near;
        if (p.x - p.len > w) {
          lanes[p.lane].pulse = 1;
          Object.assign(p, spawn((Math.random() * lanes.length) | 0, rand(-60, 0)));
        }
        drawPacket(p);
      }
      if (packets.length > lanes.length * 12) packets.splice(0, packets.length - lanes.length * 12);
      for (const l of lanes) l.pulse = Math.max(0, l.pulse - dt * 1.6);
      drawNodes();

      if (visible && !reduced) raf = requestAnimationFrame(frame);
    }

    function start() {
      cancelAnimationFrame(raf);
      last = performance.now();
      raf = requestAnimationFrame(frame);
    }

    setup();
    if (reduced) {
      t = 4;
      frame(performance.now());
    } else start();

    const ro = new ResizeObserver(() => {
      setup();
      if (reduced) frame(performance.now());
    });
    ro.observe(canvas);
    const io = new IntersectionObserver(([e]) => {
      visible = e.isIntersecting && !document.hidden;
      if (visible && !reduced) start();
    });
    io.observe(canvas);
    const onVis = () => {
      visible = !document.hidden;
      if (visible && !reduced) start();
    };
    document.addEventListener("visibilitychange", onVis);
    const host = canvas.parentElement!;
    const onMove = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect();
      mouse.tx = e.clientX - r.left;
      mouse.ty = e.clientY - r.top;
      if (mouse.x < -1000) {
        mouse.x = mouse.tx;
        mouse.y = mouse.ty;
      }
    };
    const onLeave = () => {
      mouse.tx = -9999;
      mouse.ty = -9999;
    };
    host.addEventListener("pointermove", onMove);
    host.addEventListener("pointerleave", onLeave);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
      document.removeEventListener("visibilitychange", onVis);
      host.removeEventListener("pointermove", onMove);
      host.removeEventListener("pointerleave", onLeave);
    };
  }, [variant, labels]);

  return <canvas ref={canvasRef} aria-hidden className={cx("absolute inset-0 w-full h-full pointer-events-none", className)} />;
}
