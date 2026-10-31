"use client";
import { useLayoutEffect, useRef } from "react";

import { pinScale } from "./useMapCamera";

import { BUILDING_BY_ID, buildingImage } from "@/lib/game/config";
import { ClanFlag as Flag, FLAG_COLORS, FlagPattern, emblemImage } from "@/lib/game/clan";
import { formatDuration } from "@/lib/format";

/**
 * The war map drawn on one canvas the size of the screen: the land, the
 * villages and the camps, only what's in view, redrawn as the camera moves.
 *
 * The map used to be a page element as big as the world (18,400 px a side)
 * holding a picture for every piece of land and half a dozen elements per
 * village. The browser had to keep all of that laid out and composited, and
 * on weaker phones dragging it couldn't keep up. Here the cost follows the
 * screen, not the world. Armies, caravans and roads (a handful) stay page
 * elements on top, moved by the same camera.
 *
 * Markers are drawn as the map's old page-element markers drew them: same
 * boxes, same sizes, same colours.
 */

// Shared with WarMap: a village's box, and the tile's centre inside it.
export const VILLAGE_MIN = 34;
export const VILLAGE_GROW = 12;
const VX = 36;
const VY = 34;
const SAND = "#C8B27A";

/** How strong a village is next to you: the colour of its ground ring. */
export type Ring = "me" | "ally" | "weaker" | "stronger" | "even";

export type CanvasTribe = {
  id: number;
  /** The tile's centre in world px. */
  x: number;
  y: number;
  /** Size of the village picture (px before the marker's zoom scale). */
  size: number;
  ring: Ring;
  island: boolean;
  picked: boolean;
  /** Full labels (name, level, big shield). */
  loud: boolean;
  shielded: boolean;
  isMe: boolean;
  townHall: number;
  flag: Flag | null;
  /** Name plate text. */
  name: string;
};

export type CanvasCamp = {
  level: number;
  x: number;
  y: number;
  state: "locked" | "new" | "ready" | "cooldown";
  readyAt: number;
  picked: boolean;
  /** Full label ("Camp 3"), or only the small numbered badge. */
  label: boolean;
};

type CanvasPiece = { img: HTMLImageElement; left: number; top: number; size: number; detail: boolean };
type CanvasBackdrop = { canvas: HTMLCanvasElement; left: number; top: number; size: number };

type Hit = { kind: "tribe"; id: number } | { kind: "camp"; level: number } | null;

type Cam = { x: number; y: number; z: number };

// ─── Pictures ────────────────────────────────────────────────────────────────

const images = new Map<string, HTMLImageElement>();

/** A picture by URL, loaded once; `onLoad` asks for a redraw when it arrives. */
const picture = (src: string, onLoad: () => void) => {
  let img = images.get(src);

  if (!img) {
    img = new Image();
    img.decoding = "async";
    img.src = src;
    images.set(src, img);
  }
  if (!img.complete) img.addEventListener("load", onLoad, { once: true });

  return img;
};
const loaded = (img: HTMLImageElement) => img.complete && img.naturalWidth > 0;

const TOWN_HALL = buildingImage(BUILDING_BY_ID["town-hall"]);
const BARRACKS = buildingImage(BUILDING_BY_ID["barracks"]);
const SHIELD = "/images/icons/shield.webp";
const LOCK = "/images/icons/lock.webp";

const DISPLAY = "Cinzel, Georgia, serif";

/**
 * The barracks greyed out and darkened, for locked camps, made once. A
 * canvas filter did the same on every frame, and was the slowest thing drawn.
 */
let lockedHut: HTMLCanvasElement | null = null;
const greyed = (hut: HTMLImageElement) => {
  if (lockedHut) return lockedHut;
  const c = document.createElement("canvas");

  c.width = hut.naturalWidth;
  c.height = hut.naturalHeight;
  const g = c.getContext("2d")!;

  g.drawImage(hut, 0, 0);
  const img = g.getImageData(0, 0, c.width, c.height);
  const d = img.data;

  for (let k = 0; k < d.length; k += 4) {
    // grayscale(1) brightness(0.6), as the page's filter did.
    const v = (0.2126 * d[k] + 0.7152 * d[k + 1] + 0.0722 * d[k + 2]) * 0.6;

    d[k] = d[k + 1] = d[k + 2] = v;
  }
  g.putImageData(img, 0, 0);

  return (lockedHut = c);
};

