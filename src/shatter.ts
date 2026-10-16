// 画面全体の「分解」と「再構築」。
// ターミナルに見えている文字を 1 文字ずつ Canvas 上の粒子に置き換えて崩し落とし、DOM 本体は隠す。
// 再構築時は DOM を戻し、見えている行をランダムな記号から元の文字へ収束させる。
import { theme } from './theme';

interface Bit {
  x: number;
  y: number;
  ch: string;
  color: string;
  delay: number; // ms。剥がれ始めるまでの時間
  vy: number;
  vx: number;
  life: number;
}

const KANA = 'ｦｱｳｴｵｶｷｹｺｻｼｽｾｿﾀﾂﾃﾅﾆﾇﾈﾊﾋﾎﾏﾐﾑﾒﾓﾔﾕﾗﾘﾜ0123456789';
const kana = () => KANA[Math.floor(Math.random() * KANA.length)];
// 粒子数の上限。大画面でも 1 フレームの描画量を抑えるため
const MAX_BITS = 4500;

export class Shatter {
  private ctx: CanvasRenderingContext2D;
  private bits: Bit[] = [];
  private t = 0;
  private font = '';
  active = false;
  /** 崩れた文字が画面下に消える位置を通知する（デジタルレインに引き継ぐため） */
  onLand: (x: number, y: number) => void = () => {};

  constructor(
    private canvas: HTMLCanvasElement,
    private term: HTMLElement,
  ) {
    this.ctx = canvas.getContext('2d')!;
  }

  private fit() {
    const dpr = Math.min(1.5, devicePixelRatio || 1);
    this.canvas.width = Math.floor(innerWidth * dpr);
    this.canvas.height = Math.floor(innerHeight * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  /** ターミナルの見えている文字を粒子化して崩し始める */
  collapse() {
    this.fit();
    const box = this.term.getBoundingClientRect();
    const cs = getComputedStyle(this.term);
    this.font = `${cs.fontSize} ${cs.fontFamily}`;
    this.ctx.font = this.font;
    const cw = this.ctx.measureText('M').width;
    const lh = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.5;
    const bits: Bit[] = [];
    // 行単位で拾う。コードブロックは pre の中の改行ごとに行とみなす
    const rows: { el: Element; text: string; left: number; top: number }[] = [];
    for (const el of this.term.querySelectorAll('.ln, .codebox pre, .codehead')) {
      const r = el.getBoundingClientRect();
      if (r.bottom < box.top + box.height * 0.2 || r.top > box.bottom) continue;
      const text = (el as HTMLElement).innerText ?? '';
      text.split('\n').forEach((line, i) => rows.push({ el, text: line, left: r.left, top: r.top + i * lh }));
    }
    for (const row of rows) {
      const color = getComputedStyle(row.el).color;
      for (let i = 0; i < row.text.length; i++) {
        const ch = row.text[i];
        if (ch === ' ' || ch === ' ') continue;
        const x = row.left + i * cw;
        if (x > box.right) break;
        bits.push({
          x,
          y: row.top,
          ch,
          color,
          // 下の行ほど、また列ごとにばらばらに剥がれ始めることで「崩落」に見せる
          delay: Math.random() * 500 + (1 - (row.top - box.top) / box.height) * 350 + (Math.sin(x * 0.05) + 1) * 120,
          vy: 0,
          vx: (Math.random() - 0.5) * 0.04,
          life: 1,
        });
      }
    }
    if (bits.length > MAX_BITS) bits.sort(() => Math.random() - 0.5).length = MAX_BITS;
    this.bits = bits;
    this.t = 0;
    this.active = bits.length > 0;
    document.body.classList.add('shattered');
  }

  /** 雨の中から画面を組み上げ直す */
  rebuild() {
    document.body.classList.remove('shattered');
    this.term.classList.remove('rebuild');
    void this.term.offsetWidth;
    this.term.classList.add('rebuild');
    // テキストだけの行は記号から元の文字へ収束させる（色付き span を含む行は崩さない）
    const lines = [...this.term.querySelectorAll<HTMLElement>('.ln:not(.prompt)')].slice(-40);
    lines.forEach((el, n) => {
      const orig = el.textContent ?? '';
      if (!orig.trim()) return;
      const start = performance.now() + n * 12;
      const dur = 450 + Math.random() * 300;
      const step = () => {
        const p = Math.min(1, (performance.now() - start) / dur);
        if (p < 0) return void requestAnimationFrame(step);
        const fixed = Math.floor(orig.length * p);
        el.textContent = orig.slice(0, fixed) + [...orig.slice(fixed)].map((c) => (c === ' ' ? c : kana())).join('');
        if (p < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    });
  }

  update(dt: number) {
    if (!this.active) return;
    this.t += dt;
    const H = innerHeight;
    let alive = 0;
    for (const b of this.bits) {
      if (b.life <= 0) continue;
      alive++;
      if (this.t < b.delay) continue;
      // 重力で加速しながら落ち、途中でカナに化けていく
      b.vy += 0.0016 * dt;
      b.y += b.vy * dt;
      b.x += b.vx * dt;
      if (Math.random() < 0.06) b.ch = kana();
      if (b.y > H * 0.75) b.life -= dt / 500;
      if (b.y > H) {
        b.life = 0;
        if (Math.random() < 0.08) this.onLand(b.x, Math.random() * H * 0.3);
      }
    }
    if (!alive) this.active = false;
  }

  draw() {
    const { ctx } = this;
    ctx.clearRect(0, 0, innerWidth, innerHeight);
    if (!this.active) return;
    ctx.font = this.font;
    ctx.textBaseline = 'top';
    const rain = theme.rain.body;
    for (const b of this.bits) {
      if (b.life <= 0) continue;
      const falling = this.t >= b.delay;
      ctx.globalAlpha = Math.max(0, b.life);
      // 剥がれた瞬間に白く光らせ、落ちるにつれて雨の色に溶かす
      ctx.fillStyle = !falling ? b.color : this.t - b.delay < 90 ? '#ffffff' : rain;
      ctx.fillText(b.ch, b.x, b.y);
    }
    ctx.globalAlpha = 1;
  }
}
