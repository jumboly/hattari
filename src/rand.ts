export const rand = Math.random;
export const int = (min: number, max: number) => Math.floor(min + rand() * (max - min + 1));
export const chance = (p: number) => rand() < p;
export const pick = <T>(xs: readonly T[]): T => xs[Math.floor(rand() * xs.length)];
export const hex = (n: number) => {
  let s = '';
  for (let i = 0; i < n; i++) s += '0123456789abcdef'[int(0, 15)];
  return s;
};
// 演出用のアドレスは実在ホストを指さないよう、文書用予約帯 (RFC 5737) に限定する
export const ip = () => `${pick(['192.0.2', '198.51.100', '203.0.113'])}.${int(2, 254)}`;
export const pad = (n: number, w: number) => String(n).padStart(w, '0');
export const clock = () => {
  const d = new Date();
  return `${pad(d.getHours(), 2)}:${pad(d.getMinutes(), 2)}:${pad(d.getSeconds(), 2)}.${pad(d.getMilliseconds(), 3)}`;
};