// ─── Ground rings ────────────────────────────────────────────────────────────

const RINGS: Record<Ring, { stroke: string; fill: string; glow?: [number, string] }> = {
  me: { stroke: "#E3A948", fill: "rgba(227,169,72,0.3)", glow: [18, "rgba(227,169,72,0.85)"] },
  ally: { stroke: "#7FB3D0", fill: "rgba(127,179,208,0.25)", glow: [10, "rgba(127,179,208,0.6)"] },
  weaker: { stroke: "#9DD07F", fill: "rgba(157,208,127,0.2)" },
  stronger: { stroke: "#F08A6C", fill: "rgba(240,138,108,0.2)" },
  even: { stroke: "rgba(242,198,109,0.8)", fill: "rgba(242,198,109,0.15)" },
};

const ellipse = (g: CanvasRenderingContext2D, cx: number, cy: number, rx: number, ry: number) => {
  g.beginPath();
  g.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
};

/** The soft dark spot a marker stands in. */
const shadow = (g: CanvasRenderingContext2D, cx: number, cy: number, rx: number, ry: number) => {
  g.save();
  g.translate(cx, cy);
  g.scale(rx, ry);
  const grad = g.createRadialGradient(0, 0, 0, 0, 0, 1);

  grad.addColorStop(0, "rgba(10,7,4,0.55)");
  grad.addColorStop(1, "rgba(10,7,4,0)");
  g.fillStyle = grad;
  g.beginPath();
  g.arc(0, 0, 1, 0, Math.PI * 2);
  g.fill();
  g.restore();
};

/** A rounded plate with text in it, centred on `cx`; returns nothing, draws in place. */
const plate = (
  g: CanvasRenderingContext2D,
  text: string,
  cx: number,
  top: number,
  o: { font: string; h: number; r: number; pad: number; maxW?: number; fill: string | CanvasGradient; stroke: string; color: string; icon?: HTMLImageElement },
) => {
  g.font = o.font;
  const iconW = o.icon && loaded(o.icon) ? o.h - 5 : 0;
  let shown = text;
  const room = (o.maxW ?? Infinity) - o.pad * 2 - iconW;

  if (g.measureText(shown).width > room) {
    while (shown.length > 1 && g.measureText(`${shown}…`).width > room) shown = shown.slice(0, -1);
    shown = `${shown}…`;
  }
  const w = g.measureText(shown).width + o.pad * 2 + (iconW ? iconW + 2 : 0);
  const left = cx - w / 2;

  g.beginPath();
  g.roundRect(left, top, w, o.h, o.r);
  g.fillStyle = o.fill;
  g.fill();
  g.lineWidth = 1;
  g.strokeStyle = o.stroke;
  g.stroke();
  if (iconW) g.drawImage(o.icon!, left + o.pad, top + (o.h - iconW) / 2, iconW, iconW);
  g.fillStyle = o.color;
  g.textAlign = "left";
  g.textBaseline = "middle";
  g.fillText(shown, left + o.pad + (iconW ? iconW + 2 : 0), top + o.h / 2 + 0.5);
};

// ─── Clan banners ────────────────────────────────────────────────────────────

const CLOTH = new Path2D("M0 0 H40 V44 L20 37 L0 44 Z");

