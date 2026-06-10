#!/usr/bin/env node
// Gera resources/icon.png — ícone do CorpSSH (512×512, PNG puro, sem deps)
// Design: igual ao SVG do TitleBar — fundo azul gradiente diagonal, >_ em branco
const zlib = require('zlib')
const fs   = require('fs')
const path = require('path')

// ─── PNG encoder ──────────────────────────────────────────────────────────────
const crcTable = new Uint32Array(256)
for (let i = 0; i < 256; i++) {
  let c = i
  for (let j = 0; j < 8; j++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1
  crcTable[i] = c
}
function crc32(buf) {
  let c = 0xFFFFFFFF
  for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xFF] ^ (c >>> 8)
  return (c ^ 0xFFFFFFFF) >>> 0
}
function chunk(type, data) {
  const t = Buffer.from(type, 'ascii')
  const l = Buffer.allocUnsafe(4); l.writeUInt32BE(data.length, 0)
  const crcBuf = Buffer.allocUnsafe(4)
  crcBuf.writeUInt32BE(crc32(Buffer.concat([t, data])), 0)
  return Buffer.concat([l, t, data, crcBuf])
}
function makePNG(size, getPixel) {
  const ihdr = Buffer.allocUnsafe(13)
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4)
  ihdr[8]=8; ihdr[9]=6; ihdr[10]=0; ihdr[11]=0; ihdr[12]=0
  const rows = []
  for (let y = 0; y < size; y++) {
    const row = Buffer.allocUnsafe(1 + size * 4); row[0] = 0
    for (let x = 0; x < size; x++) {
      const [r,g,b,a] = getPixel(x, y)
      row[1+x*4]=r; row[2+x*4]=g; row[3+x*4]=b; row[4+x*4]=a
    }
    rows.push(row)
  }
  const compressed = zlib.deflateSync(Buffer.concat(rows), { level: 9 })
  return Buffer.concat([
    Buffer.from([137,80,78,71,13,10,26,10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', compressed),
    chunk('IEND', Buffer.alloc(0))
  ])
}

// ─── Drawing helpers ──────────────────────────────────────────────────────────
function distToSeg(px, py, ax, ay, bx, by) {
  const dx = bx-ax, dy = by-ay
  const lenSq = dx*dx + dy*dy
  if (lenSq === 0) return Math.hypot(px-ax, py-ay)
  const t = Math.max(0, Math.min(1, ((px-ax)*dx + (py-ay)*dy) / lenSq))
  return Math.hypot(px - (ax+t*dx), py - (ay+t*dy))
}

class Canvas {
  constructor(size) {
    this.size = size
    this.buf = new Uint8Array(size * size * 4)
  }
  set(x, y, r, g, b, a) {
    if (x < 0 || y < 0 || x >= this.size || y >= this.size) return
    const i = (y * this.size + x) * 4
    this.buf[i]=r; this.buf[i+1]=g; this.buf[i+2]=b; this.buf[i+3]=a
  }
  blend(x, y, r, g, b, a) {
    if (x < 0 || y < 0 || x >= this.size || y >= this.size) return
    const i = (y * this.size + x) * 4
    const sa = a / 255, da = this.buf[i+3] / 255
    const oa = sa + da * (1 - sa)
    if (oa < 0.001) return
    this.buf[i]   = Math.round((r * sa + this.buf[i]   * da * (1 - sa)) / oa)
    this.buf[i+1] = Math.round((g * sa + this.buf[i+1] * da * (1 - sa)) / oa)
    this.buf[i+2] = Math.round((b * sa + this.buf[i+2] * da * (1 - sa)) / oa)
    this.buf[i+3] = Math.round(oa * 255)
  }
  line(x1, y1, x2, y2, r, R, G, B) {
    const pad = Math.ceil(r) + 2
    const minX = Math.max(0, Math.floor(Math.min(x1,x2)) - pad)
    const maxX = Math.min(this.size-1, Math.ceil(Math.max(x1,x2)) + pad)
    const minY = Math.max(0, Math.floor(Math.min(y1,y2)) - pad)
    const maxY = Math.min(this.size-1, Math.ceil(Math.max(y1,y2)) + pad)
    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        const d = distToSeg(x+0.5, y+0.5, x1, y1, x2, y2)
        if (d < r) {
          const alpha = d < r-1 ? 255 : Math.round(255 * (r - d))
          this.blend(x, y, R, G, B, alpha)
        }
      }
    }
  }
  getPixel(x, y) {
    const i = (y * this.size + x) * 4
    return [this.buf[i], this.buf[i+1], this.buf[i+2], this.buf[i+3]]
  }
}

