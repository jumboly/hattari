// Web Audio による効果音合成。素材ファイルを持たずに済むよう全てオシレータとノイズで組む。
// ゲーム的に聞こえないよう、音階のある電子音は控えめにし、実機の打鍵音・機械音・映画的なインパクトを中心にしている。
// 自動再生制限のため AudioContext は最初のユーザー操作で生成し、それまでは全メソッドが無音で no-op になる。

export type Profile = 'matrix' | 'retro' | 'hollywood' | 'cyberpunk';

export class Sfx {
  private ctx?: BaseAudioContext;
  private master!: GainNode;
  private bus!: GainNode; // ダッキング用（静寂演出）
  private verb!: ConvolverNode;
  private noise!: AudioBuffer;
  private lastTick = 0;
  private recentVoices: number[] = [];
  muted = false;
  /** テーマごとの音の性格。見た目のテーマと同じ id を使う */
  profile: Profile = 'matrix';
  private ambientOn = false;
  private ambientOut?: GainNode;
  private ambientSrc: AudioScheduledSourceNode[] = [];

  get unlocked() {
    return !!this.ctx && this.ctx.state === 'running';
  }

  /** ユーザー操作のイベントハンドラ内で呼ぶこと */
  unlock() {
    if (this.ctx) {
      if (this.ctx instanceof AudioContext && this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    try {
      this.attach(new AudioContext());
    } catch {
      this.ctx = undefined;
    }
  }

  /** 任意のコンテキストに音響グラフを組む。OfflineAudioContext を渡せば音量の計測にも使える */
  attach(ctx: BaseAudioContext, ambient = true) {
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
    this.ambientOn = ambient;
    if (ambient) this.startAmbient();
  }

  /** テーマ切替。環境音はクロスフェードで差し替える */
  setProfile(p: Profile) {
    if (p === this.profile) return;
    this.profile = p;
    if (!this.ctx || !this.ambientOn) return;
    const t = this.ctx.currentTime;
    this.ambientOut?.gain.setTargetAtTime(0.0001, t, 0.4);
    for (const n of this.ambientSrc) n.stop(t + 2);
    this.startAmbient();
  }

  private loopSrc(out: AudioNode, make: (ctx: BaseAudioContext) => AudioScheduledSourceNode) {
    const n = make(this.ctx!);
    n.connect(out);
    n.start();
    this.ambientSrc.push(n);
    return n;
  }

  private tone(out: AudioNode, f: number, a: number, type: OscillatorType = 'sine') {
    const ctx = this.ctx!;
    const g = ctx.createGain();
    g.gain.value = a;
    g.connect(out);
    this.loopSrc(g, () => {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.value = f;
      return o;
    });
  }

  private noiseBed(out: AudioNode, type: BiquadFilterType, freq: number, a: number, q = 1) {
    const ctx = this.ctx!;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.value = a;
    f.connect(g).connect(out);
    this.loopSrc(f, () => {
      const src = ctx.createBufferSource();
      src.buffer = this.noise;
      src.loop = true;
      return src;
    });
    return f;
  }

  /** テーマごとの環境音。どれもごく小さく鳴らし、静寂演出（hush）ではバスごと消えて落差を作る */
  private startAmbient() {
    const ctx = this.ctx!;
    this.ambientSrc = [];
    const g = ctx.createGain();
    g.gain.value = 0.0001;
    g.gain.exponentialRampToValueAtTime(1, ctx.currentTime + 3);
    g.connect(this.bus);
    this.ambientOut = g;
    switch (this.profile) {
      case 'retro': {
        // ブラウン管の高周波（水平偏向）のキーンと、古い電源トランスの唸り
        this.tone(g, 15734, 0.004);
        this.tone(g, 50, 0.012);
        this.tone(g, 100, 0.008);
        this.noiseBed(g, 'lowpass', 300, 0.012);
        break;
      }
      case 'cyberpunk': {
        // 窓の外の雨と、ネオン管のジーという唸り
        this.noiseBed(g, 'bandpass', 3500, 0.03, 0.6);
        this.noiseBed(g, 'lowpass', 400, 0.02);
        const buzz = ctx.createBiquadFilter();
        buzz.type = 'lowpass';
        buzz.frequency.value = 900;
        buzz.connect(g);
        this.tone(buzz, 120, 0.006, 'sawtooth');
        break;
      }
      default: {
        // サーバールーム：電源のハム（60Hz とその倍音）と空調ファンの風切り
        for (const [f, a] of [[60, 0.012], [120, 0.006], [180, 0.002]] as const) this.tone(g, f, a);
        const fan = this.noiseBed(g, 'lowpass', 500, 0.02);
        // ファンの回転ムラを模して、風切りの帯域をゆっくり揺らす
        const lfoGain = ctx.createGain();
        lfoGain.gain.value = 120;
        lfoGain.connect(fan.frequency);
        this.loopSrc(lfoGain, () => {
          const o = ctx.createOscillator();
          o.frequency.value = 0.11;
          return o;
        });
      }
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

  private burst(dur: number, peak: number, type: BiquadFilterType, freq: number, opts: { at?: number; q?: number; sweepTo?: number; verb?: number; a?: number } = {}) {
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
    const a = opts.a ?? 0.002;
    this.env(g, t, peak, a, dur);
    src.connect(f).connect(g).connect(this.bus);
    if (opts.verb) {
      const s = ctx.createGain();
      s.gain.value = opts.verb;
      g.connect(s).connect(this.verb);
    }
    src.start(t, Math.random() * 0.5);
    src.stop(t + a + dur + 0.05);
  }

  /**
   * 実機のメカニカルキーボードを模した打鍵音。電子音の音程を持たせるとゲームっぽくなるため、
   * 「接点のカチッ」「キーキャップの樹脂の鳴り」「底打ちのコトッ」の 3 層をノイズだけで作り、毎回少しずつばらつかせる
   */
  private keyClick(v: number, body: number, thock: number) {
    const r = Math.random;
    this.burst(0.006, 0.5 * v, 'highpass', 3500 + r() * 2500, { a: 0.0005 });
    this.burst(0.018, 0.35 * v, 'bandpass', body * (0.8 + r() * 0.4), { q: 6, at: 0.004, a: 0.0008 });
    this.burst(0.03, 0.4 * v * thock, 'lowpass', 450 + r() * 200, { at: 0.008, a: 0.001 });
  }

  /**
   * キー入力。実機ではキーの位置ごとに筐体の響き方が違うので、文字から決まった共振の高さを割り当てる
   * （同じキーは毎回ほぼ同じ音、違うキーは少し違う音になる）。強く速く叩いているほど少しだけ強いタッチになる
   */
  key(intensity: number, key = '') {
    if (!this.budget()) return;
    const v = (0.8 + Math.random() * 0.3) * (0.9 + intensity * 0.2);
    if (key === ' ') {
      this.spaceBar(v);
      return;
    }
    const code = key ? key.toLowerCase().charCodeAt(0) : Math.floor(Math.random() * 64);
    // 数字・記号の段は手前の文字キーより少し高く乾いた音にする
    const row = /[0-9\-=`]/.test(key) ? 1.25 : 1;
    const body = (1300 + ((code * 37) % 11) * 90) * row * (0.97 + Math.random() * 0.06);
    switch (this.profile) {
      case 'retro':
        // バネ式（バックリングスプリング）キーボード：大きなカシャンと、バネの金属的なキーン
        this.keyClick(v * 1.15, body * 0.9, 1.3);
        this.burst(0.07, 0.07 * v, 'bandpass', 3000 + ((code * 53) % 7) * 120, { q: 30, at: 0.006, a: 0.001 });
        break;
      case 'cyberpunk':
        // 薄型キーボード：浅く低いコトコト + ごく小さな電気のパチッ
        this.keyClick(v * 0.8, body * 0.75, 1.4);
        this.burst(0.006, 0.08 * v, 'bandpass', 7000, { q: 3, at: 0.01, a: 0.0005 });
        break;
      case 'hollywood':
        // 映画の端末は打鍵ごとに小さく電子音が鳴る（音階には乗せず、キーで決まった高さ）
        this.keyClick(v * 0.9, body, 1);
        this.osc('sine', 2200 + ((code * 29) % 9) * 110, 2200 + ((code * 29) % 9) * 110, 0.022, 0.035, { at: 0.004 });
        break;
      default:
        this.keyClick(v, body, 1);
    }
  }

  /** スペースバー：長いキー特有の低い胴鳴りと、スタビライザーのカタつき */
  private spaceBar(v: number) {
    this.burst(0.008, 0.4 * v, 'highpass', 3000, { a: 0.0005 });
    this.burst(0.03, 0.4 * v, 'bandpass', 650, { q: 4, at: 0.004, a: 0.001 });
    this.burst(0.05, 0.55 * v, 'lowpass', 380, { at: 0.009, a: 0.001 });
    this.burst(0.012, 0.15 * v, 'bandpass', 2600, { q: 8, at: 0.028, a: 0.0008 });
  }

  backspace() {
    if (!this.budget()) return;
    this.keyClick(0.9, 1000, 1);
  }

  /** Enter：大きめのキーを強く叩いた音 + 低いドンと空気の抜ける音で「実行した」重みを出す */
  enter() {
    if (!this.budget(20)) return;
    this.keyClick(1.2, 800, 1.6);
    this.osc('sine', 70, 38, 0.3, 0.4, { at: 0.01 });
    this.burst(0.2, 0.12, 'bandpass', 6000, { q: 1.5, sweepTo: 700, at: 0.02, verb: 0.25 });
  }

  /** ログ行：リレーやディスクの細かい作動音。間引かないとうるさいので最短間隔を設ける */
  tick(cls: string) {
    if (!this.ctx || this.muted) return;
    const now = performance.now();
    if (now - this.lastTick < 45) return;
    this.lastTick = now;
    const lv = cls === 'dim' ? 0.6 : 1;
    switch (this.profile) {
      case 'retro':
        // ドットプリンタのヘッドが走る「ジジッ」
        for (let i = 0; i < 4; i++) this.burst(0.004, 0.36 * lv, 'bandpass', 1400 + Math.random() * 300, { q: 6, at: i * 0.011, a: 0.0005 });
        break;
      case 'hollywood':
        this.osc('sine', 1900 + Math.random() * 900, 1900 + Math.random() * 900, 0.016, 0.06 * lv);
        break;
      case 'cyberpunk':
        this.burst(0.012, 0.36 * lv, 'bandpass', 4000 + Math.random() * 3000, { q: 5, sweepTo: 1500, a: 0.0005 });
        break;
      default:
        this.burst(0.004, 0.16 * lv, 'highpass', 5000 + Math.random() * 3000, { a: 0.0005 });
        this.burst(0.008, 0.08, 'bandpass', 2000 + Math.random() * 1500, { q: 10, a: 0.0005 });
    }
  }

  /** 成功行：映画の端末 UI のような控えめな単発の確認音 */
  ok() {
    if (!this.budget()) return;
    switch (this.profile) {
      case 'retro':
        // PC 内蔵スピーカーの短いビープ。安っぽい紙コーンの帯域に絞る
        this.osc('square', 880, 880, 0.07, 0.09, { filter: 2500 });
        break;
      case 'hollywood':
        // 映画のコンピュータの定番、二音の確認音
        this.osc('sine', 1175, 1175, 0.06, 0.08, { verb: 0.2 });
        this.osc('sine', 1760, 1760, 0.1, 0.08, { at: 0.065, verb: 0.25 });
        break;
      case 'cyberpunk':
        this.osc('sine', 900, 1800, 0.12, 0.08, { verb: 0.4 });
        break;
      default:
        this.osc('sine', 1568, 1568, 0.09, 0.1, { verb: 0.25 });
        this.osc('sine', 3136, 3136, 0.05, 0.025);
    }
  }

  /** 警告行：低いシンセの二連パルス */
  warn() {
    if (!this.budget()) return;
    for (let i = 0; i < 2; i++) {
      this.osc('sawtooth', 98, 96, 0.14, 0.07, { at: i * 0.17, filter: 700 });
      this.osc('sawtooth', 98.6, 96.6, 0.14, 0.07, { at: i * 0.17, filter: 700 });
    }
  }

  /** 追跡アラーム：施設の警報のような低い「ブワーン」。音程差は 5 度にして不快すぎないようにする */
  alarm(level = 1) {
    if (!this.ctx || this.muted) return;
    for (let i = 0; i < 2; i++) {
      for (const hz of [150, 225]) this.osc('sawtooth', hz, hz * 0.97, 0.32, 0.16 * level, { at: i * 0.42, filter: 1400, verb: 0.15, a: 0.02 });
    }
    this.osc('sine', 50, 40, 0.4, 0.4 * level);
  }

  /** 対抗措置：電気がはじけるような短い放電音。追跡が迫るほど低く鈍くなる */
  counter(danger: number) {
    if (!this.budget()) return;
    this.burst(0.05, 0.6, 'bandpass', 5000 + Math.random() * 2000, { q: 4, sweepTo: 900 - danger * 500, a: 0.0008 });
    this.burst(0.004, 0.45, 'highpass', 6000, { a: 0.0005 });
  }

  /** 解析中の読み取り音：ごく短く柔らかいサイン波を音階に乗せずランダムな高さで鳴らす */
  scanBlip(p: number) {
    if (!this.budget()) return;
    const f = 1800 + Math.random() * 1400 + p * 400;
    this.osc('sine', f, f, 0.018, 0.06);
  }

  /** ステージ突破：吸い込む風切り音 → 重い着地音 → 遠くで響く高音 */
  stageClear() {
    if (!this.ctx || this.muted) return;
    if (this.profile === 'retro') return this.modem();
    if (this.profile === 'hollywood') return this.braam();
    if (this.profile === 'cyberpunk') return this.synthRise();
    this.burst(0.05, 0.18, 'bandpass', 400, { q: 2, sweepTo: 5000, a: 0.32 });
    this.osc('sine', 80, 35, 0.6, 0.5, { at: 0.35, a: 0.004 });
    this.burst(0.4, 0.35, 'lowpass', 1800, { sweepTo: 100, at: 0.35, verb: 0.4 });
    this.osc('sine', 2637, 2637, 0.6, 0.05, { at: 0.36, verb: 0.6 });
  }

  /** モデムの接続音（ダイヤル後のピーとガーの圧縮版） */
  private modem() {
    this.osc('sine', 2100, 2100, 0.25, 0.16, { filter: 3000 });
    for (let i = 0; i < 8; i++) {
      const f = i % 2 ? 1850 : 1650;
      this.osc('sine', f, f, 0.035, 0.14, { at: 0.28 + i * 0.04 });
    }
    this.burst(0.45, 0.25, 'bandpass', 1800, { q: 1.5, at: 0.6, a: 0.02 });
    this.osc('sine', 60, 40, 0.3, 0.5, { at: 0.6 });
  }

  /** 映画予告編の「ブォーン」：低い金管のようなノコギリ波の束 + 重低音 */
  private braam() {
    for (const hz of [55, 82.4, 110]) {
      for (const d of [-8, 8]) {
        this.osc('sawtooth', hz * Math.pow(2, d / 1200), hz * 0.98, 0.9, 0.06, { filter: 900, verb: 0.5, a: 0.05 });
      }
    }
    this.osc('sine', 60, 30, 0.9, 0.5, { a: 0.01 });
  }

  /** 上昇するシンセのうねりから重低音へ */
  private synthRise() {
    this.osc('sawtooth', 110, 880, 0.35, 0.06, { filter: 2500, a: 0.25 });
    this.osc('sawtooth', 111, 885, 0.35, 0.06, { filter: 2500, a: 0.25 });
    this.osc('sine', 70, 32, 0.7, 0.5, { at: 0.6, a: 0.004 });
    this.burst(0.35, 0.25, 'lowpass', 2500, { sweepTo: 120, at: 0.6, verb: 0.5 });
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
    f.frequency.exponentialRampToValueAtTime(1800, t + 1.2);
    f.frequency.exponentialRampToValueAtTime(400, t + 4);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.1, t + 0.15);
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

  /** 画面グリッチ：データが壊れるような断続ノイズ + 電気的なハムのうなり */
  glitch() {
    if (!this.budget()) return;
    for (let i = 0; i < 8; i++) {
      this.burst(0.01 + Math.random() * 0.015, 0.14, 'bandpass', 300 + Math.random() * 6000, { q: 5, at: i * 0.025 + Math.random() * 0.01, a: 0.001 });
    }
    this.osc('square', 50, 50, 0.14, 0.08, { filter: 600 });
  }

  /** 崩落：細かな粒が高い方から低い方へ崩れ、最後に地鳴りが残る */
  crumble() {
    if (!this.ctx || this.muted) return;
    for (let i = 0; i < 40; i++) {
      const p = i / 40;
      this.burst(0.006 + Math.random() * 0.01, 0.55 * (1 - p * 0.7), 'bandpass', 6000 * Math.pow(0.05, p) * (0.7 + Math.random() * 0.6), { q: 4, at: p * 1.4 + Math.random() * 0.03, a: 0.001 });
    }
    this.burst(1.5, 0.35, 'lowpass', 400, { sweepTo: 60, a: 0.1 });
  }
}

export const sfx = new Sfx();
