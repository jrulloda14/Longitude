/**
 * Longitude — component props (documentation; the source of truth is components/src).
 * Global: window.Longitude. Instants are epoch milliseconds; zones are IANA ids.
 */

type Instant = number;

interface WorkingHours { /** minutes after local midnight */ start: number; end: number; /** Shift-start weekday, 0 = Sunday */ days: number[]; intervals?: { start: number; end: number }[] }
interface SleepHours { start: number; end: number }
interface Location { id: string; name: string; country: string; zone: string; lat: number; lon: number; coordsApprox?: boolean; note?: string; favorite?: boolean; work: WorkingHours; sleep: SleepHours }
type DayState = 'work' | 'edge' | 'off' | 'sleep';
interface OverlapVerdict { level: 'good' | 'partial' | 'poor' | 'none'; headline: string; people: { id: string; label: string; state: DayState; workingMin: number; sleepingMin: number; burden: number }[]; cost: number }
interface Range { start: Instant; end: Instant }
interface City { id: string; name: string; country: string; zone: string; lat: number; lon: number; aliases?: string[]; coordsApprox?: boolean }
interface TimeFormat { hour12: boolean }
interface SummaryPlace { label: string; zone: string }
interface SummaryInput { title: string; start: Instant; durationMin: number; reference: SummaryPlace; places: SummaryPlace[]; format: TimeFormat }
interface Settings { hour12: boolean; step: 1 | 5; theme: 'system' | 'dark' | 'light'; chrome: 'windows' | 'macos'; reducedMotion: 'system' | 'on' | 'off'; showTimeline: boolean; defaultWork: WorkingHours; widgetOpacity: number; widgetPinned: boolean; trayIcon: boolean; closeBehavior: 'hide' | 'quit'; globalShortcut: string; launchAtSignIn: boolean }
interface GroupSummary { id: string; name: string; count: number }
type ChangeSource = 'drag' | 'wheel' | 'key' | 'input' | 'reset';

interface InteractiveClockProps {
  /** selected instant (epoch ms) */
  value: Instant;
  /** wall-clock now — drives the ghost hands and relative date */
  now: Instant;
  /** IANA zone the dial reads in (the reference location) */
  zone: string;
  /** coordinates for the sky ring; omit to hide it */
  coords?: { lat: number; lon: number };
  /** true when value follows now (no ghost hands, ink minute hand) */
  live: boolean;
  /** snap increment in minutes for drag / wheel / arrows (Shift overrides to 1) */
  step?: 1 | 5 | 15;
  hour12?: boolean;
  /** rendered px size (square) */
  size?: number;
  reducedMotion?: boolean;
  /** hide numerals and date window for very small instances */
  minimal?: boolean;
  onChange(next: Instant, source: ChangeSource): void;
  onReset(): void;
  /** fires when a drag starts/ends — parent can dim other UI, show hints */
  onDragChange?(dragging: boolean): void;
  className?: string;
}

interface ClockHandProps {
  /** rotation in degrees, 0 = 12 o'clock, may exceed 360 (unwrapped) */
  angle: number;
  length: number;
  width: number;
  tail?: number;
  color?: string;
  animate?: boolean;
}

interface TimeReadoutProps {
  value: Instant;
  now: Instant;
  zone: string;
  placeLabel: string;
  live: boolean;
  hour12: boolean;
  onChange(next: Instant, source: 'input' | 'key'): void;
  onReset(): void;
  compact?: boolean;
}

interface TimezoneRowProps {
  location: Location;
  at: Instant;
  referenceZone: string;
  isReference: boolean;
  hour12: boolean;
  /** sentence from describeTransition(), shown as a quiet chip + tooltip */
  dstNote?: string | null;
  /** hide the 24 h day strip in narrow layouts */
  showStrip?: boolean;
  dragging?: boolean;
  dropIndicator?: 'before' | 'after' | null;
  onMenu(e: React.MouseEvent | { clientX: number; clientY: number }): void;
  onSetReference(): void;
  /** HTML5 drag handle wiring from the list */
  dragHandleProps?: React.HTMLAttributes<HTMLElement>;
  rowProps?: React.HTMLAttributes<HTMLDivElement>;
}

