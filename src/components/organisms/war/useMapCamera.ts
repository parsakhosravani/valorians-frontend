"use client";
import { useCallback, useEffect, useRef } from "react";

/**
 * The war map's camera: one finger (or the mouse) drags the map and lets it
 * glide on, two fingers pinch to zoom around the spot between them, the
 * mouse wheel and trackpad pinch zoom toward the pointer, trackpad swipes
 * pan, and a double tap zooms in.
 *
 * The browser does none of it (touch-action: none): native scrolling fought
 * the pinch, so zooming jumped and stuck. The camera is a single
 * translate + scale on one layer, written straight to the DOM once per
 * frame, so React never re-renders the map while it moves.
 */

type Pt = { x: number; y: number };
type Cam = { x: number; y: number; z: number };
type Anim =
  /** Zoom to z, keeping map point m under viewport point f. */
  | { kind: "zoom"; z: number; f: Pt; m: Pt }
  /** Glide to a camera position. */
  | { kind: "pan"; to: Cam };

/** How much smaller labels and tokens get when zooming out (and bigger zooming in). */
export const pinScale = (z: number) => Math.min(1.9, Math.max(0.72, z ** -0.6));

export function useMapCamera({
  size,
  minZoom = 0.4,
  maxZoom = 2.2,
  onResize,
}: {
  /** Side of the square map, in px at zoom 1 (0 while nothing is loaded). */
  size: number;
  minZoom?: number;
  maxZoom?: number;
  onResize?: () => void;
}) {
  const viewport = useRef<HTMLDivElement | null>(null);
  const layer = useRef<HTMLDivElement | null>(null);
  const cam = useRef<Cam>({ x: 0, y: 0, z: 1 });
  const sizeRef = useRef(size);
  const anim = useRef<Anim | null>(null);
  const fling = useRef<{ vx: number; vy: number; t: number } | null>(null);
  const raf = useRef(0);
  const idle = useRef<ReturnType<typeof setTimeout>>();
  const dragged = useRef(false);
  const onResizeRef = useRef(onResize);

  sizeRef.current = size;
  onResizeRef.current = onResize;

  /** Smallest zoom that still fills the view, so no empty space shows. */
  const lowest = useCallback(() => {
    const el = viewport.current;
    const s = sizeRef.current;

    if (!el || !s) return minZoom;

    return Math.min(maxZoom, Math.max(minZoom, el.clientWidth / s, el.clientHeight / s));
  }, [minZoom, maxZoom]);

  const clampZ = useCallback((z: number) => Math.min(maxZoom, Math.max(lowest(), z)), [lowest, maxZoom]);

  /** Keeps the map covering the view. */
  const fit = useCallback(
    (c: Cam): Cam => {
      const el = viewport.current;
      const s = sizeRef.current * c.z;

      if (!el) return c;
      const axis = (t: number, view: number) => (s <= view ? (view - s) / 2 : Math.min(0, Math.max(view - s, t)));

      return { z: c.z, x: axis(c.x, el.clientWidth), y: axis(c.y, el.clientHeight) };
    },
    [],
  );

  const draw = useCallback(() => {
    const l = layer.current;
    const { x, y, z } = cam.current;

    if (!l) return;
    l.style.transform = `translate3d(${x}px, ${y}px, 0) scale(${z})`;
    l.style.setProperty("--pin", pinScale(z).toFixed(3));
  }, []);

  /** Moving: let the browser keep the layer on the GPU, and give it back sharp when it stops. */
  const busy = useCallback(() => {
    const l = layer.current;

    if (!l) return;
    l.style.willChange = "transform";
    clearTimeout(idle.current);
    idle.current = setTimeout(() => {
      if (layer.current && !anim.current && !fling.current) layer.current.style.willChange = "";
    }, 250);
  }, []);

  const tick = useCallback(
    (time: number) => {
      raf.current = 0;
      let again = false;
      const a = anim.current;
      const f = fling.current;

      if (a) {
        const c = cam.current;

        if (a.kind === "zoom") {
          const done = Math.abs(a.z - c.z) < 0.001;
          const z = done ? a.z : c.z + (a.z - c.z) * 0.24;

          cam.current = fit({ z, x: a.f.x - a.m.x * z, y: a.f.y - a.m.y * z });
          if (done) anim.current = null;
        } else {
          const t = fit(a.to);
          const done = Math.abs(t.x - c.x) < 0.5 && Math.abs(t.y - c.y) < 0.5 && Math.abs(t.z - c.z) < 0.001;
          const k = 0.18;

          cam.current = done
            ? t
            : fit({ z: c.z + (t.z - c.z) * k, x: c.x + (t.x - c.x) * k, y: c.y + (t.y - c.y) * k });
          if (done) anim.current = null;
        }
        again = !!anim.current;
        busy();
      } else if (f) {
        const dt = Math.min(48, time - f.t || 16);
        const before = cam.current;
        const next = fit({ ...before, x: before.x + f.vx * dt, y: before.y + f.vy * dt });
        const decay = 0.94 ** (dt / 16);

        // Hit an edge: stop that way.
        f.vx = next.x === before.x + f.vx * dt ? f.vx * decay : 0;
        f.vy = next.y === before.y + f.vy * dt ? f.vy * decay : 0;
        f.t = time;
        cam.current = next;
        if (Math.hypot(f.vx, f.vy) < 0.02) fling.current = null;
        again = !!fling.current;
        busy();
      }
      if (a || f) draw();
      if (again) raf.current = requestAnimationFrame(tick);
    },
    [busy, draw, fit],
  );

  const schedule = useCallback(() => {
    if (!raf.current) raf.current = requestAnimationFrame(tick);
  }, [tick]);

  /** Moves the camera now (a gesture under the finger). */
  const set = useCallback(
    (c: Cam) => {
      cam.current = fit({ ...c, z: clampZ(c.z) });
      busy();
      draw();
    },
    [busy, clampZ, draw, fit],
  );

  const stop = useCallback(() => {
    anim.current = null;
    fling.current = null;
  }, []);

  /** Eases the zoom toward `z`, keeping the map point under viewport point `f` still. */
  const zoomTo = useCallback(
    (z: number, f?: Pt) => {
      const el = viewport.current;

      if (!el) return;
      fling.current = null;
      const c = cam.current;
      const at = f ?? { x: el.clientWidth / 2, y: el.clientHeight / 2 };
      // Mid-zoom, the next step continues from where the last one is heading.
      const prev = anim.current?.kind === "zoom" ? anim.current : null;
      const m = prev && !f ? prev.m : { x: (at.x - c.x) / c.z, y: (at.y - c.y) / c.z };

      anim.current = { kind: "zoom", z: clampZ(z), f: prev && !f ? prev.f : at, m };
      schedule();
    },
    [clampZ, schedule],
  );

  /** Where the zoom is heading (the goal while one is easing). */
  const zoomGoal = useCallback(
    () => (anim.current?.kind === "zoom" ? anim.current.z : cam.current.z),
    [],
  );

  const zoomBy = useCallback((k: number, f?: Pt) => zoomTo(zoomGoal() * k, f), [zoomGoal, zoomTo]);

  /** Puts map point (mx, my) in the middle of the view, gliding there unless `instant`. */
  const centerOn = useCallback(
    (mx: number, my: number, opts: { z?: number; instant?: boolean } = {}) => {
      const el = viewport.current;

      if (!el) return;
      const z = clampZ(opts.z ?? cam.current.z);
      const to = { z, x: el.clientWidth / 2 - mx * z, y: el.clientHeight / 2 - my * z };

      fling.current = null;
      if (opts.instant) {
        anim.current = null;
        set(to);
      } else {
        anim.current = { kind: "pan", to };
        schedule();
      }
    },
    [clampZ, schedule, set],
  );

  /** The map's content moved by (dx, dy) map px (a bigger area loaded): keep the same spot in view. */
  const shift = useCallback(
    (dx: number, dy: number) => {
      const c = cam.current;

      cam.current = { ...c, x: c.x - dx * c.z, y: c.y - dy * c.z };
      if (anim.current?.kind === "zoom") {
        anim.current.m = { x: anim.current.m.x + dx, y: anim.current.m.y + dy };
      } else if (anim.current?.kind === "pan") {
        const t = anim.current.to;

        anim.current.to = { ...t, x: t.x - dx * t.z, y: t.y - dy * t.z };
      }
      set(cam.current);
    },
    [set],
  );

  /** Re-fits after the map's size changed. */
  const refit = useCallback(() => set(cam.current), [set]);

  // ─── Gestures ──────────────────────────────────────────────────────────────
  useEffect(() => {
    const el = viewport.current;

    if (!el || !size) return;
    const pointers = new Map<number, Pt>();
    let pan: { start: Pt; cam: Cam; moved: boolean; id: number } | null = null;
    let pinch: { d: number; z: number; m: Pt } | null = null;
    let samples: { x: number; y: number; t: number }[] = [];
    let lastTap: { x: number; y: number; t: number } | null = null;
    let gesture: { z: number; f: Pt } | null = null;

    const local = (e: { clientX: number; clientY: number }): Pt => {
      const r = el.getBoundingClientRect();

      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };
    const two = () => {
      const [a, b] = Array.from(pointers.values());

      return { d: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)), mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } };
    };
    const startPan = (id: number, p: Pt, moved: boolean) => {
      pan = { start: p, cam: { ...cam.current }, moved, id };
      samples = [{ ...p, t: performance.now() }];
    };
    const startPinch = () => {
      const { d, mid } = two();
      const c = cam.current;

      pinch = { d, z: c.z, m: { x: (mid.x - c.x) / c.z, y: (mid.y - c.y) / c.z } };
      dragged.current = true;
    };

    const down = (e: PointerEvent) => {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      stop();
      const p = local(e);

      pointers.set(e.pointerId, p);
      if (pointers.size === 1) {
        dragged.current = false;
        startPan(e.pointerId, p, false);
      } else if (pointers.size === 2) {
        pan = null;
        startPinch();
        try {
          Array.from(pointers.keys()).forEach((id) => el.setPointerCapture(id));
        } catch {
          // Pointer already gone.
        }
      }
    };

    const move = (e: PointerEvent) => {
      if (!pointers.has(e.pointerId)) return;
      const p = local(e);

      pointers.set(e.pointerId, p);
      if (pinch && pointers.size >= 2) {
        const { d, mid } = two();
        const z = clampZ(pinch.z * (d / pinch.d));

        set({ z, x: mid.x - pinch.m.x * z, y: mid.y - pinch.m.y * z });

        return;
      }
      if (!pan || pan.id !== e.pointerId) return;
      const dx = p.x - pan.start.x;
      const dy = p.y - pan.start.y;

      if (!pan.moved) {
        if (Math.hypot(dx, dy) < (e.pointerType === "mouse" ? 4 : 8)) return;
        pan.moved = true;
        dragged.current = true;
        // Restart from here so the map doesn't jump by the dead zone.
        pan.start = p;
        pan.cam = { ...cam.current };
        try {
          el.setPointerCapture(e.pointerId);
        } catch {
          // Pointer already gone.
        }
        el.dataset.dragging = "";

        return;
      }
      set({ ...pan.cam, x: pan.cam.x + dx, y: pan.cam.y + dy });
      const t = performance.now();

      samples.push({ ...p, t });
      while (samples.length > 2 && t - samples[0].t > 90) samples.shift();
    };

    const up = (e: PointerEvent) => {
      if (!pointers.has(e.pointerId)) return;
      const p = local(e);

      pointers.delete(e.pointerId);
      try {
        el.releasePointerCapture(e.pointerId);
      } catch {
        // Not captured.
      }
      if (pinch) {
        if (pointers.size < 2) pinch = null;
        // One finger left: carry on dragging with it, without a jump.
        if (pointers.size === 1) {
          const [[id, q]] = Array.from(pointers.entries());

          startPan(id, q, true);
        }

        return;
      }
      if (!pan || pan.id !== e.pointerId) return;
      const was = pan;

      pan = null;
      delete el.dataset.dragging;
      if (was.moved) {
        // Let go while moving: glide on.
        const t = performance.now();
        const first = samples[0];

        if (e.type === "pointerup" && first && t - first.t > 0 && t - samples[samples.length - 1].t < 60) {
          const dt = t - first.t;
          const vx = (p.x - first.x) / dt;
          const vy = (p.y - first.y) / dt;

          if (Math.hypot(vx, vy) > 0.15) {
            const cap = 3;

            fling.current = { vx: Math.max(-cap, Math.min(cap, vx)), vy: Math.max(-cap, Math.min(cap, vy)), t: performance.now() };
            schedule();
          }
        }

        return;
      }
      // A tap. Two quick taps on open ground zoom in there.
      if (e.type !== "pointerup") return;
      const onThing = (e.target as Element | null)?.closest?.("button, a");
      const t = performance.now();

      if (!onThing && lastTap && t - lastTap.t < 320 && Math.hypot(p.x - lastTap.x, p.y - lastTap.y) < 30) {
        lastTap = null;
        const z = cam.current.z;

        zoomTo(z >= maxZoom * 0.98 ? lowest() : z * 1.8, p);
      } else {
        lastTap = onThing ? null : { ...p, t };
      }
    };

    // Mouse wheel zooms toward the pointer; trackpad pinch (ctrl + wheel) too;
    // trackpad two-finger swipes pan; shift + wheel pans sideways.
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      stop();
      const px = e.deltaMode === 1 ? 33 : e.deltaMode === 2 ? el.clientHeight : 1;
      const dx = e.deltaX * px;
      const dy = e.deltaY * px;
      const c = cam.current;

      if (e.ctrlKey) {
        // Pinch on a trackpad: small, fast deltas, follow them exactly.
        const p = local(e);
        const z = clampZ(c.z * Math.exp(-dy * 0.01));

        anim.current = null;
        set({ z, x: p.x - ((p.x - c.x) / c.z) * z, y: p.y - ((p.y - c.y) / c.z) * z });

        return;
      }
      if (e.shiftKey) {
        set({ ...c, x: c.x - (dy || dx) });

        return;
      }
      // A mouse wheel clicks in whole steps (lines, or ~100px with no
      // sideways part); a trackpad sends small, smooth deltas both ways.
      const mouse = e.deltaMode !== 0 || (dx === 0 && Math.abs(dy) >= 50 && Number.isInteger(dy));

      if (mouse) {
        zoomTo(zoomGoal() * Math.exp(-Math.max(-300, Math.min(300, dy)) * 0.0022), local(e));
      } else {
        set({ ...c, x: c.x - dx, y: c.y - dy });
      }
    };

    // Safari on a Mac pinches with gesture events instead of ctrl + wheel.
    type GestureEvt = Event & { scale: number; clientX: number; clientY: number };
    const gStart = (e: Event) => {
      e.preventDefault();
      if (pointers.size) return;
      gesture = { z: cam.current.z, f: local(e as GestureEvt) };
    };
    const gChange = (e: Event) => {
      e.preventDefault();
      if (!gesture || pointers.size) return;
      const c = cam.current;
      const z = clampZ(gesture.z * (e as GestureEvt).scale);
      const f = gesture.f;

      set({ z, x: f.x - ((f.x - c.x) / c.z) * z, y: f.y - ((f.y - c.y) / c.z) * z });
    };
    const gEnd = (e: Event) => {
      e.preventDefault();
      gesture = null;
    };

    // Swallow the click that ends a drag, so dragging over a tribe doesn't open it.
    const click = (e: MouseEvent) => {
      if (dragged.current) {
        e.stopPropagation();
        e.preventDefault();
        dragged.current = false;
      }
    };

    el.addEventListener("pointerdown", down);
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", up);
    el.addEventListener("lostpointercapture", up);
    el.addEventListener("wheel", wheel, { passive: false });
    el.addEventListener("gesturestart", gStart);
    el.addEventListener("gesturechange", gChange);
    el.addEventListener("gestureend", gEnd);
    el.addEventListener("click", click, true);

    return () => {
      el.removeEventListener("pointerdown", down);
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
      el.removeEventListener("pointercancel", up);
      el.removeEventListener("lostpointercapture", up);
      el.removeEventListener("wheel", wheel);
      el.removeEventListener("gesturestart", gStart);
      el.removeEventListener("gesturechange", gChange);
      el.removeEventListener("gestureend", gEnd);
      el.removeEventListener("click", click, true);
    };
  }, [size, clampZ, lowest, maxZoom, schedule, set, stop, zoomGoal, zoomTo]);

  // Window resized (Telegram Desktop, rotating a tablet): keep the middle
  // of the view in the middle, and keep the map filling it.
  useEffect(() => {
    const el = viewport.current;

    if (!el || !size || typeof ResizeObserver === "undefined") return;
    let w = el.clientWidth;
    let h = el.clientHeight;
    const ro = new ResizeObserver(() => {
      const c = cam.current;

      set({ ...c, z: Math.max(c.z, lowest()), x: c.x + (el.clientWidth - w) / 2, y: c.y + (el.clientHeight - h) / 2 });
      w = el.clientWidth;
      h = el.clientHeight;
      onResizeRef.current?.();
    });

    ro.observe(el);

    return () => ro.disconnect();
  }, [size, lowest, set]);

  useEffect(
    () => () => {
      cancelAnimationFrame(raf.current);
      clearTimeout(idle.current);
    },
    [],
  );

  return {
    viewport,
    layer,
    zoomBy,
    centerOn,
    shift,
    refit,
    lowest,
    zoom: () => cam.current.z,
  };
}
