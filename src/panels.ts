// サイドに並ぶサブウィンドウ群。すべて演出用の疑似データで、Hack の状態（進行・勢い・追跡レベル）だけを見て描く。
// パネルごとに 1 クラスにまとめ、「何を表示するか」と「どう描くか」を同じ場所に置いて追いやすくしている。
import { sfx } from './audio';
import type { Hack } from './hack';
import { hex, int, pick, rand } from './rand';
import { theme } from './theme';

export type PanelId = 'mesh' | 'glyph' | 'decrypt' | 'monitor' | 'trace';

interface Panel {
  id: PanelId;
  el: HTMLElement;
  update(now: number, dt: number): void;
}

// テーマ切替に追従させるため、色は描画のたびにテーマから引く
let G = '', G_DIM = '', HI = '', RED = '';
function syncColors() {
  ({ fg: G, dim: G_DIM, hi: HI, alert: RED } = theme.canvas);
}

function shell(id: PanelId, title: string): { el: HTMLElement; body: HTMLElement } {
  const el = document.createElement('section');
  el.className = `panel p-${id}`;
  el.innerHTML = `<header><span>${title}</span><span class="pid">${hex(4).toUpperCase()}</span></header><div class="pbody"></div>`;
  return { el, body: el.querySelector('.pbody')! };
}

/** キャンバスの解像度を表示サイズに合わせ続ける */
function fitCanvas(c: HTMLCanvasElement) {
  const dpr = Math.min(2, devicePixelRatio || 1);
  const w = Math.floor(c.clientWidth * dpr);
  const h = Math.floor(c.clientHeight * dpr);
  if (c.width !== w || c.height !== h) {
    c.width = w;
    c.height = h;
  }
  const ctx = c.getContext('2d')!;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { ctx, w: c.clientWidth, h: c.clientHeight };
}

// ---------- ニューラルメッシュ（ネットワーク図） ----------
class MeshPanel implements Panel {
  id: PanelId = 'mesh';
  el: HTMLElement;
  private canvas = document.createElement('canvas');
  private nodes: { x: number; y: number; r: number; owned: number; phase: number }[] = [];
  private links: [number, number][] = [];
  private packets: { l: number; t: number; v: number; dir: 1 | -1 }[] = [];
  private seededFor = '';
  private sweep = 0;

  constructor(private hack: Hack) {
    const s = shell('mesh', 'NEURAL MESH');
    this.el = s.el;
    s.body.appendChild(this.canvas);
  }

  private build() {
    this.nodes = Array.from({ length: 22 }, (_, i) => ({
      x: i === 0 ? 0.08 : i === 1 ? 0.9 : 0.12 + rand() * 0.76,
      y: i === 0 ? 0.85 : i === 1 ? 0.2 : 0.1 + rand() * 0.8,
      r: i < 2 ? 4 : 1.5 + rand() * 2,
      owned: i === 0 ? 1 : 0,
      phase: rand() * 6.28,
    }));
    // 近い順に 2〜3 本つなぎ、交差の少ない網目にする
    this.links = [];
    this.nodes.forEach((a, i) => {
      const near = this.nodes
        .map((b, j) => ({ j, d: (a.x - b.x) ** 2 + (a.y - b.y) ** 2 }))
        .filter((o) => o.j !== i)
        .sort((p, q) => p.d - q.d)
        .slice(0, int(2, 3));
      for (const n of near) if (!this.links.some(([p, q]) => (p === n.j && q === i) || (p === i && q === n.j))) this.links.push([i, n.j]);
    });
    this.packets = [];
  }