const PATTERNS: Record<FlagPattern, (g: CanvasRenderingContext2D, fg: string) => void> = {
  plain: () => {},
  cross: (g, fg) => {
    g.fillStyle = fg;
    g.fillRect(11, 0, 6, 44);
    g.fillRect(0, 16, 40, 6);
  },
  fess: (g, fg) => {
    g.fillStyle = fg;
    g.fillRect(0, 14, 40, 12);
  },
  pale: (g, fg) => {
    g.fillStyle = fg;
    g.fillRect(14, 0, 12, 44);
  },
  split: (g, fg) => {
    g.fillStyle = fg;
    g.fillRect(20, 0, 20, 44);
  },
  chevron: (g, fg) => {
    g.fillStyle = fg;
    g.fill(new Path2D("M0 26 L20 10 L40 26 L40 36 L20 20 L0 36 Z"));
  },
  saltire: (g, fg) => {
    g.strokeStyle = fg;
    g.lineWidth = 6;
    g.stroke(new Path2D("M0 0 L40 44 M40 0 L0 44"));
  },
  quarters: (g, fg) => {
    g.fillStyle = fg;
    g.fillRect(20, 0, 20, 20);
    g.fillRect(0, 20, 20, 24);
  },
  border: (g, fg) => {
    g.strokeStyle = fg;
    g.lineWidth = 3.5;
    g.stroke(new Path2D("M3 3 H37 V38 L20 33 L3 38 Z"));
  },
};

/** Banners drawn once per look and size (device px), like ClanFlag draws them as SVG. */
const banners = new Map<string, HTMLCanvasElement>();

const banner = (flag: Flag, h: number, onLoad: () => void): HTMLCanvasElement | null => {
  const key = `${flag.bg}|${flag.fg}|${flag.pattern}|${flag.emblem}|${h}`;
  const hit = banners.get(key);

  if (hit) return hit;
  const src = flag.emblem >= 0 ? emblemImage(flag.emblem) : null;
  const emblem = src ? picture(src, onLoad) : null;

  // Wait for the emblem rather than keeping a banner without it.
  if (emblem && !loaded(emblem)) return null;
  const bg = FLAG_COLORS[flag.bg] ?? FLAG_COLORS[0];
  const fg = FLAG_COLORS[flag.fg] ?? FLAG_COLORS[2];
  const c = document.createElement("canvas");
  const k = h / 56;

  c.width = Math.ceil(48 * k);
  c.height = Math.ceil(h);
  const g = c.getContext("2d")!;

  // The SVG's viewBox is -4 -6 48 56.
  g.scale(k, k);
  g.translate(4, 6);
  g.fillStyle = "#6B4425";
  g.strokeStyle = "#2B1A0D";
  g.lineWidth = 0.8;
  g.beginPath();
  g.roundRect(-3, -4.4, 46, 3.4, 1.4);
  g.fill();
  g.stroke();
  for (const x of [-3, 43]) {
    g.beginPath();
    g.arc(x, -2.7, 2.2, 0, Math.PI * 2);
    g.fillStyle = "#E3A948";
    g.fill();
    g.strokeStyle = "#7A5418";
    g.lineWidth = 0.6;
    g.stroke();
  }
  g.save();
  g.clip(CLOTH);
  g.fillStyle = bg;
  g.fillRect(0, 0, 40, 44);
  PATTERNS[flag.pattern]?.(g, fg);
  const fold = g.createLinearGradient(0, 0, 40, 0);

  fold.addColorStop(0, "rgba(0,0,0,0.18)");
  fold.addColorStop(0.35, "rgba(255,255,255,0.08)");
  fold.addColorStop(0.7, "rgba(0,0,0,0.06)");
  fold.addColorStop(1, "rgba(0,0,0,0.22)");
  g.fillStyle = fold;
  g.fillRect(0, 0, 40, 44);
  g.restore();
  g.strokeStyle = "#1A120B";
  g.lineWidth = 1.4;
  g.lineJoin = "round";
  g.stroke(CLOTH);
  if (emblem) {
    g.beginPath();
    g.arc(20, 19, 10, 0, Math.PI * 2);
    g.fillStyle = bg;
    g.fill();
    g.strokeStyle = fg;
    g.lineWidth = 1.6;
    g.stroke();
    g.drawImage(emblem, 12, 11, 16, 16);
  }
  if (banners.size > 200) banners.delete(banners.keys().next().value!);
  banners.set(key, c);

  return c;
};

// ─── The painter ─────────────────────────────────────────────────────────────

const CAMP_LABEL: Record<CanvasCamp["state"], { fill: string; stroke: string; color: string }> = {
  new: { fill: "#E8612C", stroke: "#FFD2B0", color: "#FFF4EA" },
  ready: { fill: "#9DD07F", stroke: "#E6F5D9", color: "#1A120B" },
  cooldown: { fill: "rgba(11,8,6,0.9)", stroke: "#4A3624", color: "#D8C9AE" },
  locked: { fill: "rgba(11,8,6,0.9)", stroke: "#4A3624", color: "#D8C9AE" },
};

