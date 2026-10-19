const now = Date.parse('2026-10-20T13:00:00Z');
export const scenarios = [
  { name: 'clock-dark', width: 850, height: 560, options: { now } },
  { name: 'clock-light', width: 850, height: 560, options: { now, theme: 'light' } },
  { name: 'clock-planning', width: 850, height: 560, options: { now, selected: now + 2 * 3600000 } },
  { name: 'planner-dark', width: 850, height: 560, options: { now, view: 'planner' } },
  { name: 'settings-dark', width: 850, height: 560, options: { now, view: 'settings' } },
  { name: 'clock-narrow', width: 380, height: 600, options: { now } },
  { name: 'compact-live', width: 400, height: 400, options: { now, mode: 'compact' } },
  { name: 'london-fall', width: 850, height: 560, options: { now, zone: 'Europe/London', selected: Date.parse('2026-10-25T12:30Z') } },
  { name: 'kathmandu', width: 850, height: 560, options: { now, zone: 'Asia/Kathmandu' } },
];
