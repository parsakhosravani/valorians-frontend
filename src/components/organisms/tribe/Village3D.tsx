"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import clsx from "clsx";
import * as THREE from "three";
import { MapControls } from "three/examples/jsm/controls/MapControls.js";

import { DEFAULT_PLOT_SIZE, PLOTS, RIVER, ROADS, UNIT, WALL, toWorld } from "./villageLayout";

import { useGame } from "@/context";
import { BUILDINGS, BuildingDef, RESOURCE_IDS, buildingImage } from "@/lib/game/config";
import { buildingUpgradeInfo, getRates } from "@/lib/game/engine";
import { formatDuration } from "@/lib/format";

type Props = { onOpen: (b: BuildingDef) => void; onUnsupported?: () => void };

// ─── Small helpers ───────────────────────────────────────────────────────────

/** Deterministic pseudo-random so the forest looks the same every visit. */
const rng = (seed: number) => () => {
  seed = (seed * 16807) % 2147483647;

  return (seed - 1) / 2147483646;
};

const insideWall = (mx: number, my: number, pad = 0) =>
  ((mx - WALL.cx) / (WALL.rx + pad)) ** 2 + ((my - WALL.cy) / (WALL.ry + pad)) ** 2 < 1;

const distToPolyline = (px: number, py: number, pts: [number, number][]) => {
  let best = Infinity;

  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, ay] = pts[i];
    const [bx, by] = pts[i + 1];
    const dx = bx - ax;
    const dy = by - ay;
    const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));

    best = Math.min(best, Math.hypot(px - (ax + t * dx), py - (ay + t * dy)));
  }

  return best;
};

/** Height of the land at a world point: flat village, rolling hills outside. */
const heightAt = (wx: number, wz: number) => {
  const mx = wx * UNIT + 390;
  const my = wz * UNIT + 630;
  const e = Math.sqrt(((mx - WALL.cx) / WALL.rx) ** 2 + ((my - WALL.cy) / WALL.ry) ** 2);
  const outside = Math.max(0, e - 1.05);
  const hills = Math.sin(wx * 0.23) * Math.cos(wz * 0.19) * 1.4 + Math.sin(wx * 0.51 + wz * 0.37) * 0.6;
  const river = distToPolyline(mx, my, RIVER);
  const riverCut = river < 60 ? -0.6 * (1 - river / 60) : 0;

  return Math.min(outside * 9, 1) * (2.2 + hills) + outside * 6 + riverCut;
};

const canvasTexture = (w: number, h: number, draw: (ctx: CanvasRenderingContext2D) => void) => {
  const c = document.createElement("canvas");

  c.width = w;
  c.height = h;
  draw(c.getContext("2d")!);
  const t = new THREE.CanvasTexture(c);

  t.colorSpace = THREE.SRGBColorSpace;

  return t;
};

// ─── Building status shown in the labels ─────────────────────────────────────

type Status = { level: number; job?: { toLevel: number; endsAt: number; startedAt: number }; canUpgrade: boolean };

const useStatuses = () => {
  const { state } = useGame();

  return useMemo(() => {
    const free = state.queue.length < getRates(state).builders;
    const out: Record<string, Status> = {};

    for (const b of BUILDINGS) {
      const level = state.buildings[b.id] ?? 0;
      const job = state.queue.find((q) => q.building === b.id);
      const info = buildingUpgradeInfo(state, b.id);

      out[b.id] = {
        level,
        job,
        canUpgrade:
          level > 0 && !job && !info.maxed && free && RESOURCE_IDS.every((r) => state.resources[r] >= info.cost),
      };
    }

    return out;
  }, [state]);
};

// ─── Scene ───────────────────────────────────────────────────────────────────

type SceneApi = {
  sprites: Map<string, THREE.Sprite>;
  dispose: () => void;
};

