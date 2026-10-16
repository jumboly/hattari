// ハッキング進行の中核。入力の出どころ（人間の打鍵 / 将来のデモ自動進行）を問わず
// key() / enter() / backspace() を呼べば同じ演出が起きるようにしておき、モード切替で画面状態を引き継げるようにする。
import { sfx } from './audio';
import {
  bonusScript,
  compileScript,
  counterLine,
  EXTRA_FLAGS,
  FINALES,
  finaleLead,
  newTarget,
  noiseLine,
  pickCommand,
  scriptFor,
  SNIPPETS,
  STAGES,
  type Snippet,
  type Step,
  type Target,
} from './content';
import type { Fx } from './fx';
import { chance, int, pick, rand } from './rand';
import type { Scheduler } from './sched';
import type { BarHandle, Terminal } from './terminal';

type Phase = 'prompt' | 'code' | 'running' | 'trace' | 'locked';

const USER = 'ghost@construct';
const MAX_QUEUE = 120;

export class Hack {
  target: Target = newTarget();
  stageIdx = 0;
  progress = 0;
  phase: Phase = 'prompt';
  intensity = 0;
  /** フィナーレ直前の静寂中など、他の演出（デジタルレイン等）が参照するためのフラグ */
  hushed = false;

  private keyTimes: number[] = [];
  private cmd = '';
  private typed = 0;
  private ext = 0;
  private promptLine?: ReturnType<Terminal['prompt']>;
  private codeBox?: ReturnType<Terminal['code']>;
  private snippet?: Snippet;
  private codeTyped = 0;
  private pendingCode?: Snippet;
  private queue: Step[] = [];
  private nextAt = 0;
  private bar?: { h: BarHandle; start: number; ms: number; lastBlip: number };
  private runsSinceCode = 0;
  private lastFinale = -1;
  /** 追跡レベル 0..100。追跡イベント中のみ意味を持つ */
  trace = 0;
  private tracedTarget = '';
  private lastCounter = 0;
  private ghost = false;
  private noiseBudget = 0;
  /** 出力が出るたびに呼ばれる（デジタルレインの反応などに使う） */
  onPulse: (kind: 'key' | 'enter' | 'line' | 'stage' | 'boom' | 'trace' | 'evade') => void = () => {};

  constructor(
    private term: Terminal,
    private fx: Fx,
    private sched: Scheduler,
  ) {}

  /** 新しいプロンプトが出るたびに増える。デモ側が「次の場面に移った」ことを知るため */
  promptSerial = 0;

  get awaitingEnter() {
    return this.phase === 'prompt' && this.typed >= this.cmd.length;
  }

  get stage() {
    return STAGES[Math.min(this.stageIdx, STAGES.length - 1)];
  }

  start() {
    this.term.line(`HATTARI construct shell v3.7.1 — neural mesh online`, 'hi');
    this.term.line(`Target construct: ${this.target.name} (${this.target.node}, ${this.target.sector})`, 'dim');
    this.term.line('', 'dim');
    this.newPrompt();
  }

  // ---------- 入力 ----------
  private noteKey(now: number) {
    this.keyTimes.push(now);
    while (this.keyTimes.length && now - this.keyTimes[0] > 1000) this.keyTimes.shift();
  }

  /** 打鍵速度に応じて 1 キーで進む文字数を増やし、速く叩くほど派手に流れるようにする */
  private charsPerKey() {
    return 1 + Math.floor(this.intensity * 4 + rand() * 2.2);
  }