export class MapPainter {
  private g: CanvasRenderingContext2D;
  private cam: Cam = { x: 0, y: 0, z: 1 };
  private dpr = 1;
  private w = 0;
  private h = 0;
  private frame = 0;
  private pieces = new Map<string, CanvasPiece>();
  private backdrop: CanvasBackdrop | null = null;
  private tribes: CanvasTribe[] = [];
  private camps: CanvasCamp[] = [];
  /** The clock for camp cooldown labels. */
  now = 0;

  constructor(private canvas: HTMLCanvasElement) {
    this.g = canvas.getContext("2d", { alpha: false })!;
  }

  /** Redraws on the next frame (several calls in one frame draw once). */
  request = () => {
    if (!this.frame) this.frame = requestAnimationFrame(() => {
      this.frame = 0;
      this.draw();
    });
  };

  dispose() {
    cancelAnimationFrame(this.frame);
  }

  resize(w: number, h: number) {
    // Twice the CSS px at most: sharper buys little on a phone and costs memory every frame.
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.w = w;
    this.h = h;
    this.canvas.width = Math.round(w * this.dpr);
    this.canvas.height = Math.round(h * this.dpr);
    this.draw();
  }

  /** The camera moved: draw now, in the same frame as the page elements moved by it. */
  setCamera(c: Cam) {
    this.cam = { ...c };
    this.draw();
  }

  setPiece(key: string, p: CanvasPiece | null) {
    if (p) this.pieces.set(key, p);
    else this.pieces.delete(key);
    this.request();
  }

  setBackdrop(b: CanvasBackdrop | null) {
    this.backdrop = b;
    this.request();
  }

  setMarkers(tribes: CanvasTribe[], camps: CanvasCamp[]) {
    this.tribes = tribes;
    this.camps = camps;
    this.request();
  }

  /** The village or camp under a point on the canvas (CSS px), the top one first. */
  hit(sx: number, sy: number): Hit {
    const { x, y, z } = this.cam;
    const wx = (sx - x) / z;
    const wy = (sy - y) / z;
    const pin = pinScale(z);
    const inBox = (ax: number, ay: number, x0: number, y0: number, x1: number, y1: number) => {
      const lx = (wx - ax) / pin;
      const ly = (wy - ay) / pin;

      return lx >= x0 && lx <= x1 && ly >= y0 && ly <= y1;
    };

    for (const t of this.order(this.tribes).reverse()) if (inBox(t.x, t.y, -VX, -VY, VX, 26)) return { kind: "tribe", id: t.id };
    for (const c of [...this.camps].reverse()) if (inBox(c.x, c.y, -32, -34, 32, 22)) return { kind: "camp", level: c.level };

    return null;
  }

  /** Drawing order, as the page stacked them: your village over others, the picked one on top. */
  private order(tribes: CanvasTribe[]) {
    const rank = (t: CanvasTribe) => (t.picked ? 2 : t.isMe ? 1 : 0);

    return [...tribes].sort((a, b) => rank(a) - rank(b));
  }

  draw() {
    const { g, dpr } = this;
    const { x, y, z } = this.cam;

    if (!this.w) return;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.fillStyle = "#1C3F54";
    g.fillRect(0, 0, this.canvas.width, this.canvas.height);
    g.setTransform(dpr * z, 0, 0, dpr * z, dpr * x, dpr * y);
    g.imageSmoothingEnabled = true;

    // The part of the world on screen, in world px.
    const vx0 = -x / z;
    const vy0 = -y / z;
    const vx1 = vx0 + this.w / z;
    const vy1 = vy0 + this.h / z;
    const onScreen = (l: number, t: number, s: number) => l < vx1 && l + s > vx0 && t < vy1 && t + s > vy0;

    const b = this.backdrop;

    if (b) g.drawImage(b.canvas, b.left, b.top, b.size, b.size);
    // Whole-view pieces first, close-up ones over them.
    for (const detail of [false, true])
      for (const p of this.pieces.values())
        if (p.detail === detail && onScreen(p.left, p.top, p.size)) g.drawImage(p.img, p.left, p.top, p.size, p.size);

    // Markers: in world px around their tile, scaled less than the land (pinScale).
    const pin = pinScale(z);
    const margin = 80 * pin;
    const near = (mx: number, my: number) => mx > vx0 - margin && mx < vx1 + margin && my > vy0 - margin && my < vy1 + margin;
    const redraw = this.request;

    for (const c of this.camps) if (!c.picked && near(c.x, c.y)) this.camp(c, pin, redraw);
    for (const t of this.order(this.tribes)) if (near(t.x, t.y)) this.village(t, pin, redraw);
    for (const c of this.camps) if (c.picked && near(c.x, c.y)) this.camp(c, pin, redraw);
  }

