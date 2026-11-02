/**
 * Stand-in for Node's "crypto" in the mirror. The server only uses:
 * createHash("sha256") for derived secrets, randomInt for battle luck and
 * randomBytes(n).toString("base64url") for invite codes. (HMAC was only for
 * init data, which the platform now checks.)
 */

function randomBytesRaw(n: number): Uint8Array {
  const out = new Uint8Array(n);
  const c = (globalThis as any).crypto;

  if (c?.getRandomValues) return c.getRandomValues(out);
  for (let i = 0; i < n; i++) out[i] = Math.floor(Math.random() * 256);

  return out;
}

const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

function base64(bytes: Uint8Array, url: boolean) {
  let s = "";

  for (let i = 0; i < bytes.length; i += 3) {
    const n = (bytes[i] << 16) | ((bytes[i + 1] ?? 0) << 8) | (bytes[i + 2] ?? 0);

    s += B64[(n >> 18) & 63] + B64[(n >> 12) & 63];
    s += i + 1 < bytes.length ? B64[(n >> 6) & 63] : "=";
    s += i + 2 < bytes.length ? B64[n & 63] : "=";
  }

  return url ? s.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "") : s;
}

const hex = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");

class Bytes {
  constructor(public bytes: Uint8Array) {}
  toString(enc: string = "hex") {
    if (enc === "hex") return hex(this.bytes);
    if (enc === "base64") return base64(this.bytes, false);
    if (enc === "base64url") return base64(this.bytes, true);

    return Array.from(this.bytes, (x) => String.fromCharCode(x)).join("");
  }
  get length() {
    return this.bytes.length;
  }
}

// ─── SHA-256 (FIPS 180-4) ────────────────────────────────────────────────────

const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98,
  0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786,
  0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8,
  0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
  0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819,
  0xd6990624, 0xf40e3585, 0x106aa070, 0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a,
  0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7,
  0xc67178f2,
]);

function utf8(s: string): Uint8Array {
  const out: number[] = [];

  for (const ch of s) {
    let c = ch.codePointAt(0)!;

    if (c < 0x80) out.push(c);
    else if (c < 0x800) out.push(0xc0 | (c >> 6), 0x80 | (c & 63));
    else if (c < 0x10000) out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    else {
      out.push(0xf0 | (c >> 18), 0x80 | ((c >> 12) & 63), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
      c = 0;
    }
  }

  return new Uint8Array(out);
}

export function sha256(data: Uint8Array): Uint8Array {
  const len = data.length;
  const total = Math.ceil((len + 9) / 64) * 64;
  const m = new Uint8Array(total);

  m.set(data);
  m[len] = 0x80;
  const bits = len * 8;

  new DataView(m.buffer).setUint32(total - 4, bits >>> 0);
  new DataView(m.buffer).setUint32(total - 8, Math.floor(bits / 2 ** 32));
  const H = new Uint32Array([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]);
  const W = new Uint32Array(64);
  const view = new DataView(m.buffer);
  const rotr = (x: number, n: number) => (x >>> n) | (x << (32 - n));

  for (let off = 0; off < total; off += 64) {
    for (let i = 0; i < 16; i++) W[i] = view.getUint32(off + i * 4);
    for (let i = 16; i < 64; i++) {
      const s0 = rotr(W[i - 15], 7) ^ rotr(W[i - 15], 18) ^ (W[i - 15] >>> 3);
      const s1 = rotr(W[i - 2], 17) ^ rotr(W[i - 2], 19) ^ (W[i - 2] >>> 10);

      W[i] = (W[i - 16] + s0 + W[i - 7] + s1) >>> 0;
    }
    let [a, b, c, d, e, f, g, h] = H;

    for (let i = 0; i < 64; i++) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const t1 = (h + S1 + ch + K[i] + W[i]) >>> 0;
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const t2 = (S0 + maj) >>> 0;

      h = g;
      g = f;
      f = e;
      e = (d + t1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (t1 + t2) >>> 0;
    }
    H[0] += a;
    H[1] += b;
    H[2] += c;
    H[3] += d;
    H[4] += e;
    H[5] += f;
    H[6] += g;
    H[7] += h;
  }
  const out = new Uint8Array(32);

  for (let i = 0; i < 8; i++) new DataView(out.buffer).setUint32(i * 4, H[i]);

  return out;
}

function createHash(alg: string) {
  if (alg !== "sha256") throw new Error(`crypto shim: ${alg} not supported`);
  const parts: Uint8Array[] = [];
  const h = {
    update(d: string | Uint8Array) {
      parts.push(typeof d === "string" ? utf8(d) : d);

      return h;
    },
    digest(enc?: string) {
      const all = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
      let o = 0;

      for (const p of parts) {
        all.set(p, o);
        o += p.length;
      }
      const b = new Bytes(sha256(all));

      return enc ? b.toString(enc) : b;
    },
  };

  return h;
}

function randomInt(min: number, max?: number) {
  if (max === undefined) [min, max] = [0, min];
  const range = max - min;
  const b = randomBytesRaw(4);
  const n = ((b[0] << 24) | (b[1] << 16) | (b[2] << 8) | b[3]) >>> 0;

  return min + (n % range);
}

const randomBytes = (n: number) => new Bytes(randomBytesRaw(n));

const randomUUID = () => {
  const b = randomBytesRaw(16);

  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = hex(b);

  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
};

const crypto = { createHash, randomInt, randomBytes, randomUUID };

export { createHash, randomInt, randomBytes, randomUUID };
export default crypto;
