// テーマ = 配色とデジタルレインの文字種のセット。
// 動作モードとは独立させ、CSS 変数と Canvas 用パレットの両方を 1 か所で切り替える。
export interface Theme {
  id: string;
  label: string;
  vars: Record<string, string>;
  canvas: { fg: string; dim: string; hi: string; alert: string };
  rain: { glyphs: string; body: string; head: string; glow: string };
}

export const THEMES: Theme[] = [
  {
    id: 'matrix',
    label: 'MATRIX',
    vars: {},
    canvas: { fg: '#3dff7f', dim: 'rgba(61,255,127,0.28)', hi: '#e6fff0', alert: '#ff3b5c' },
    rain: { glyphs: 'ｦｱｳｴｵｶｷｹｺｻｼｽｾｿﾀﾂﾃﾅﾆﾇﾈﾊﾋﾎﾏﾐﾑﾒﾓﾔﾕﾗﾘﾜ0123456789Z:."=*+-<>¦╌', body: '#2bff6e', head: '#e6fff0', glow: '#3dff7f' },
  },
  {
    id: 'retro',
    label: 'RETRO',
    vars: {
      '--fg': '#ffb341',
      '--fg-rgb': '255, 179, 65',
      '--hi-rgb': '255, 241, 214',
      '--amb-rgb': '90, 50, 10',
      '--fg-dim': '#99641c',
      '--fg-faint': '#4a2f0a',
      '--hi': '#fff1d6',
      '--glow': '0 0 4px rgba(255,179,65,0.8), 0 0 14px rgba(255,140,30,0.3)',
    },
    canvas: { fg: '#ffb341', dim: 'rgba(255,179,65,0.28)', hi: '#fff1d6', alert: '#ff3b5c' },
    // 80 年代端末らしく、カナではなく英数字と記号だけで降らせる
    rain: { glyphs: '0123456789ABCDEF#$%&*+-/<>=?@[]{}|~', body: '#ff9d1f', head: '#fff1d6', glow: '#ffb341' },
  },
];

export let theme = THEMES[0];

export function applyTheme(t: Theme) {
  theme = t;
  const root = document.documentElement;
  for (const th of THEMES) for (const k of Object.keys(th.vars)) root.style.removeProperty(k);
  for (const [k, v] of Object.entries(t.vars)) root.style.setProperty(k, v);
  document.body.dataset.theme = t.id;
}
