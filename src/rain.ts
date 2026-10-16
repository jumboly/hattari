// デジタルレイン。背景ではなく「演出に反応する楽器」として、外部から加速・停止・噴出を指示できるようにする。
// 毎フレーム全消去して描き直す方式にしているのは、残像を半透明塗りで作る方式だと「完全停止」した瞬間の静止画が作れないため。

const GLYPHS = 'ｦｱｳｴｵｶｷｹｺｻｼｽｾｿﾀﾂﾃﾅﾆﾇﾈﾊﾋﾎﾏﾐﾑﾒﾓﾔﾕﾗﾘﾜ0123456789Z:."=*+-<>¦╌';
const MAX_EXTRA = 220;

interface Drop {
  col: number;
  y: number; // セル単位
  speed: number; // セル/秒
  len: number;
  bright: number; // 0..1 先頭付近の明るさブースト
  extra: boolean;
}

export class Rain {
  private ctx: CanvasRenderingContext2D;
  private cell = 18;
  private cols = 0;
  private rows = 0;
  private dpr = 1;
  private grid: Uint8Array = new Uint8Array(0);
  private drops: Drop[] = [];
  private extras: Drop[] = [];
  /** 実際に適用される速度倍率。target に向かって滑らかに追従する */
  private speed = 1;
  private surgeAmt = 0;
  speedTarget = 1;
  /** 全体の明るさ。ターミナルの可読性を保つため普段は控えめ */
  alpha = 0.55;
  alphaTarget = 0.55;
  frozen = false;

  constructor(private canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d')!;
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  resize() {
    // 高 DPR で全画面描画すると重くなるので上限を設ける
    this.dpr = Math.min(1.5, window.devicePixelRatio || 1);
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.canvas.width = Math.floor(w * this.dpr);
    this.canvas.height = Math.floor(h * this.dpr);
    this.cell = w < 700 ? 14 : 18;
    const cols = Math.ceil(w / this.cell);
    this.rows = Math.ceil(h / this.cell) + 1;
    this.grid = new Uint8Array(cols * this.rows).map(() => Math.floor(Math.random() * GLYPHS.length));
    if (cols !== this.cols) {
      this.cols = cols;
      this.drops = Array.from({ length: cols }, (_, c) => this.fresh(c, Math.random() * this.rows * 1.6 - this.rows * 0.6));
      this.extras = [];
    }
  }

  private fresh(col: number, y: number): Drop {
    return { col, y, speed: 7 + Math.random() * 16, len: 10 + Math.floor(Math.random() * 30), bright: 0, extra: false };
  }

  /** 打鍵：ランダムな列に明るい雫を落とす */
  kick(n = 1) {
    for (let i = 0; i < n; i++) {
      if (this.extras.length >= MAX_EXTRA) this.extras.shift();
      const col = Math.floor(Math.random() * this.cols);
      this.extras.push({ col, y: Math.random() * this.rows * 0.3, speed: 20 + Math.random() * 25, len: 6 + Math.floor(Math.random() * 10), bright: 1, extra: true });
    }
  }

  /** 実行：一時的に雨全体を加速させる */
  surge(amt = 2.5) {
    this.surgeAmt = Math.max(this.surgeAmt, amt);
  }

  /** 画面上の任意の位置から雫を生やす（崩れ落ちる文字を雨に変えるため） */
  spawnAt(px: number, py: number) {
    if (this.extras.length >= MAX_EXTRA) this.extras.shift();
    const col = Math.max(0, Math.min(this.cols - 1, Math.floor(px / this.cell)));
    this.extras.push({ col, y: py / this.cell, speed: 14 + Math.random() * 18, len: 10 + Math.floor(Math.random() * 18), bright: 1, extra: true });
  }

  /** 全列を最上部から一斉に落とし直す（成功時の「雨の壁」） */
  wave() {
    for (const d of this.drops) {
      d.y = -Math.random() * 6;
      d.speed = 22 + Math.random() * 18;
      d.len = 18 + Math.floor(Math.random() * 30);
      d.bright = 1;
    }
  }

  update(dt: number) {
    const s = dt / 1000;
    const target = this.frozen ? 0 : this.speedTarget + this.surgeAmt;
    // 停止は一瞬で、再始動は滑らかに。静寂の「ピタッ」と止まる感じを出すため
    const k = this.frozen ? 0.5 : 0.08;
    this.speed += (target - this.speed) * Math.min(1, k * (dt / 16.7));
    this.surgeAmt *= Math.pow(0.25, s);
    this.alpha += (this.alphaTarget - this.alpha) * Math.min(1, 0.05 * (dt / 16.7));
    if (this.speed < 0.01) return;

    const mv = this.speed * s;
    for (const d of this.drops) {
      d.y += d.speed * mv;
      d.bright *= Math.pow(0.4, s);
      if (d.y - d.len > this.rows) Object.assign(d, this.fresh(d.col, -Math.random() * 12));
    }
    for (const d of this.extras) d.y += d.speed * mv;
    this.extras = this.extras.filter((d) => d.y - d.len <= this.rows);
    // 文字が時々入れ替わることで「流れているデータ」に見せる
    const muts = Math.floor(this.grid.length * 0.01 * this.speed);
    for (let i = 0; i < muts; i++) this.grid[Math.floor(Math.random() * this.grid.length)] = Math.floor(Math.random() * GLYPHS.length);
  }

  draw() {
    const { ctx, cell, dpr } = this;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.font = `${cell - 3}px "MS Gothic", "Osaka-Mono", monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    const heads: Drop[] = [];
    ctx.fillStyle = '#2bff6e';
    for (const list of [this.drops, this.extras]) {
      for (const d of list) {
        const head = Math.floor(d.y);
        if (head - d.len > this.rows || head < 0) continue;
        const x = d.col * cell + cell / 2;
        for (let i = 1; i < d.len; i++) {
          const r = head - i;
          if (r < 0) break;
          if (r >= this.rows) continue;
          const f = 1 - i / d.len;
          ctx.globalAlpha = this.alpha * f * f * (0.8 + d.bright * 0.6);
          ctx.fillText(GLYPHS[this.grid[d.col * this.rows + r]], x, r * cell);
        }
        if (head < this.rows) heads.push(d);
      }
    }
    // 先頭文字だけ白く光らせる。shadowBlur は高価なので先頭のみに限定する
    ctx.fillStyle = '#e6fff0';
    ctx.shadowColor = '#3dff7f';
    ctx.shadowBlur = 10;
    for (const d of heads) {
      const r = Math.floor(d.y);
      ctx.globalAlpha = Math.min(1, this.alpha * (1.3 + d.bright));
      ctx.fillText(GLYPHS[this.grid[d.col * this.rows + r]], d.col * cell + cell / 2, r * cell);
    }
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1;
  }

  get extraCount() {
    return this.extras.length;
  }
}
