// デモ（自動操縦）。録画再生ではなく、人間が叩いているのと同じ Hack の入口を呼ぶことで
// 手動操作との切り替え時に画面状態をそのまま引き継げるようにしている。
import type { Hack } from './hack';
import { chance, int, pick, rand } from './rand';

type Mood = 'calm' | 'focused' | 'frantic';

// 打鍵間隔 [min, max] ms。気分ごとにテンポを変えて、場面ごとの緩急を作る
const TEMPO: Record<Mood, [number, number]> = {
  calm: [85, 170],
  focused: [45, 95],
  frantic: [22, 50],
};

export class Demo {
  active = false;
  private nextAt = 0;
  private mood: Mood = 'calm';
  private serial = -1;
  private waitingEnter = false;
  private typo = 0;

  constructor(private hack: Hack) {}

  start(now: number) {
    this.active = true;
    this.nextAt = now + 300;
    this.serial = -1;
    this.waitingEnter = false;
  }

  /** 人間の打鍵に近い文字の出方にする（スペースが時々混ざる） */
  private char() {
    return chance(0.15) ? ' ' : pick([...'asdfghjklqwertyuiopzxcvbnm1234567890']);
  }

  stop() {
    this.active = false;
  }

  /** 終盤ほど慌ただしくなるよう、ステージ進行で気分の出やすさを変える（物語としての盛り上がり） */
  private pickMood() {
    const late = this.hack.stageIdx / 4;
    const r = rand();
    this.mood = r < 0.4 - late * 0.3 ? 'calm' : r < 0.8 - late * 0.3 ? 'focused' : 'frantic';
  }

  private gap() {
    const [a, b] = TEMPO[this.mood];
    // たまに考え込む間を入れて、機械的な一定リズムを避ける
    if (chance(this.mood === 'calm' ? 0.06 : 0.025)) return int(350, 900);
    return int(a, b);
  }

  update(now: number) {
    if (!this.active || now < this.nextAt) return;
    const h = this.hack;
    if (h.promptSerial !== this.serial) {
      this.serial = h.promptSerial;
      this.pickMood();
      this.waitingEnter = false;
      this.nextAt = now + int(300, 1100); // 新しいプロンプトの前で一呼吸
      return;
    }
    switch (h.phase) {
      case 'prompt':
        if (h.awaitingEnter) {
          if (!this.waitingEnter) {
            // 打ち終えてから Enter までの「溜め」。長めに溜めると映画っぽい
            this.waitingEnter = true;
            this.nextAt = now + pick([180, 350, 600, 900, 1300]);
            return;
          }
          h.enter(now);
          this.nextAt = now + 200;
          return;
        }
        if (this.typo > 0) {
          this.typo--;
          h.backspace();
          this.nextAt = now + int(60, 120);
          return;
        }
        h.key(now, this.char());
        // たまに打ち間違えて消す。完璧すぎる自動入力は機械っぽく見えるため
        if (chance(0.025)) this.typo = int(1, 2);
        this.nextAt = now + this.gap();
        return;
      case 'code':
        if (chance(0.08)) h.enter(now);
        else h.key(now, this.char());
        this.nextAt = now + this.gap();
        return;
      case 'running':
        // 実行中は見守るか、連打で加速させるか。慌ただしい気分ほど叩く
        if (this.mood === 'frantic' || (this.mood === 'focused' && chance(0.35))) {
          if (chance(0.06)) h.enter(now);
          else h.key(now, this.char());
          this.nextAt = now + this.gap();
        } else {
          this.nextAt = now + int(150, 400);
        }
        return;
      case 'trace':
        // 追跡されたら必死に叩く。たまに考える間を入れて「押し返される」瞬間も作る
        if (chance(0.03)) {
          this.nextAt = now + int(300, 700);
          return;
        }
        if (chance(0.08)) h.enter(now);
        else h.key(now, this.char());
        this.nextAt = now + int(60, 110);
        return;
      case 'locked':
        this.nextAt = now + 200;
        return;
    }
  }
}