  update(_now: number, dt: number) {
    const h = this.hack;
    if (this.seededFor !== h.target.name) {
      this.seededFor = h.target.name;
      this.build();
    }
    // 進行度に合わせて自陣ノードを増やし、「ネットワークを掌握していく」様子を見せる
    const goal = Math.floor(((h.stageIdx + h.progress) / 5) * (this.nodes.length - 1));
    const owned = this.nodes.filter((n) => n.owned > 0).length;
    if (owned <= goal) {
      const cand = this.links.filter(([a, b]) => (this.nodes[a].owned > 0) !== (this.nodes[b].owned > 0)).map(([a, b]) => (this.nodes[a].owned > 0 ? b : a));
      const pickN = cand.includes(1) && goal >= this.nodes.length - 2 ? 1 : cand.filter((c) => c !== 1)[0] ?? cand[0];
      if (pickN !== undefined) {
        this.nodes[pickN].owned = 0.01;
        sfx.scanBlip(0.8);
      }
    }
    for (const n of this.nodes) if (n.owned > 0) n.owned = Math.min(1, n.owned + dt / 400);

    const want = 6 + Math.floor(h.intensity * 30);
    while (this.packets.length < want) this.packets.push({ l: int(0, this.links.length - 1), t: 0, v: 0.4 + rand() * 1.2, dir: pick([1, -1] as const) });
    for (const p of this.packets) p.t += (p.v * (1 + h.intensity * 2) * dt) / 1000;
    this.packets = this.packets.filter((p) => p.t < 1);
    this.sweep = (this.sweep + dt / 2200) % 1;

    const { ctx, w, h: H } = fitCanvas(this.canvas);
    ctx.clearRect(0, 0, w, H);
    const alert = h.phase === 'trace';
    const P = (i: number) => [this.nodes[i].x * w, this.nodes[i].y * H] as const;
    ctx.lineWidth = 1;
    for (const [a, b] of this.links) {
      const own = this.nodes[a].owned > 0 && this.nodes[b].owned > 0;
      ctx.strokeStyle = own ? G : G_DIM;
      ctx.globalAlpha = own ? 0.7 : 0.5;
      ctx.beginPath();
      ctx.moveTo(...P(a));
      ctx.lineTo(...P(b));
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    ctx.fillStyle = HI;
    for (const p of this.packets) {
      const [a, b] = this.links[p.l];
      const t = p.dir > 0 ? p.t : 1 - p.t;
      const [x1, y1] = P(a);
      const [x2, y2] = P(b);
      ctx.fillRect(x1 + (x2 - x1) * t - 1, y1 + (y2 - y1) * t - 1, 2.5, 2.5);
    }
    const tnow = performance.now() / 1000;
    this.nodes.forEach((n, i) => {
      const [x, y] = P(i);
      const pulse = 0.5 + 0.5 * Math.sin(tnow * 3 + n.phase);
      ctx.fillStyle = i === 1 ? (alert ? RED : HI) : n.owned > 0 ? G : G_DIM;
      ctx.beginPath();
      ctx.arc(x, y, n.r + (i === 1 ? pulse * 2 : 0), 0, Math.PI * 2);
      ctx.fill();
      if (i === 1 || i === 0) {
        ctx.strokeStyle = ctx.fillStyle;
        ctx.globalAlpha = 1 - pulse;
        ctx.beginPath();
        ctx.arc(x, y, n.r + 4 + pulse * 10, 0, Math.PI * 2);
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
    });
    // レーダー風の走査線
    ctx.fillStyle = G;
    ctx.globalAlpha = 0.07;
    ctx.fillRect(this.sweep * w - 30, 0, 30, H);
    ctx.globalAlpha = 1;
    ctx.font = '10px monospace';
    ctx.fillStyle = HI;
    const [tx, ty] = P(1);
    ctx.fillText(h.target.name, Math.min(tx + 8, w - 70), ty - 8);
    ctx.fillStyle = G;
    const [ux, uy] = P(0);
    ctx.fillText('YOU', ux + 8, uy + 4);
  }
}

// ---------- グリフストリーム（Hex Viewer） ----------
class GlyphPanel implements Panel {
  id: PanelId = 'glyph';
  el: HTMLElement;
  private pre = document.createElement('pre');
  private rows: string[] = [];
  private acc = 0;
  private off = int(0, 0xffff) * 16;

  constructor(private hack: Hack) {
    const s = shell('glyph', 'GLYPH STREAM');
    this.el = s.el;
    s.body.appendChild(this.pre);
  }

  private row() {
    const b = Array.from({ length: 8 }, () => hex(2));
    // ときどき「意味のありそうな」パターンを光らせて、解析している感を出す
    const hot = rand() < 0.15 ? int(0, 7) : -1;
    const cells = b.map((x, i) => (i === hot ? `<b>${x}</b>` : x)).join(' ');
    this.off += 8;
    return `<i>${this.off.toString(16).padStart(6, '0')}</i> ${cells}`;
  }

  update(_now: number, dt: number) {
    this.acc += dt;
    const every = 110 - this.hack.intensity * 95;
    if (this.acc < every) return;
    const n = Math.min(6, Math.floor(this.acc / every));
    this.acc = 0;
    for (let i = 0; i < n; i++) this.rows.push(this.row());
    if (this.rows.length > 18) this.rows.splice(0, this.rows.length - 18);
    this.pre.innerHTML = this.rows.join('\n');
  }
}

// ---------- 格子鍵の解読 ----------
class DecryptPanel implements Panel {
  id: PanelId = 'decrypt';
  el: HTMLElement;
  private cells: HTMLElement[] = [];
  private key: string[] = [];
  private locked = 0;
  private acc = 0;
  private label: HTMLElement;

  constructor(private hack: Hack) {
    const s = shell('decrypt', 'LATTICE KEY');
    this.el = s.el;
    const grid = document.createElement('div');
    grid.className = 'kgrid';
    for (let i = 0; i < 24; i++) {
      const c = document.createElement('span');
      grid.appendChild(c);
      this.cells.push(c);
      this.key.push(hex(4).toUpperCase());
    }
    this.label = document.createElement('div');
    this.label.className = 'klabel';
    s.body.append(grid, this.label);
  }

  update(_now: number, dt: number) {
    const h = this.hack;
    // 暗号ステージ中は進行度に連動し、それ以外では時間と勢いでじわじわ進む
    const goal = h.stage.id === 'cipher' ? Math.floor((0.25 + h.progress * 0.75) * this.cells.length) : Math.min(this.cells.length - 4, this.locked + (rand() < 0.004 + h.intensity * 0.03 ? 1 : 0));
    if (this.locked < goal) {
      this.cells[this.locked].className = 'lock';
      this.cells[this.locked].textContent = this.key[this.locked];
      this.locked++;
      sfx.ok();
    }
    this.acc += dt;
    if (this.acc < 45) return;
    this.acc = 0;
    for (let i = this.locked; i < this.cells.length; i++) this.cells[i].textContent = hex(4).toUpperCase();
    const p = this.locked / this.cells.length;
    this.label.textContent = `KEYSPACE COLLAPSE ${(p * 100).toFixed(1).padStart(5)}%  ENTROPY ${(9.99 - p * 9).toFixed(2)}`;
  }
}

// ---------- システムモニタ ----------
class MonitorPanel implements Panel {
  id: PanelId = 'monitor';
  el: HTMLElement;
  private canvas = document.createElement('canvas');
  private series = [
    { name: 'CPU', v: 0.4, hist: [] as number[] },
    { name: 'MEM', v: 0.6, hist: [] as number[] },
    { name: 'NET', v: 0.3, hist: [] as number[] },
  ];
  private acc = 0;

  constructor(private hack: Hack) {
    const s = shell('monitor', 'SYSTEM MONITOR');
    this.el = s.el;
    s.body.appendChild(this.canvas);
  }

  update(_now: number, dt: number) {
    this.acc += dt;
    if (this.acc >= 60) {
      this.acc = 0;
      const k = this.hack.intensity;
      for (const s of this.series) {
        // 打鍵の勢いに引っ張られるランダムウォーク
        const target = s.name === 'MEM' ? 0.55 + k * 0.3 : 0.2 + k * 0.75;
        s.v = Math.max(0.02, Math.min(0.99, s.v + (target - s.v) * 0.1 + (rand() - 0.5) * 0.12));
        s.hist.push(s.v);
        if (s.hist.length > 80) s.hist.shift();
      }
    }
    const { ctx, w, h } = fitCanvas(this.canvas);
    ctx.clearRect(0, 0, w, h);
    const rowH = h / 3;
    ctx.font = '10px monospace';
    this.series.forEach((s, r) => {
      const y0 = r * rowH;
      ctx.fillStyle = G;
      ctx.fillText(`${s.name} ${(s.v * 100).toFixed(0).padStart(3)}%`, 4, y0 + 12);
      ctx.strokeStyle = G_DIM;
      ctx.strokeRect(70.5, y0 + 4.5, w - 76, rowH - 9);
      ctx.strokeStyle = s.v > 0.85 ? HI : G;
      ctx.beginPath();
      s.hist.forEach((v, i) => {
        const x = 71 + ((w - 78) * i) / 79;
        const y = y0 + rowH - 6 - v * (rowH - 12);
        if (i) ctx.lineTo(x, y);
        else ctx.moveTo(x, y);
      });
      ctx.stroke();
    });
  }
}

// ---------- 追跡モニタ ----------
class TracePanel implements Panel {
  id: PanelId = 'trace';
  el: HTMLElement;
  private big: HTMLElement;
  private bar: HTMLElement;
  private hops: HTMLElement;
  private route = ['tokyo', 'oslo', 'lima', 'cairo', 'tallinn', 'perth', 'quito'].sort(() => rand() - 0.5).slice(0, 5);

  constructor(private hack: Hack) {
    const s = shell('trace', '⚠ SENTINEL TRACE');
    this.el = s.el;
    s.body.innerHTML = `<div class="tbig"></div><div class="tbar"><i></i></div><div class="thops"></div>`;
    this.big = s.body.querySelector('.tbig')!;
    this.bar = s.body.querySelector('.tbar i')!;
    this.hops = s.body.querySelector('.thops')!;
  }

  update() {
    const lv = this.hack.trace;
    this.big.textContent = `${lv.toFixed(1).padStart(5)}%`;
    this.bar.style.width = `${lv}%`;
    // 追跡レベルに応じて、経由地が一つずつ暴かれていく
    const shown = Math.ceil((lv / 100) * this.route.length);
    this.hops.innerHTML = this.route.map((r, i) => `<span class="${i < shown ? 'hit' : ''}">${i < shown ? r.toUpperCase() + '-RELAY' : '?????'}</span>`).join(' ▸ ') + ` ▸ <span class="${lv > 90 ? 'hit' : ''}">YOU</span>`;
  }
}

const FACTORY: Record<PanelId, (h: Hack) => Panel> = {
  mesh: (h) => new MeshPanel(h),
  glyph: (h) => new GlyphPanel(h),
  decrypt: (h) => new DecryptPanel(h),
  monitor: (h) => new MonitorPanel(h),
  trace: (h) => new TracePanel(h),
};

/** 状況に応じたパネル構成。表示は上から順 */
export function layoutFor(h: Hack): PanelId[] {
  if (h.phase === 'trace') return ['trace', 'mesh', 'monitor'];
  return ({ scan: ['mesh', 'monitor'], sync: ['mesh', 'monitor', 'glyph'], ice: ['mesh', 'glyph'], core: ['monitor', 'mesh', 'glyph'], cipher: ['decrypt', 'glyph', 'mesh'] } as Record<string, PanelId[]>)[h.stage.id];
}

export class Panels {
  private live = new Map<PanelId, Panel>();
  private key = '';
  /** パネルが消える時、その矩形を通知する（デジタルレインに崩すため） */
  onDissolve: (r: DOMRect) => void = () => {};

  constructor(
    private root: HTMLElement,
    private hack: Hack,
  ) {}

  set(ids: PanelId[]) {
    const k = ids.join(',');
    if (k === this.key) return;
    this.key = k;
    for (const [id, p] of this.live) {
      if (ids.includes(id)) continue;
      this.live.delete(id);
      if (p.el.offsetParent) this.onDissolve(p.el.getBoundingClientRect());
      p.el.classList.add('dissolve');
      p.el.addEventListener('animationend', () => p.el.remove(), { once: true });
    }
    ids.forEach((id, i) => {
      let p = this.live.get(id);
      if (!p) {
        p = FACTORY[id](this.hack);
        p.el.classList.add('materialize');
        p.el.style.animationDelay = `${120 + i * 140}ms`;
        this.live.set(id, p);
      }
      p.el.style.order = String(i);
      if (p.el.parentElement !== this.root) this.root.appendChild(p.el);
    });
  }

  update(now: number, dt: number) {
    // サイドが非表示（狭い画面）の時は描画を省く
    if (!this.root.offsetParent) return;
    syncColors();
    for (const p of this.live.values()) p.update(now, dt);
  }
}