  /** A village (box origin at the tile's centre minus (VX, VY)). */
  private village(t: CanvasTribe, pin: number, redraw: () => void) {
    const { g } = this;
    const { size } = t;
    const half = size / 2;
    const foot = VY + 6;
    const ring = RINGS[t.ring];

    g.save();
    g.translate(t.x, t.y);
    g.scale(pin, pin);
    g.translate(-VX, -VY);

    if (t.island) {
      ellipse(g, VX, foot - 1, (size + 12) / 2, 11);
      g.fillStyle = SAND;
      g.fill();
      g.lineWidth = 1;
      g.strokeStyle = "rgba(230,211,160,0.7)";
      g.stroke();
    }
    shadow(g, VX, foot - 1, (size + 4) / 2, 7);
    if (t.picked) {
      // The page pulses a ring here; a still, wider one marks the pick on the canvas.
      ellipse(g, VX, foot - 0.5, (size + 8) / 2, 8.5);
      g.lineWidth = 2;
      g.strokeStyle = ring.stroke;
      g.globalAlpha = 0.6;
      g.stroke();
      g.globalAlpha = 1;
    }
    ellipse(g, VX, foot - 0.5, (size - 2) / 2, 5.5);
    g.fillStyle = ring.fill;
    if (ring.glow) {
      g.shadowBlur = ring.glow[0];
      g.shadowColor = ring.glow[1];
    }
    g.fill();
    g.shadowBlur = 0;
    g.lineWidth = 1.5;
    g.strokeStyle = ring.stroke;
    g.stroke();

    const hall = picture(TOWN_HALL, redraw);

    if (loaded(hall)) g.drawImage(hall, VX - half, foot - size + 3, size, size);

    if (t.loud) {
      // Town Hall level: a small gold coin at the village's foot.
      const cx = VX - half + 3;
      const cy = foot - 4;
      const coin = g.createLinearGradient(0, cy - 8, 0, cy + 8);

      coin.addColorStop(0, "#F6CC72");
      coin.addColorStop(1, "#C98C2E");
      g.beginPath();
      g.arc(cx, cy, 8, 0, Math.PI * 2);
      g.fillStyle = coin;
      g.fill();
      g.lineWidth = 1.5;
      g.strokeStyle = "#F7D58A";
      g.stroke();
      g.font = `900 8.5px ${DISPLAY}`;
      g.fillStyle = "#1A120B";
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.fillText(String(t.townHall), cx, cy + 0.5);
    }

    if (t.shielded && !t.isMe) {
      const icon = picture(SHIELD, redraw);
      const s = t.loud ? 13 : 9;

      if (loaded(icon)) {
        g.globalAlpha = t.loud ? 1 : 0.75;
        g.drawImage(icon, VX + half - (t.loud ? 9 : 7), foot - size + (t.loud ? 1 : 5), s, s);
        g.globalAlpha = 1;
      }
    }

    if (t.flag) {
      const fh = t.loud ? 16 : 12;
      // Drawn at the device px it'll show at, so it stays sharp.
      const scale = this.dpr * this.cam.z * pin;
      const sprite = banner(t.flag, Math.max(8, Math.round(fh * scale)), redraw);

      if (sprite) g.drawImage(sprite, VX - half - 4, foot - size - 2, (fh * 48) / 56, fh);
    }

    if (t.loud) {
      const me = t.isMe;
      let fill: string | CanvasGradient = "rgba(11,8,6,0.9)";

      if (me) {
        const gold = g.createLinearGradient(0, foot + 6, 0, foot + 21);

        gold.addColorStop(0, "#F6CC72");
        gold.addColorStop(1, "#C98C2E");
        fill = gold;
      }
      plate(g, t.name, VX, foot + 6, {
        font: `700 9px ${DISPLAY}`,
        h: 15,
        r: 5,
        pad: 6,
        maxW: 104,
        fill,
        stroke: me ? "#F7D58A" : t.ring === "ally" ? "rgba(127,179,208,0.6)" : "#7A5A30",
        color: me ? "#1A120B" : t.ring === "ally" ? "#7FB3D0" : "#EFE3CC",
      });
    }
    g.restore();
  }