interface TimezoneListProps {
  locations: Location[];
  at: Instant;
  referenceId: string | null;
  format: TimeFormat;
  onReorder(id: string, toIndex: number): void;
  onSetReference(id: string): void;
  onRemove(id: string): void;
  onUpdate(id: string, patch: Partial<Location>): void;
  onCopy(text: string): void;
  /** container used to clamp the context menu */
  containerRef: React.RefObject<HTMLElement>;
  /** narrow layout: rows drop the day strip */
  dense?: boolean;
}

interface TimezoneSearchProps {
  open: boolean;
  onClose(): void;
  onPick(city: City): void;
  /** zones already in the active group — shown as "Added", not pickable */
  existingZones: string[];
  existingNames: string[];
  now: Instant;
  hour12: boolean;
  /** show the loading skeleton (production: while the large city index loads) */
  loading?: boolean;
}

interface TimezoneGroupSelectorProps {
  groups: GroupSummary[];
  activeId: string;
  onSwitch(id: string): void;
  onCreate(name: string): void;
  onRename(id: string, name: string): void;
  onDuplicate(id: string): void;
  onDelete(id: string): void;
}

interface TimezoneTimelineProps {
  locations: Location[];
  referenceZone: string;
  at: Instant;
  now: Instant;
  hour12: boolean;
  durationMin: number;
  /** ranges where everyone is in working hours (from commonWorkingRanges) */
  overlap: Range[];
  step?: number; // minutes, drag snap
  onChange(next: Instant): void;
  labelWidth?: number;
  rowHeight?: number;
  /** show each location's time at the cursor next to its name (off when rows above already show it) */
  showTimes?: boolean;
}

interface MeetingOverlapIndicatorProps {
  verdict: OverlapVerdict;
  /** per-person local time strings, keyed by participant id */
  times: Record<string, string>;
  /** start expanded (planner) or collapsed to the headline (clock view) */
  defaultOpen?: boolean;
  className?: string;
}

interface MeetingSummaryProps {
  input: SummaryInput;
  weekly: boolean;
  onTitle(title: string): void;
  onDuration(min: number): void;
  onWeekly(on: boolean): void;
  onHour12(on: boolean): void;
  onCopy(text: string): Promise<boolean>;
  onExport(filename: string, ics: string): Promise<boolean>;
}

interface CompactWidgetProps {
  title: string;
  locations: Location[]; // first 2–5 are shown
  referenceZone: string;
  now: Instant;
  value: Instant;
  live: boolean;
  onChange(at: Instant): void;
  onReset(): void;
  hour12: boolean;
  pinned: boolean;
  opacity: number; // 0.6–1
  chrome: 'windows' | 'macos';
  nativeMac?: boolean;
  onTogglePin(): void;
  onExpand(): void;
  onClose(): void;
  onOpacity(v: number): void;
}

interface SettingsPanelProps {
  settings: Settings;
  onChange(patch: Partial<Settings>): void;
  platformSupportsAutostart: boolean;
  desktop?: boolean;
  desktopOS?: 'windows' | 'macos' | 'linux';
  onReplayOnboarding?(): void;
}

interface OnboardingProps {
  now: Instant;
  hour12: boolean;
  onFinish(choice: { home: City; preset: 'team' | 'apac' | 'us' | 'empty' }): void;
}

interface TitleBarProps {
  chrome: 'windows' | 'macos';
  nativeMac?: boolean;
  center?: React.ReactNode;
  /** place the center slot in flow (narrow windows) instead of true-centering it */
  centerInline?: boolean;
  actions?: React.ReactNode;
  onMinimize(): void;
  onMaximize(): void;
  onClose(): void;
  onCompact(): void;
}

interface LongitudeAppProps {
  initial?: Partial<{ groups: { id: string; name: string; locations: Location[]; referenceId: string | null }[]; activeGroupId: string; selected: Instant | null; view: 'clock' | 'planner' | 'settings'; mode: 'full' | 'compact'; onboarded: boolean; coach: boolean; settings: Settings; meeting: { title: string; durationMin: number; weekly: boolean } }>;
  platform?: unknown /* see platform.ts */;
  persist?: boolean;
  fixedNow?: Instant;
  /** open a layer immediately — used by design-system previews */
  openLayer?: 'search' | 'share' | null;
}

interface EmptyStateProps { onAdd(): void; onQuickAdd(c: City): void; now: Instant; hour12: boolean }
interface DstNoticeProps { children: React.ReactNode; tone?: 'info' | 'quiet'; className?: string }
interface PrototypeWindowProps extends LongitudeAppProps { width?: number; height?: number; theme?: 'dark' | 'light'; resizable?: boolean }