// ─── Icon design ──────────────────────────────────────────────────────────────
const SIZE = 512
const cv = new Canvas(SIZE)

// Rounded rect helper (radius proportional to TitleBar SVG: 8/32 = 25% → 128/512)
const RADIUS = 128

function inRRect(x, y) {
  if (x < 0 || y < 0 || x >= SIZE || y >= SIZE) return false
  const r = RADIUS
  if (x < r && y < r)             return Math.hypot(x - r, y - r) < r
  if (x >= SIZE-r && y < r)       return Math.hypot(x - (SIZE-r), y - r) < r
  if (x < r && y >= SIZE-r)       return Math.hypot(x - r, y - (SIZE-r)) < r
  if (x >= SIZE-r && y >= SIZE-r) return Math.hypot(x - (SIZE-r), y - (SIZE-r)) < r
  return true
}

// 1) Background: diagonal blue gradient matching TitleBar SVG
//    #2563eb (37,99,235) at top-left → #1e40af (30,64,175) at bottom-right
const BG_TL = [37, 99, 235]
const BG_BR = [30, 64, 175]

for (let y = 0; y < SIZE; y++) {
  for (let x = 0; x < SIZE; x++) {
    if (!inRRect(x, y)) { cv.set(x, y, 0, 0, 0, 0); continue }
    const t = (x + y) / (2 * SIZE)
    const r = Math.round(BG_TL[0] + (BG_BR[0]-BG_TL[0]) * t)
    const g = Math.round(BG_TL[1] + (BG_BR[1]-BG_TL[1]) * t)
    const b = Math.round(BG_TL[2] + (BG_BR[2]-BG_TL[2]) * t)
    cv.set(x, y, r, g, b, 255)
  }
}

// 2) Top-half shine: white overlay fading from 18% opacity at top to 0% at middle
//    (matches SVG: linearGradient on top half, 0%→18% white)
for (let y = 0; y < SIZE / 2; y++) {
  for (let x = 0; x < SIZE; x++) {
    if (!inRRect(x, y)) continue
    const t = y / (SIZE / 2)          // 0 at top, 1 at middle
    const alpha = Math.round(0.18 * 255 * (1 - t))
    if (alpha > 0) cv.blend(x, y, 255, 255, 255, alpha)
  }
}

// 3) Draw >_ matching TitleBar SVG strokes scaled 16× (32 → 512)
//    SVG viewBox 32: chevron M7,11 L14,16 L7,21 — stroke 2.6
//    Scaled to 512:  M112,176 L224,256 L112,336 — stroke ~41
//    Underscore M16.5,21 H25 → M264,336 H400
const SW = 42   // stroke "radius" (half-width)

// Round line caps via rounded endpoints — the line() function already does anti-alias
const WHITE = [255, 255, 255]

// ">" chevron: top arm then bottom arm
cv.line(112, 176, 224, 256, SW, ...WHITE)
cv.line(224, 256, 112, 336, SW, ...WHITE)

// "_" underscore
cv.line(264, 336, 400, 336, SW, ...WHITE)

// 4) Write PNG
const png = makePNG(SIZE, (x, y) => cv.getPixel(x, y))
const outPath = path.join(__dirname, '..', 'resources', 'icon.png')
fs.writeFileSync(outPath, png)
console.log(`✓ Icon written: ${outPath} (${Math.round(png.length/1024)} KB)`)