  key(now: number) {
    this.noteKey(now);
    sfx.key(this.intensity);
    this.onPulse('key');
    switch (this.phase) {
      case 'prompt': {
        if (this.typed >= this.cmd.length) {
          // 打ち切った後も叩き続ける人のために、少しだけオプションを伸ばしてから実行を促す
          if (!this.pendingCode && this.ext < 2 && chance(0.35)) {
            this.cmd += ' ' + pick(EXTRA_FLAGS.filter((f) => !this.cmd.includes(f)));
            this.ext++;
          } else {
            this.promptLine?.set(this.cmd, true);
            if (chance(0.3)) this.fx.glitch(90);
            return;
          }
        }
        const prev = this.typed;
        this.typed = Math.min(this.cmd.length, this.typed + this.charsPerKey());
        this.promptLine?.set(this.cmd.slice(0, this.typed), this.typed >= this.cmd.length, prev);
        break;
      }
      case 'code': {
        this.codeTyped += 3 + Math.floor(this.intensity * 9 + rand() * 4);
        this.renderCode();
        break;
      }
      case 'running': {
        // 実行中の連打は「処理を加速させている」感覚にする
        if (this.bar) this.bar.start -= this.bar.ms * 0.08;
        else this.nextAt = Math.min(this.nextAt, now);
        // ノイズ行は 1 回の実行につき上限を設け、本筋のログが埋もれないようにする
        if (this.noiseBudget > 0 && chance(0.4) && this.queue.length < MAX_QUEUE) {
          this.noiseBudget--;
          this.queue.unshift(noiseLine());
        }
        break;
      }
      case 'trace': {
        // 連打 = 対抗措置。叩けば叩くほど追跡が押し戻される
        this.trace = Math.max(0, this.trace - 1);
        sfx.counter(this.trace / 100);
        if (now - this.lastCounter > 75) {
          this.lastCounter = now;
          const c = counterLine();
          this.term.line(c.text, c.cls);
        }
        break;
      }
      case 'locked':
        break;
    }
  }

  enter(now: number) {
    this.noteKey(now);
    switch (this.phase) {
      case 'prompt':
        // 途中で Enter しても、残りを一瞬で打ち切ってから実行する（失敗させない）
        this.typed = this.cmd.length;
        this.promptLine?.set(this.cmd);
        this.execute(now);
        break;
      case 'code': {
        const nl = this.snippet!.code.indexOf('\n', this.codeTyped + 1);
        this.codeTyped = nl < 0 ? this.snippet!.code.length : nl + 1;
        sfx.key(this.intensity);
        this.renderCode();
        break;
      }
      case 'running':
        // ターボ：溜まった出力をまとめて吐き出す
        sfx.enter();
        this.fx.shake();
        if (this.bar) this.bar.start -= this.bar.ms * 0.35;
        this.nextAt = Math.min(this.nextAt, now);
        this.flush(now, 5);
        break;
      case 'trace':
        sfx.enter();
        this.fx.shake();
        this.trace = Math.max(0, this.trace - 7);
        this.term.line(`>>> PHASE SHIFT ${Math.random().toString(16).slice(2, 10).toUpperCase()} — signature rewritten`, 'hi');
        break;
      case 'locked':
        break;
    }
  }

  backspace() {
    if (this.phase === 'prompt' && this.typed > 0) {
      this.typed = Math.max(0, this.typed - 2);
      this.promptLine?.set(this.cmd.slice(0, this.typed));
      sfx.backspace();
    } else if (this.phase === 'code' && this.codeTyped > 0) {
      this.codeTyped = Math.max(0, this.codeTyped - 4);
      this.renderCode();
      sfx.backspace();
    }
  }

  // ---------- 進行 ----------
  private newPrompt() {
    this.phase = 'prompt';
    this.ext = 0;
    this.typed = 0;
    // 適度にコードを書く場面を挟んで、コマンドの繰り返しによる単調さを崩す
    this.pendingCode = undefined;
    if (this.runsSinceCode >= 2 && chance(0.35)) {
      this.pendingCode = pick(SNIPPETS);
      this.cmd = `vim ${this.pendingCode.file}`;
    } else {
      this.cmd = pickCommand(this.stage.id, this.target);
    }
    this.promptSerial++;
    this.promptLine = this.term.prompt(USER);
    this.promptLine.set('');
  }

