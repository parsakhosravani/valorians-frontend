/**
 * Fire along the bottom of the loading screen: flames licking up from below
 * and sparks flying off them.
 *
 * The flames are a small heat grid, the classic way game fire is made: the
 * bottom row burns at full heat, and every frame each cell takes the heat of
 * the cell below it, a little cooler and nudged a cell to the side at random.
 * That alone grows real tongues of fire that rise, split and flicker. A slow
 * wind leans them now one way, now the other. Heat is coloured from deep red
 * through orange and gold to white, see-through where it's cool, and the
 * small grid is stretched soft over the bottom of the screen.
 *
 * Sparks are short glowing streaks thrown up out of the flames, drifting on
 * the heat and burning out. Plain canvas code with no React, so it can be
 * previewed off the page.
 */

type Ctx = CanvasRenderingContext2D;
type Sprite = CanvasImageSource & { width: number; height: number };
export type MakeCanvas = (w: number, h: number) => { canvas: Sprite; g: Ctx };

type Spark = { x: number; y: number; vx: number; vy: number; life: number; age: number; heat: number };

/** Grid cells across (the height follows the flames' reach). */
const COLS = 64;
/** Most heat a cell holds. */
const MAX = 36;
/** Grid rows: the fire's height in cells. */
const ROWS = 34;

/** Heat → colour: see-through when cool, deep red, orange, gold, near white at the root. */
const PALETTE: [number, number, number, number][] = Array.from({ length: MAX + 1 }, (_, i) => {
  const k = i / MAX;
  const stops: [number, [number, number, number, number]][] = [
    [0, [40, 6, 2, 0]],
    [0.2, [110, 18, 6, 0]],
    [0.4, [200, 55, 14, 0.55]],
    [0.6, [245, 115, 28, 0.85]],
    [0.8, [255, 185, 70, 0.95]],
    [1, [255, 240, 190, 1]],
  ];
  let j = 0;

  while (j < stops.length - 2 && k > stops[j + 1][0]) j++;
  const [k0, c0] = stops[j];
  const [k1, c1] = stops[j + 1];
  const f = Math.max(0, Math.min(1, (k - k0) / (k1 - k0)));

  return c0.map((v, n) => v + (c1[n] - v) * f) as [number, number, number, number];
});

