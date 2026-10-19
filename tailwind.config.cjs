/** Tailwind maps every design token to its CSS variable (see tokens.json). */
const v = (n) => `var(--${n})`;
module.exports = {
  content: ['./src/**/*.{ts,tsx}'],
  darkMode: ['class', '[data-theme="dark"]'],
  corePlugins: { preflight: false },
  theme: {
    extend: {
      colors: {
        ground: v('ground'), surface: v('surface'), field: v('field'), dial: v('dial-face'),
        line: v('line'), 'line-strong': v('control-border'),
        ink: v('ink'), 'ink-muted': v('ink-muted'), 'ink-faint': v('ink-faint'),
        accent: v('accent'), 'on-accent': v('on-accent'), 'accent-soft': v('accent-soft'), focus: v('focus'),
        work: v('work'), 'work-band': v('work-band'), edge: v('edge'), 'edge-band': v('edge-band'),
        'off-band': v('off-band'), sleep: v('sleep'), 'sleep-band': v('sleep-band'),
        danger: v('danger'), 'win-close': v('win-close'),
      },
      fontFamily: { sans: v('font-sans'), mono: v('font-mono') },
      borderRadius: { sm: v('radius-sm'), md: v('radius-md'), lg: v('radius-lg') },
      boxShadow: { pop: v('shadow-popover'), window: v('shadow-window') },
      fontSize: {
        micro: ['10px', { lineHeight: '12px', letterSpacing: '0.06em' }],
        caption: ['11px', '14px'],
        label: ['12px', '16px'],
        body: ['13px', '18px'],
        title: ['14px', '20px'],
        row: ['20px', '24px'],
        readout: ['40px', '44px'],
      },
    },
  },
  plugins: [],
};