  private execute(now: number) {
    this.promptLine?.done(this.cmd);
    sfx.enter();
    this.fx.shake();
    this.onPulse('enter');
    if (this.pendingCode) {
      this.runsSinceCode = 0;
      this.snippet = this.pendingCode;
      this.codeTyped = 0;
      this.codeBox = this.term.code(this.snippet);
      this.renderCode();
      this.phase = 'code';
      return;
    }
    this.runsSinceCode++;
    // ときどき別系統の出力を後ろに足して、同じステージの繰り返しでも見え方を変える
    const steps = scriptFor(this.stage.id, this.target);
    if (chance(0.25)) steps.push(...bonusScript(this.target));
    this.run(steps, now);
  }

  private renderCode() {
    const s = this.snippet!;
    this.codeTyped = Math.min(this.codeTyped, s.code.length);
    this.codeBox!.set(this.codeTyped);
    if (this.codeTyped >= s.code.length) {
      this.codeBox!.close();
      sfx.enter();
      this.run(compileScript(s), this.sched.now);
    }
  }

  private run(steps: Step[], now: number) {
    this.phase = 'running';
    this.noiseBudget = 10;
    this.queue = steps;
    this.nextAt = now + 120;
  }

  /** 打鍵速度で出力テンポを変える。速く叩くほど一気に流れる */
  private gapScale() {
    return 1 - this.intensity * 0.7;
  }

  private flush(now: number, n: number) {
    for (let i = 0; i < n && this.queue.length && !this.bar; i++) this.step(now);
  }

  private step(now: number) {
    const s = this.queue.shift()!;
    if (s.k === 'line') {
      const cls = s.cls ?? 'out';
      this.term.line(s.text, cls);
      if (cls === 'ok') sfx.ok();
      else if (cls === 'warn') {
        sfx.warn();
        this.fx.glitch(160);
      } else sfx.tick(cls);
      this.onPulse('line');
      this.nextAt = now + (s.gap ?? int(40, 140)) * this.gapScale();
    } else if (s.k === 'bar') {
      this.bar = { h: this.term.bar(s.label), start: now, ms: s.ms * (1 - this.intensity * 0.5), lastBlip: 0 };
      this.bar.h.update(0);
    } else {
      this.nextAt = now + s.ms;
    }
  }

  private finishRun(now: number) {
    // 中盤で一度だけ「逆探知」を挟み、順調すぎる流れに危機と逆転を入れる
    if (this.stageIdx >= 1 && this.stageIdx <= 3 && this.tracedTarget !== this.target.name && chance(0.3)) {
      this.startTrace();
      return;
    }
    this.advance(now);
  }

  private startTrace() {
    this.tracedTarget = this.target.name;
    this.phase = 'trace';
    this.trace = 30;
    this.ghost = false;
    sfx.alarm();
    this.fx.flash('red');
    this.fx.glitch(450);
    this.fx.shake(true);
    this.fx.banner('SENTINEL LOCK-ON', 'alert');
    document.body.classList.add('alert');
    this.term.line('', 'dim');
    this.term.line('[!] WARNING: Sentinel counter-trace detected', 'err');
    this.term.line('[!] Origin triangulation in progress — DEPLOY DECOYS (MASH KEYS)', 'warn');
    this.onPulse('trace');
    const loop = () => {
      if (this.phase !== 'trace') return;
      sfx.alarm(0.5);
      this.sched.after(1150, loop, 'trace');
    };
    this.sched.after(1150, loop, 'trace');
  }

  private evade() {
    this.phase = 'locked';
    this.sched.cancel('trace');
    document.body.classList.remove('alert');
    sfx.stageClear();
    this.fx.flash('green');
    this.fx.banner('TRACE EVADED');
    this.term.line('[+] Sentinel lost the signal. You are a ghost again.', 'ok');
    this.onPulse('evade');
    this.sched.after(1000, () => this.advance(this.sched.now), 'hack');
  }

  private advance(now: number) {
    // 1 回の実行でステージの一部が進む。小さな成功と大きな成功を混ぜるために進み幅をばらつかせる
    this.progress += 0.45 + rand() * 0.45;
    if (this.progress >= 1) {
      this.progress = 0;
      this.stageClear(now);
    } else {
      this.term.line('', 'dim');
      this.newPrompt();
    }
  }