  /** A barbarian camp (box origin at the tile's centre minus (32, 34)). */
  private camp(c: CanvasCamp, pin: number, redraw: () => void) {
    const { g } = this;
    const locked = c.state === "locked";

    g.save();
    g.translate(c.x, c.y);
    g.scale(pin, pin);
    g.translate(-32, -34);

    shadow(g, 32, 39, 16, 6);
    ellipse(g, 32, 39, 15, 5);
    g.fillStyle = locked ? "rgba(11,8,6,0.3)" : "rgba(138,59,35,0.35)";
    if (c.picked) {
      g.shadowBlur = 14;
      g.shadowColor = "rgba(240,106,68,0.9)";
    }
    g.fill();
    g.shadowBlur = 0;
    g.lineWidth = 1.5;
    g.strokeStyle = locked ? "#4A3624" : "#C2552E";
    g.stroke();

    const hut = picture(BARRACKS, redraw);

    if (loaded(hut)) g.drawImage(locked ? greyed(hut) : hut, 16, 11, 32, 32);

    const look = CAMP_LABEL[c.state];

    if (c.label) {
      const text = locked ? String(c.level) : c.state === "cooldown" ? formatDuration(c.readyAt - this.now) : `Camp ${c.level}`;

      plate(g, text, 32, 45, {
        font: `900 9.5px ${DISPLAY}`,
        h: 15,
        r: 6,
        pad: 6,
        fill: look.fill,
        stroke: look.stroke,
        color: look.color,
        icon: locked ? picture(LOCK, redraw) : undefined,
      });
    } else if (!locked) {
      // Zoomed out: just the camp's number in a small badge, coloured by its state.
      g.beginPath();
      g.arc(32, 47.5, 7.5, 0, Math.PI * 2);
      g.fillStyle = look.fill;
      g.fill();
      g.lineWidth = 1.5;
      g.strokeStyle = look.stroke;
      g.stroke();
      g.font = `900 8.5px ${DISPLAY}`;
      g.fillStyle = look.color;
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.fillText(String(c.level), 32, 48);
    }
    g.restore();
  }
}

/**
 * The canvas, filling the map's box. Its painter is handed to WarMap
 * (`onPainter`, null when it goes), which feeds it the camera, the land and
 * the markers.
 */
export const MapCanvas = ({ onPainter }: { onPainter: (p: MapPainter | null) => void }) => {
  const ref = useRef<HTMLCanvasElement>(null);
  const onPainterRef = useRef(onPainter);

  // A layout effect, so the painter is there before the ground hands it the
  // backdrop (GroundOverview paints in a layout effect too, later in the tree).
  useLayoutEffect(() => {
    const c = ref.current;

    if (!c) return;
    const p = new MapPainter(c);
    const ro = new ResizeObserver(() => p.resize(c.clientWidth, c.clientHeight));
    const hand = onPainterRef.current;

    hand(p);
    ro.observe(c);
    // The display font may arrive after the first frame: draw the labels again with it.
    document.fonts?.load(`700 9px ${DISPLAY}`).then(p.request, () => {});

    return () => {
      ro.disconnect();
      p.dispose();
      hand(null);
    };
  }, []);

  return <canvas ref={ref} aria-hidden="true" className="absolute inset-0 w-full h-full" />;
};