export function createFire(width: number, height: number, make: MakeCanvas) {
  let w = width;
  let h = height;
  // How tall the fire stands (px), whatever the screen.
  const reach = () => Math.min(150, Math.max(100, h * 0.16));
  const rows = ROWS;
  const heat = new Uint8Array(COLS * rows);
  // The heat as shown: softened across neighbouring cells, so flames read as smooth shapes.
  const shown = new Float32Array(COLS * rows);
  const { canvas: grid, g: gg } = make(COLS, rows);
  const pixels = gg.createImageData(COLS, rows);
  // Stretched in two steps (×4, then to the screen) so the cells melt into soft flame, not blocks.
  const { canvas: soft, g: sg } = make(COLS * 4, rows * 4);
  const glowSprite = (() => {
    const S = 32;
    const { canvas, g } = make(S, S);
    const grad = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);

    grad.addColorStop(0, "rgba(255,220,140,1)");
    grad.addColorStop(1, "rgba(255,120,40,0)");
    g.fillStyle = grad;
    g.fillRect(0, 0, S, S);

    return canvas;
  })();
  const sparks: Spark[] = [];
  let wind = 0;
  let acc = 0;

  const spark = (x: number, y: number): Spark => ({
    x,
    y,
    vx: (Math.random() - 0.5) * 50,
    vy: 110 + Math.random() * 180,
    life: 1 + Math.random() * 1.8,
    age: 0,
    heat: Math.random(),
  });

  /** One tick of the fire: the root burns, heat climbs and cools. */
  const burn = (t: number) => {
    // The root burns hotter in patches that drift and pulse, so the fire rises
    // in separate tongues rather than one even sheet.
    for (let x = 0; x < COLS; x++) {
      const patch = 0.5 + 0.3 * Math.sin(x * 0.42 + t * 1.3) + 0.2 * Math.sin(x * 0.17 - t * 0.8);

      heat[(rows - 1) * COLS + x] = Math.round(MAX * Math.min(1, Math.max(0.35, patch + 0.1 + (Math.random() - 0.5) * 0.25)));
    }
    // Wind: a slow lean one way or the other.
    wind = Math.sin(t * 0.7) * 0.6 + Math.sin(t * 1.9) * 0.3;
    for (let y = 0; y < rows - 1; y++)
      for (let x = 0; x < COLS; x++) {
        const below = heat[(y + 1) * COLS + x];
        const r = Math.random();
        const cool = r < 0.3 ? 0 : r < 0.75 ? 1 : r < 0.93 ? 2 : 3;
        const shift = Math.round(Math.random() * 2 - 1 + wind * Math.random());
        const to = x + shift;

        if (to >= 0 && to < COLS) heat[y * COLS + to] = Math.max(0, below - cool);
      }
  };

  // Light it and let it rise before the first frame.
  for (let i = 0; i < rows * 2; i++) burn(i / 30);
  for (let i = 0; i < 12; i++) {
    const s = spark(Math.random() * w, h - Math.random() * h * 0.5);
    s.age = Math.random() * s.life * 0.8;
    sparks.push(s);
  }

  return {
    resize(width2: number, height2: number) {
      w = width2;
      h = height2;
    },

    /** Moves everything on by `dt` seconds; `t` is the clock in seconds. */
    step(dt: number, t: number) {
      // The fire ticks at a steady 30 a second whatever the frame rate.
      acc += dt;
      while (acc >= 1 / 30) {
        acc -= 1 / 30;
        burn(t);
      }

      for (let i = sparks.length - 1; i >= 0; i--) {
        const s = sparks[i];

        s.age += dt;
        if (s.age >= s.life || s.y < -20) {
          sparks.splice(i, 1);
          continue;
        }
        // Carried on the heat: slows as it rises, wanders sideways with the wind.
        s.vy *= 1 - dt * 0.35;
        s.vx += (wind * 40 + Math.sin(t * 2.3 + s.heat * 20) * 25 - s.vx) * dt;
        s.x += s.vx * dt;
        s.y -= s.vy * dt;
      }
      if (Math.random() < dt * 7 && sparks.length < 40) sparks.push(spark(Math.random() * w, h - Math.random() * reach() * 0.5));
    },

    draw(g: Ctx) {
      const d = pixels.data;

      for (let y = 0; y < rows; y++)
        for (let x = 0; x < COLS; x++) {
          let sum = 0;
          let n = 0;

          for (let dy = -1; dy <= 1; dy++)
            for (let dx = -1; dx <= 1; dx++) {
              const yy = y + dy;
              const xx = x + dx;

              if (yy < 0 || yy >= rows || xx < 0 || xx >= COLS) continue;
              const wgt = dx === 0 && dy === 0 ? 4 : dx === 0 || dy === 0 ? 2 : 1;

              sum += heat[yy * COLS + xx] * wgt;
              n += wgt;
            }
          shown[y * COLS + x] = sum / n;
        }
      for (let i = 0; i < heat.length; i++) {
        const [r, gr, b, a] = PALETTE[Math.round(shown[i])];

        d[i * 4] = r;
        d[i * 4 + 1] = gr;
        d[i * 4 + 2] = b;
        d[i * 4 + 3] = a * 255;
      }
      gg.putImageData(pixels, 0, 0);
      g.save();
      g.imageSmoothingEnabled = true;
      g.imageSmoothingQuality = "high";
      // A warm glow behind, then the flames, stretched over the bottom of the screen.
      sg.clearRect(0, 0, soft.width, soft.height);
      sg.imageSmoothingEnabled = true;
      sg.imageSmoothingQuality = "high";
      sg.drawImage(grid, 0, 0, soft.width, soft.height);
      g.globalCompositeOperation = "lighter";
      g.globalAlpha = 0.9;
      g.drawImage(soft, -w * 0.04, h - reach(), w * 1.08, reach() + 4);

      // Sparks: a hot streak along the way they're going, with a glow at the head.
      g.lineCap = "round";
      for (const s of sparks) {
        const k = s.age / s.life;
        const a = (k < 0.08 ? k / 0.08 : 1) * (1 - k) ** 1.2;

        g.globalAlpha = a;
        g.strokeStyle = s.heat > 0.6 ? "rgb(255,236,170)" : "rgb(255,170,70)";
        g.lineWidth = 1.4;
        g.beginPath();
        g.moveTo(s.x, s.y);
        g.lineTo(s.x - s.vx * 0.035, s.y + s.vy * 0.035);
        g.stroke();
        g.globalAlpha = a * 0.7;
        g.drawImage(glowSprite, s.x - 5, s.y - 5, 10, 10);
      }
      g.restore();
    },
  };
}