  private stageClear(now: number) {
    const banner = this.stage.banner;
    this.stageIdx++;
    this.onPulse('stage');
    if (this.stageIdx >= STAGES.length) {
      this.beginFinale(now);
      return;
    }
    sfx.stageClear();
    this.fx.flash('green');
    this.fx.banner(banner);
    this.term.line(`>>> ${banner} <<<`, 'hi');
    this.term.line('', 'dim');
    this.phase = 'locked'; // バナー表示中は入力で流れを乱さない
    this.sched.after(900, () => this.newPrompt(), 'hack');
  }

  private beginFinale(now: number) {
    this.phase = 'locked';
    this.queue = finaleLead(this.target);
    this.nextAt = now;
    // 大量の出力の後に「静寂」を挟み、一行と一撃で決める
    const HUSH = 1300;
    this.sched.after(500, () => {
      this.hushed = true;
      document.body.classList.add('hush');
      sfx.hush(HUSH);
    }, 'hack');
    this.sched.after(500 + HUSH, () => {
      let i = int(0, FINALES.length - 1);
      if (i === this.lastFinale) i = (i + 1) % FINALES.length;
      this.lastFinale = i;
      const f = FINALES[i];
      sfx.boom();
      this.onPulse('boom');
      this.fx.flash('white');
      this.fx.shake(true);
      document.body.classList.remove('hush');
      document.body.classList.add('afterglow');
      this.fx.finale(f.title, f.sub, () => this.nextTarget());
    }, 'hack');
  }

  private nextTarget() {
    document.body.classList.remove('afterglow');
    this.hushed = false;
    this.target = newTarget(this.target);
    this.stageIdx = 0;
    this.progress = 0;
    this.term.line('', 'dim');
    this.term.line(`[*] Session archived. New construct detected: ${this.target.name} (${this.target.node})`, 'info');
    this.term.line('', 'dim');
    this.newPrompt();
  }

  // ---------- 毎フレーム ----------
  update(now: number, dt: number) {
    // 打鍵が止まったら勢いがじわじわ落ちる。上がるのは速く、下がるのはゆっくり
    while (this.keyTimes.length && now - this.keyTimes[0] > 1000) this.keyTimes.shift();
    const target = Math.min(1, this.keyTimes.length / 11);
    const k = target > this.intensity ? 0.25 : 0.02;
    this.intensity += (target - this.intensity) * Math.min(1, k * (dt / 16.7));

    if (this.bar) {
      const p = Math.min(1, (now - this.bar.start) / this.bar.ms);
      this.bar.h.update(p);
      if (now - this.bar.lastBlip > 70) {
        this.bar.lastBlip = now;
        sfx.scanBlip(p);
      }
      if (p >= 1) {
        this.bar = undefined;
        sfx.ok();
        this.nextAt = now + 60;
      }
      return;
    }
    if (this.phase === 'trace') {
      // 放置しても詰まないよう、95% に達したら自動の「ゴーストプロトコル」で振り切る
      if (!this.ghost && this.trace >= 95) {
        this.ghost = true;
        this.fx.glitch(600);
        this.term.line('[!] TRACE 95% — ENGAGING GHOST PROTOCOL', 'err');
      }
      // 打鍵で 0 まで押し戻した瞬間を逃さないよう、自然上昇より先に判定する
      if (this.trace <= 0) {
        this.trace = 0;
        this.evade();
        return;
      }
      // 叩いている間は追跡の伸びが鈍る。手を止めるとじわじわ迫ってくる
      this.trace = this.ghost ? this.trace - dt * 0.08 : Math.min(99, this.trace + dt * 0.012 * (1 - this.intensity * 0.85));
      return;
    }
    if (this.phase !== 'running' && !(this.phase === 'locked' && this.queue.length)) return;
    if (this.queue.length) {
      if (now >= this.nextAt) this.step(now);
    } else if (this.phase === 'running' && now >= this.nextAt) {
      this.finishRun(now);
    }
  }
}
