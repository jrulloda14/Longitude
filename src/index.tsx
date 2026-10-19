/**
 * Public surface of the Longitude UI package (window.Longitude in the bundle).
 * Visual components are pure: they take data + callbacks. LongitudeApp is the
 * container that wires them to the store.
 */
export { LongitudeApp } from './App';
export { InteractiveClock, ClockHand, MiniClock, stepFrom } from './components/InteractiveClock';
export { TimeReadout } from './components/TimeReadout';
export { TimezoneRow, DayStrip } from './components/TimezoneRow';
export { TimezoneList, WorkingHoursEditor } from './components/TimezoneList';
export { TimezoneSearch } from './components/TimezoneSearch';
export { TimezoneGroupSelector } from './components/TimezoneGroupSelector';
export { TimezoneTimeline } from './components/TimezoneTimeline';
export { MeetingOverlapIndicator, LevelGlyph } from './components/MeetingOverlapIndicator';
export { MeetingSummary } from './components/MeetingSummary';
export { CompactWidget } from './components/CompactWidget';
export { SettingsPanel } from './components/SettingsPanel';
export { Onboarding, EmptyState } from './components/Onboarding';
export { DstNotice, describeTransition, recurringShifts } from './components/DstNotice';
export { TitleBar, AppMark } from './components/WindowChrome';
export { PrototypeWindow } from './frame/PrototypeWindow';
export * as primitives from './primitives';
export * as time from './lib/time';
export * as schedule from './lib/schedule';
export * as share from './lib/share';
export * as search from './lib/search';
export { CITIES, cityById, cityFromZone } from './lib/cities';
export { StoreProvider, useStore, initialState, presetGroups, locationFromCity, DEFAULT_SETTINGS } from './state/store';
export { webPlatform } from './platform';
