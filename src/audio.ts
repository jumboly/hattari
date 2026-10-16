// Web Audio による効果音合成。素材ファイルを持たずに「映画っぽい電子音」を作るため全てオシレータとノイズで組む。
// 自動再生制限のため AudioContext は最初のユーザー操作で生成し、それまでは全メソッドが無音で no-op になる。

// 連打しても不協和にならないよう、キー音はペンタトニックに量子化する
const PENTA = [0, 3, 5, 7, 10, 12, 15, 17, 19, 22, 24];

export class Sfx {
  private ctx?: AudioContext;
  private master!: GainNode;
  private bus!: GainNode; // ダッキング用（静寂演出）
  private verb!: ConvolverNode;
  private noise!: AudioBuffer;
  private lastTick = 0;
  private recentVoices: number[] = [];
  muted = false;

  get unlocked() {
    return !!this.ctx && this.ctx.state === 'running';
  }

  /** ユーザー操作のイベントハンドラ内で呼ぶこと */
  unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    try {
      const ctx = new AudioContext();
      this.ctx = ctx;
      // 音が重なっても割れたりうるさくなりすぎないよう、最終段にコンプレッサーを置く
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -18;
      comp.ratio.value = 6;
      comp.attack.value = 0.003;
      comp.release.value = 0.2;
      this.master = ctx.createGain();
      this.master.gain.value = 0.8;
      this.bus = ctx.createGain();
      this.bus.connect(comp).connect(this.master).connect(ctx.destination);

      this.noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const d = this.noise.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;

      this.verb = ctx.createConvolver();
      const len = ctx.sampleRate * 2.6;
      const ir = ctx.createBuffer(2, len, ctx.sampleRate);
      for (let c = 0; c < 2; c++) {
        const ch = ir.getChannelData(c);
        for (let i = 0; i < len; i++) ch[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
      }
      this.verb.buffer = ir;
      const verbGain = ctx.createGain();
      verbGain.gain.value = 0.35;
      this.verb.connect(verbGain).connect(this.bus);
    } catch {
      this.ctx = undefined;
    }
  }

  setMuted(m: boolean) {
    this.muted = m;
    if (this.ctx) this.master.gain.setTargetAtTime(m ? 0 : 0.8, this.ctx.currentTime, 0.05);
  }

  // 同時発音数を抑えて、連打時のノイズの洪水を防ぐ
  private budget(max = 14): boolean {
    if (!this.ctx || this.muted) return false;
    const now = performance.now();
    this.recentVoices = this.recentVoices.filter((t) => now - t < 80);
    if (this.recentVoices.length >= max) return false;
    this.recentVoices.push(now);
    return true;
  }

