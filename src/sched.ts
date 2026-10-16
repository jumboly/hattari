// 演出のタイミングを 1 本の rAF ループで管理する。
// setTimeout を散らすとモード切替時に取り消し漏れが起きて演出が重複起動しやすいため、予約を一箇所に集めてまとめて破棄できるようにする。
interface Task {
  at: number;
  fn: () => void;
  tag: string;
}

export class Scheduler {
  private tasks: Task[] = [];
  now = 0;

  after(ms: number, fn: () => void, tag = '') {
    this.tasks.push({ at: this.now + ms, fn, tag });
  }

  cancel(tag: string) {
    this.tasks = this.tasks.filter((t) => t.tag !== tag);
  }

  has(tag: string) {
    return this.tasks.some((t) => t.tag === tag);
  }

  get size() {
    return this.tasks.length;
  }

  update(now: number) {
    this.now = now;
    if (!this.tasks.length) return;
    const due = this.tasks.filter((t) => t.at <= now);
    if (!due.length) return;
    this.tasks = this.tasks.filter((t) => t.at > now);
    due.sort((a, b) => a.at - b.at);
    for (const t of due) t.fn();
  }
}