function buildScene(
  mount: HTMLDivElement,
  labels: Record<string, HTMLDivElement | null>,
  onTap: (id: string) => void
): SceneApi {
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });

  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(mount.clientWidth, mount.clientHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.domElement.style.touchAction = "none";
  mount.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const sky = new THREE.Color("#3A2A1E");

  scene.background = sky;
  scene.fog = new THREE.Fog(sky, 60, 120);

  const camera = new THREE.PerspectiveCamera(38, mount.clientWidth / mount.clientHeight, 0.5, 300);
  const th = toWorld(PLOTS["town-hall"].x, PLOTS["town-hall"].y);

  camera.position.set(th.x + 5, 44, th.z + 34);

  const controls = new MapControls(camera, renderer.domElement);

  controls.target.set(th.x, 0, th.z - 2);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.screenSpacePanning = false;
  controls.minDistance = 12;
  controls.maxDistance = 72;
  controls.minPolarAngle = 0.35;
  controls.maxPolarAngle = 1.05;
  controls.touches = { ONE: THREE.TOUCH.PAN, TWO: THREE.TOUCH.DOLLY_ROTATE };
  controls.update();

  // Keep the camera over the village.
  const clampTarget = () => {
    const t = controls.target;
    const cx = THREE.MathUtils.clamp(t.x, -20, 20);
    const cz = THREE.MathUtils.clamp(t.z, -26, 26);
    const dx = cx - t.x;
    const dz = cz - t.z;

    if (dx || dz) {
      t.x = cx;
      t.z = cz;
      camera.position.x += dx;
      camera.position.z += dz;
    }
  };

  controls.addEventListener("change", clampTarget);

  // Light: warm low sun, cool fill, a fire on the plaza.
  scene.add(new THREE.HemisphereLight("#FFE2B8", "#2B1E12", 1.1));
  const sun = new THREE.DirectionalLight("#FFB877", 2.6);

  sun.position.set(-28, 38, 18);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -38, right: 38, top: 38, bottom: -38, near: 1, far: 120 });
  sun.shadow.bias = -0.0006;
  scene.add(sun);
  const fire = new THREE.PointLight("#FF7A2E", 18, 14, 2);

  fire.position.set(th.x + 3.2, 1.6, th.z + 2.6);
  scene.add(fire);

  const disposables: { dispose: () => void }[] = [];
  const track = <T extends { dispose: () => void }>(x: T) => (disposables.push(x), x);

  // Ground with rolling hills outside the palisade.
  {
    const size = 140;
    const seg = 140;
    const geo = track(new THREE.PlaneGeometry(size, size, seg, seg));

    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position;
    const colors = new Float32Array(pos.count * 3);
    const c1 = new THREE.Color("#3E5A2A");
    const c2 = new THREE.Color("#2F4720");
    const c3 = new THREE.Color("#5A6B33");
    const tmp = new THREE.Color();

    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      const h = heightAt(x, z);

      pos.setY(i, h);
      const n = (Math.sin(x * 0.7) * Math.cos(z * 0.6) + Math.sin(x * 1.9 + z * 1.3) * 0.5 + 1.5) / 3;

      tmp.copy(c2).lerp(c1, n);
      if (h > 3) tmp.lerp(c3, Math.min(1, (h - 3) / 6) * 0.5);
      colors.set([tmp.r, tmp.g, tmp.b], i * 3);
    }
    geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    geo.computeVertexNormals();
    const ground = new THREE.Mesh(geo, track(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 })));

    ground.receiveShadow = true;
    scene.add(ground);
  }

  // Dirt roads and the plaza, laid just above the grass.
  const dirt = track(new THREE.MeshStandardMaterial({ color: "#6B5236", roughness: 1 }));
  const dirtLight = track(new THREE.MeshStandardMaterial({ color: "#7E6342", roughness: 1 }));

  for (const road of ROADS) {
    for (let i = 0; i < road.length - 1; i++) {
      const a = toWorld(...road[i]);
      const b = toWorld(...road[i + 1]);
      const len = Math.hypot(b.x - a.x, b.z - a.z);
      const geo = track(new THREE.PlaneGeometry(len + 1.1, 1.1));

      geo.rotateX(-Math.PI / 2);
      const m = new THREE.Mesh(geo, dirt);

      m.position.set((a.x + b.x) / 2, 0.03, (a.z + b.z) / 2);
      m.rotation.y = -Math.atan2(b.z - a.z, b.x - a.x);
      m.receiveShadow = true;
      scene.add(m);
    }
  }
  {
    const plaza = new THREE.Mesh(track(new THREE.CircleGeometry(1, 48)), dirt);

    plaza.rotation.x = -Math.PI / 2;
    plaza.scale.set(7, 3.4, 1);
    plaza.position.set(th.x, 0.04, th.z + 0.6);
    plaza.receiveShadow = true;
    scene.add(plaza);
    const inner = new THREE.Mesh(track(new THREE.CircleGeometry(1, 48)), dirtLight);

    inner.rotation.x = -Math.PI / 2;
    inner.scale.set(5.6, 2.5, 1);
    inner.position.set(th.x, 0.05, th.z + 0.6);
    inner.receiveShadow = true;
    scene.add(inner);
  }

  // Fields south of the village.
  {
    const tex = track(
      canvasTexture(256, 256, (ctx) => {
        for (let i = 0; i < 8; i++) {
          ctx.fillStyle = i % 2 ? "#6B6A2E" : "#7C7A36";
          ctx.fillRect(0, i * 32, 256, 32);
        }
      })
    );
    const field = new THREE.Mesh(
      track(new THREE.PlaneGeometry(20, 7)),
      track(new THREE.MeshStandardMaterial({ map: tex, roughness: 1 }))
    );

    field.rotation.x = -Math.PI / 2;
    field.rotation.z = 0.08;
    const f = toWorld(320, 1010);

    field.position.set(f.x, 0.035, f.z);
    field.receiveShadow = true;
    scene.add(field);
  }

  // River: a ribbon along the curve with a slowly moving shimmer.
  let waterTex: THREE.CanvasTexture | null = null;
  {
    const curve = new THREE.CatmullRomCurve3(
      RIVER.map(([x, y]) => {
        const w = toWorld(x, y);

        return new THREE.Vector3(w.x, 0, w.z);
      })
    );
    const n = 200;
    const width = 2.2;
    const verts: number[] = [];
    const uvs: number[] = [];
    const idx: number[] = [];

    for (let i = 0; i <= n; i++) {
      const p = curve.getPoint(i / n);
      const t = curve.getTangent(i / n);
      const side = new THREE.Vector3(-t.z, 0, t.x).normalize().multiplyScalar(width / 2);
      const y = Math.max(heightAt(p.x, p.z), -0.5) + 0.12;

      verts.push(p.x + side.x, y, p.z + side.z, p.x - side.x, y, p.z - side.z);
      uvs.push(0, i / 6, 1, i / 6);
      if (i < n) idx.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
    }
    const geo = track(new THREE.BufferGeometry());

    geo.setAttribute("position", new THREE.Float32BufferAttribute(verts, 3));
    geo.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    waterTex = track(
      canvasTexture(128, 128, (ctx) => {
        ctx.fillStyle = "#2F6A86";
        ctx.fillRect(0, 0, 128, 128);
        const r = rng(7);

        for (let i = 0; i < 70; i++) {
          ctx.fillStyle = `rgba(190,230,255,${0.08 + r() * 0.18})`;
          ctx.fillRect(r() * 128, r() * 128, 6 + r() * 26, 2);
        }
      })
    );
    waterTex.wrapS = waterTex.wrapT = THREE.RepeatWrapping;
    const water = new THREE.Mesh(
      geo,
      track(new THREE.MeshStandardMaterial({ map: waterTex, roughness: 0.15, metalness: 0.2, transparent: true, opacity: 0.92 }))
    );

    water.receiveShadow = true;
    scene.add(water);
  }

  // Palisade of pointed logs, with a gap for the gate.
  {
    const logs: THREE.Vector3[] = [];
    const steps = 340;

    for (let i = 0; i < steps; i++) {
      const a = (i / steps) * Math.PI * 2;
      const mx = WALL.cx + Math.sin(a) * WALL.rx;
      const my = WALL.cy + Math.cos(a) * WALL.ry;

      if (Math.abs(mx - 390) < 70 && my > 1000) continue; // gate
      if (distToPolyline(mx, my, RIVER) < 40) continue; // don't build in the river
      const w = toWorld(mx, my);

      logs.push(new THREE.Vector3(w.x, heightAt(w.x, w.z), w.z));
    }
    const logGeo = track(new THREE.CylinderGeometry(0.2, 0.22, 1.7, 6));
    const tipGeo = track(new THREE.ConeGeometry(0.2, 0.45, 6));
    const wood = track(new THREE.MeshStandardMaterial({ color: "#6E4A2A", roughness: 0.9 }));
    const body = new THREE.InstancedMesh(logGeo, wood, logs.length);
    const tips = new THREE.InstancedMesh(tipGeo, wood, logs.length);
    const m = new THREE.Matrix4();
    const r = rng(3);

    logs.forEach((p, i) => {
      const h = 0.85 + r() * 0.2;

      m.makeTranslation(p.x, p.y + h, p.z);
      body.setMatrixAt(i, m);
      m.makeTranslation(p.x, p.y + h * 2 + 0.2, p.z);
      tips.setMatrixAt(i, m);
    });
    body.castShadow = tips.castShadow = true;
    scene.add(body, tips);
  }

  // Forest: low-poly pines outside the wall, avoiding the river.
  {
    const r = rng(42);
    const spots: THREE.Vector3[] = [];

    for (let i = 0; i < 2600 && spots.length < 420; i++) {
      const wx = (r() - 0.5) * 120;
      const wz = (r() - 0.5) * 120;
      const mx = wx * UNIT + 390;
      const my = wz * UNIT + 630;

      if (insideWall(mx, my, 50)) continue;
      if (distToPolyline(mx, my, RIVER) < 70) continue;
      if (Math.abs(wx) < 3 && wz > 23 && wz < 40) continue; // keep the gate road clear
      spots.push(new THREE.Vector3(wx, heightAt(wx, wz), wz));
    }
    const trunkGeo = track(new THREE.CylinderGeometry(0.12, 0.16, 0.8, 5));
    const crownGeo = track(new THREE.ConeGeometry(0.9, 2.6, 7));
    const trunks = new THREE.InstancedMesh(trunkGeo, track(new THREE.MeshStandardMaterial({ color: "#4A3220" })), spots.length);
    const crowns = new THREE.InstancedMesh(
      crownGeo,
      track(new THREE.MeshStandardMaterial({ color: "#284021", roughness: 0.95, flatShading: true })),
      spots.length
    );
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3();
    const tint = new THREE.Color();

    spots.forEach((p, i) => {
      const k = 0.8 + r() * 0.9;

      s.set(k, k, k);
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), r() * Math.PI);
      m.compose(new THREE.Vector3(p.x, p.y + 0.4 * k, p.z), q, s);
      trunks.setMatrixAt(i, m);
      m.compose(new THREE.Vector3(p.x, p.y + 1.9 * k, p.z), q, s);
      crowns.setMatrixAt(i, m);
      crowns.setColorAt(i, tint.setHSL(0.27 + r() * 0.06, 0.35 + r() * 0.15, 0.17 + r() * 0.08));
    });
    trunks.castShadow = crowns.castShadow = true;
    scene.add(trunks, crowns);
  }

  // Mountains behind the mine.
  {
    const rock = track(new THREE.MeshStandardMaterial({ color: "#5B5750", roughness: 1, flatShading: true }));
    const snow = track(new THREE.MeshStandardMaterial({ color: "#D9D4C8", roughness: 1, flatShading: true }));
    const peaks: [number, number, number, number][] = [
      [14, -40, 9, 13],
      [24, -36, 7, 10],
      [4, -46, 10, 15],
      [-12, -44, 8, 11],
      [32, -28, 6, 8],
    ];

    for (const [x, z, rad, h] of peaks) {
      const m = new THREE.Mesh(track(new THREE.ConeGeometry(rad, h, 7)), rock);

      m.position.set(x, h / 2 + heightAt(x, z) - 1, z);
      m.castShadow = true;
      scene.add(m);
      const cap = new THREE.Mesh(track(new THREE.ConeGeometry(rad * 0.3, h * 0.3, 7)), snow);

      cap.position.set(x, h - h * 0.15 + heightAt(x, z) - 1, z);
      scene.add(cap);
    }
  }

  // Buildings: the game's art standing on stone foundations.
  const loader = new THREE.TextureLoader();
  const sprites = new Map<string, THREE.Sprite>();
  const anchors = new Map<string, THREE.Vector3>();
  const shadowTex = track(
    canvasTexture(128, 128, (ctx) => {
      const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);

      g.addColorStop(0, "rgba(0,0,0,0.55)");
      g.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 128, 128);
    })
  );
  const shadowMat = track(new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false }));
  const padMat = track(new THREE.MeshStandardMaterial({ color: "#5E4A35", roughness: 1 }));

  for (const b of BUILDINGS) {
    const plot = PLOTS[b.id];

    if (!plot) continue;
    const w = toWorld(plot.x, plot.y);
    const size = ((plot.s ?? DEFAULT_PLOT_SIZE) / UNIT) * 0.95;

    const pad = new THREE.Mesh(track(new THREE.CylinderGeometry(size * 0.38, size * 0.42, 0.18, 24)), padMat);

    pad.position.set(w.x, 0.09, w.z);
    pad.receiveShadow = true;
    scene.add(pad);
    const blob = new THREE.Mesh(track(new THREE.PlaneGeometry(size * 1.1, size * 0.6)), shadowMat);

    blob.rotation.x = -Math.PI / 2;
    blob.position.set(w.x + 0.4, 0.2, w.z + 0.3);
    scene.add(blob);

    const tex = track(loader.load(buildingImage(b)));

    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    const mat = track(new THREE.SpriteMaterial({ map: tex, transparent: true, alphaTest: 0.05 }));
    const sprite = new THREE.Sprite(mat);

    sprite.center.set(0.5, 0.1);
    sprite.scale.set(size, size, 1);
    sprite.position.set(w.x, 0.15, w.z);
    sprite.userData.id = b.id;
    sprite.userData.size = size;
    scene.add(sprite);
    sprites.set(b.id, sprite);
    anchors.set(b.id, new THREE.Vector3(w.x, 0, w.z + size * 0.12));
  }

  // Embers drifting up from the plaza fire.
  const emberCount = 40;
  const emberGeo = track(new THREE.BufferGeometry());
  const emberPos = new Float32Array(emberCount * 3);
  const emberSeed = rng(11);

  for (let i = 0; i < emberCount; i++) {
    emberPos.set([fire.position.x + (emberSeed() - 0.5), emberSeed() * 4, fire.position.z + (emberSeed() - 0.5)], i * 3);
  }
  emberGeo.setAttribute("position", new THREE.BufferAttribute(emberPos, 3));
  const embers = new THREE.Points(
    emberGeo,
    track(new THREE.PointsMaterial({ color: "#FFB27A", size: 0.12, transparent: true, opacity: 0.9, depthWrite: false }))
  );

  scene.add(embers);

  // Tap a building (ignore drags).
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  let down: { x: number; y: number } | null = null;
  const onDown = (e: PointerEvent) => (down = { x: e.clientX, y: e.clientY });
  const onUp = (e: PointerEvent) => {
    if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 8) return;
    down = null;
    const rect = renderer.domElement.getBoundingClientRect();

    ndc.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
    const hits = raycaster.intersectObjects([...sprites.values()], false);

    if (hits[0]) {
      const s = hits[0].object as THREE.Sprite;

      s.userData.bounce = performance.now();
      onTap(s.userData.id);
    }
  };

  renderer.domElement.addEventListener("pointerdown", onDown);
  renderer.domElement.addEventListener("pointerup", onUp);

  // Resize with the container.
  const ro = new ResizeObserver(() => {
    const w = mount.clientWidth;
    const h = mount.clientHeight;

    if (!w || !h) return;
    renderer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  });

  ro.observe(mount);

  // Render loop; labels follow their buildings on screen.
  const v = new THREE.Vector3();
  let raf = 0;
  const clock = new THREE.Clock();
  const tick = () => {
    raf = requestAnimationFrame(tick);
    if (document.hidden) return;
    const dt = Math.min(clock.getDelta(), 0.05);
    const t = clock.elapsedTime;

    controls.update();
    if (waterTex) waterTex.offset.y = -t * 0.05;
    fire.intensity = 16 + Math.sin(t * 13) * 2 + Math.sin(t * 7.3) * 1.5;

    for (let i = 0; i < emberCount; i++) {
      let y = emberPos[i * 3 + 1] + dt * (0.6 + (i % 5) * 0.15);

      if (y > 5) {
        y = 0.6;
        emberPos[i * 3] = fire.position.x + (Math.random() - 0.5) * 0.8;
        emberPos[i * 3 + 2] = fire.position.z + (Math.random() - 0.5) * 0.8;
      }
      emberPos[i * 3 + 1] = y;
      emberPos[i * 3] += Math.sin(t * 2 + i) * 0.003;
    }
    emberGeo.attributes.position.needsUpdate = true;

    const now = performance.now();

    for (const s of sprites.values()) {
      const since = now - (s.userData.bounce ?? -1e9);
      const k = since < 300 ? 1 - Math.sin((since / 300) * Math.PI) * 0.08 : 1;

      s.scale.set(s.userData.size * (2 - k), s.userData.size * k, 1);
    }

    renderer.render(scene, camera);

    const w = renderer.domElement.clientWidth;
    const h = renderer.domElement.clientHeight;

    for (const [id, a] of anchors) {
      const el = labels[id];

      if (!el) continue;
      v.copy(a).project(camera);
      const visible = v.z < 1 && v.x > -1.2 && v.x < 1.2 && v.y > -1.2 && v.y < 1.2;

      el.style.display = visible ? "" : "none";
      if (visible) {
        const dist = camera.position.distanceTo(a);
        const scale = THREE.MathUtils.clamp(45 / dist, 0.65, 1.1);

        el.style.transform = `translate(${((v.x + 1) / 2) * w}px, ${((1 - v.y) / 2) * h}px) translate(-50%, 0) scale(${scale})`;
        el.style.zIndex = String(Math.round((1 - v.z) * 1000));
      }
    }
  };

  tick();

  return {
    sprites,
    dispose: () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      controls.dispose();
      renderer.domElement.removeEventListener("pointerdown", onDown);
      renderer.domElement.removeEventListener("pointerup", onUp);
      disposables.forEach((d) => d.dispose());
      scene.traverse((o) => {
        if ((o as THREE.InstancedMesh).isInstancedMesh) (o as THREE.InstancedMesh).dispose();
      });
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}