  private env(g: GainNode, t: number, peak: number, a: number, d: number) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
  }

  private osc(type: OscillatorType, f0: number, f1: number, dur: number, peak: number, opts: { at?: number; verb?: number; a?: number; filter?: number } = {}) {
    const ctx = this.ctx!;
    const t = ctx.currentTime + (opts.at ?? 0);
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = ctx.createGain();
    this.env(g, t, peak, opts.a ?? 0.002, dur);
    let node: AudioNode = o;
    if (opts.filter) {
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = opts.filter;
      node = o.connect(f);
    }
    node.connect(g).connect(this.bus);
    if (opts.verb) {
      const s = ctx.createGain();
      s.gain.value = opts.verb;
      g.connect(s).connect(this.verb);
    }
    o.start(t);
    o.stop(t + (opts.a ?? 0.002) + dur + 0.05);
  }

  private burst(dur: number, peak: number, type: BiquadFilterType, freq: number, opts: { at?: number; q?: number; sweepTo?: number; verb?: number } = {}) {
    const ctx = this.ctx!;
    const t = ctx.currentTime + (opts.at ?? 0);
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(freq, t);
    if (opts.sweepTo) f.frequency.exponentialRampToValueAtTime(opts.sweepTo, t + dur);
    f.Q.value = opts.q ?? 1;
    const g = ctx.createGain();
    this.env(g, t, peak, 0.002, dur);
    src.connect(f).connect(g).connect(this.bus);
    if (opts.verb) {
      const s = ctx.createGain();
      s.gain.value = opts.verb;
      g.connect(s).connect(this.verb);
    }
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.05);
  }

  /** キー入力：機械的なクリック + 音程のある電子ブリップ。勢いが増すほど音程が上がる */
  key(intensity: number) {
    if (!this.budget()) return;
    this.burst(0.018, 0.12, 'bandpass', 2500 + Math.random() * 2500, { q: 3 });
    const step = PENTA[Math.min(PENTA.length - 1, Math.floor(Math.random() * 5 + intensity * 6))];
    const f = 660 * Math.pow(2, step / 12);
    this.osc('square', f, f, 0.035, 0.035, { filter: 3500 });
  }

  backspace() {
    if (!this.budget()) return;
    this.osc('square', 440, 220, 0.05, 0.04, { filter: 2000 });
  }

  /** Enter：鋭い下降スイープ + 低音のドン */
  enter() {
    if (!this.budget(20)) return;
    this.osc('sawtooth', 1800, 90, 0.18, 0.12, { filter: 4000, verb: 0.3 });
    this.osc('sine', 120, 40, 0.25, 0.5);
    this.burst(0.08, 0.2, 'highpass', 3000);
  }

  /** ログ行：細かい電子音。間引かないとうるさいので最短間隔を設ける */
  tick(cls: string) {
    if (!this.ctx || this.muted) return;
    const now = performance.now();
    if (now - this.lastTick < 45) return;
    this.lastTick = now;
    const base = cls === 'dim' ? 2600 : 1800;
    this.osc('sine', base + Math.random() * 800, base, 0.02, 0.025);
  }

  ok() {
    if (!this.budget()) return;
    this.osc('triangle', 1318, 1318, 0.07, 0.08, { verb: 0.2 });
    this.osc('triangle', 1976, 1976, 0.12, 0.07, { at: 0.07, verb: 0.3 });
  }

  warn() {
    if (!this.budget()) return;
    for (let i = 0; i < 3; i++) {
      this.osc('sawtooth', i % 2 ? 620 : 470, i % 2 ? 620 : 470, 0.11, 0.07, { at: i * 0.13, filter: 2500 });
    }
  }

  /** 追跡アラーム：二音のサイレン */
  alarm(level = 1) {
    if (!this.ctx || this.muted) return;
    for (let i = 0; i < 2; i++) {
      this.osc('sawtooth', 700, 1050, 0.22, 0.09 * level, { at: i * 0.26, filter: 3000, verb: 0.2 });
    }
    this.osc('sine', 60, 40, 0.3, 0.3 * level);
  }

  /** 対抗措置：鋭いザップ。追跡が迫るほど音程が下がって緊迫感を出す */
  counter(danger: number) {
    if (!this.budget()) return;
    const f = 2400 - danger * 1400 + Math.random() * 400;
    this.osc('square', f, f / 3, 0.05, 0.04, { filter: 5000 });
    this.burst(0.02, 0.06, 'highpass', 5000);
  }

  /** 進捗バー中の連続電子音（解析中の雰囲気） */
  scanBlip(p: number) {
    if (!this.budget()) return;
    this.osc('sine', 900 + p * 1400, 900 + p * 1400, 0.03, 0.03);
  }

  /** ステージ突破：上昇アルペジオ */
  stageClear() {
    if (!this.ctx || this.muted) return;
    const notes = [0, 7, 12, 19, 24];
    notes.forEach((n, i) => this.osc('square', 440 * Math.pow(2, n / 12), 440 * Math.pow(2, n / 12), 0.12, 0.05, { at: i * 0.055, filter: 5000, verb: 0.4 }));
    this.osc('sine', 80, 50, 0.4, 0.4);
  }

  /** 静寂：全体をダッキングし、かすかな上昇ノイズだけ残して緊張を作る */
  hush(ms: number) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    this.bus.gain.cancelScheduledValues(t);
    this.bus.gain.setTargetAtTime(0.0001, t, 0.03);
    this.bus.gain.setTargetAtTime(1, t + ms / 1000, 0.005);
    // 直接 destination に流して、ダッキング中でも聞こえるようにする
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const f = this.ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.Q.value = 12;
    f.frequency.setValueAtTime(300, t);
    f.frequency.exponentialRampToValueAtTime(6000, t + ms / 1000);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.06, t + ms / 1000);
    g.gain.setValueAtTime(0.0001, t + ms / 1000 + 0.01);
    src.connect(f).connect(g).connect(this.master);
    src.start(t);
    src.stop(t + ms / 1000 + 0.05);
  }

  /** 成功：重低音のインパクト + 開いていく和音パッド */
  boom() {
    if (!this.ctx || this.muted) return;
    this.osc('sine', 90, 28, 1.6, 0.9, { a: 0.005 });
    this.burst(1.2, 0.5, 'lowpass', 3000, { sweepTo: 80, verb: 0.8 });
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(200, t);
    f.frequency.exponentialRampToValueAtTime(3200, t + 1.2);
    f.frequency.exponentialRampToValueAtTime(400, t + 4);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.12, t + 0.15);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 4.2);
    f.connect(g);
    g.connect(this.bus);
    const s = ctx.createGain();
    s.gain.value = 0.7;
    g.connect(s).connect(this.verb);
    for (const hz of [55, 110, 164.8, 220, 261.6, 329.6]) {
      for (const det of [-7, 7]) {
        const o = ctx.createOscillator();
        o.type = 'sawtooth';
        o.frequency.value = hz;
        o.detune.value = det;
        o.connect(f);
        o.start(t);
        o.stop(t + 4.3);
      }
    }
  }

  /** 画面グリッチに合わせたデジタルノイズ */
  glitch() {
    if (!this.budget()) return;
    for (let i = 0; i < 5; i++) this.osc('square', 80 + Math.random() * 2000, 60 + Math.random() * 300, 0.04, 0.05, { at: i * 0.03 });
    this.burst(0.15, 0.12, 'bandpass', 1500, { q: 8, sweepTo: 6000 });
  }

  /** 文字が崩れ落ちるときの下降グリッチ */
  crumble() {
    if (!this.ctx || this.muted) return;
    for (let i = 0; i < 6; i++) {
      this.osc('square', 1200 - i * 150, 100, 0.25, 0.03, { at: i * 0.07, filter: 3000 });
    }
    this.burst(1.0, 0.08, 'bandpass', 4000, { sweepTo: 200, q: 4 });
  }
}

export const sfx = new Sfx();
