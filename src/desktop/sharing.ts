/** No paths cross this port. Both Windows and macOS use the same fixed commands. */
import type { Platform, SaveResult } from '../platform';
type Invoke = <T>(command: string, args: Record<string, unknown>) => Promise<T>;
export function nativeSharing(invoke: Invoke): Pick<Platform, 'copyText' | 'saveFile'> {
  return {
    async copyText(text) { try { await invoke<void>('longitude_copy_text', { text }); return true; } catch { return false; } },
    async saveFile(name, contents, mime): Promise<SaveResult> {
      if (mime !== 'text/calendar') return { status: 'error', message: 'Only calendar export is supported.' };
      try {
        const result = await invoke<{ status?: string }>('longitude_save_calendar', { name, contents });
        if (result.status === 'saved' || result.status === 'cancelled') return { status: result.status };
        throw new Error('Invalid calendar export response.');
      }
      catch (e) { return { status: 'error', message: String(e) }; }
    },
  };
}