// ─── React component ─────────────────────────────────────────────────────────

const Icon = ({ d }: { d: string }) => (
  <svg aria-hidden="true" fill="none" height="14" stroke="#1A120B" strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" viewBox="0 0 24 24" width="14">
    <path d={d} />
  </svg>
);

export default function Village3D({ onOpen, onUnsupported }: Props) {
  const { now } = useGame();
  const statuses = useStatuses();
  const mountRef = useRef<HTMLDivElement>(null);
  const labelRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const apiRef = useRef<SceneApi | null>(null);
  const openRef = useRef(onOpen);
  const [ready, setReady] = useState(false);
  const [hint, setHint] = useState(true);

  useEffect(() => {
    const t = setTimeout(() => setHint(false), 5000);

    return () => clearTimeout(t);
  }, []);

  openRef.current = onOpen;

  useEffect(() => {
    const mount = mountRef.current;

    if (!mount) return;
    try {
      apiRef.current = buildScene(mount, labelRefs.current, (id) => {
        const b = BUILDINGS.find((x) => x.id === id);

        if (b) openRef.current(b);
      });
      setReady(true);
    } catch {
      onUnsupported?.();
    }

    return () => {
      apiRef.current?.dispose();
      apiRef.current = null;
    };
  }, []);

  // Unbuilt plots look like ghosts; built ones in full colour.
  useEffect(() => {
    const api = apiRef.current;

    if (!api) return;
    for (const [id, s] of api.sprites) {
      const st = statuses[id];
      const ghost = st && st.level === 0 && !st.job;
      const mat = s.material as THREE.SpriteMaterial;

      mat.color.set(ghost ? "#7d776c" : "#ffffff");
      mat.opacity = ghost ? 0.55 : 1;
    }
  }, [statuses, ready]);

  return (
    <div className="absolute inset-0">
      <div ref={mountRef} className="absolute inset-0" />
      <div aria-hidden="true" className="absolute inset-0 pointer-events-none overflow-hidden">
        {BUILDINGS.map((b) => {
          const st = statuses[b.id];
          const unbuilt = st.level === 0 && !st.job;
          const progress = st.job ? Math.min(1, (now - st.job.startedAt) / (st.job.endsAt - st.job.startedAt)) : 0;

          return (
            <div
              key={b.id}
              ref={(el) => {
                labelRefs.current[b.id] = el;
              }}
              className="absolute left-0 top-0 flex flex-col items-center origin-top"
              style={{ display: "none" }}
            >
              <div
                className={clsx(
                  "flex items-center gap-1 pl-0.5 pr-2 h-6 rounded-full border text-[11px] font-extrabold whitespace-nowrap shadow-md",
                  unbuilt ? "bg-panel/80 text-muted border-line" : "bg-panel/95 text-parch border-line"
                )}
              >
                {st.level > 0 ? (
                  <span className="min-w-5 h-5 px-1 rounded-full bg-gold text-[#1A120B] font-display font-black text-[11px] flex items-center justify-center">
                    {st.level}
                  </span>
                ) : (
                  <span className="w-1" />
                )}
                {unbuilt ? `Build ${b.name}` : b.name}
                {st.job ? (
                  <span className="ml-0.5 w-5 h-5 rounded-full bg-ember flex items-center justify-center">
                    <Icon d="m15 12-8.5 8.5a2.1 2.1 0 1 1-3-3L12 9M17.6 6.4 20 4M14 4l6 6-4 4-6-6z" />
                  </span>
                ) : (
                  st.canUpgrade && (
                    <span className="ml-0.5 w-5 h-5 rounded-full bg-good flex items-center justify-center animate-spot">
                      <Icon d="M12 19V5M5 12l7-7 7 7" />
                    </span>
                  )
                )}
              </div>
              {st.job && (
                <div className="mt-1 flex items-center gap-1 text-[10px] font-extrabold text-[#FFB27A] [text-shadow:0_1px_2px_#000]">
                  <span className="w-14 h-1.5 rounded-full bg-panel overflow-hidden">
                    <span className="block h-full bg-gradient-to-r from-gold to-ember" style={{ width: `${progress * 100}%` }} />
                  </span>
                  {formatDuration(st.job.endsAt - now)}
                </div>
              )}
            </div>
          );
        })}
      </div>
      {!ready && (
        <div className="absolute inset-0 flex items-center justify-center bg-ground">
          <div className="h-10 w-10 rounded-full border-4 border-gold border-t-transparent animate-spin" />
        </div>
      )}
      {hint && (
        <p className="absolute left-1/2 -translate-x-1/2 top-2 text-[11px] font-bold text-sub bg-panel/85 rounded-full px-3 py-1 pointer-events-none whitespace-nowrap transition-opacity">
          Drag to move · pinch to zoom · two fingers to turn
        </p>
      )}
    </div>
  );
}
