//! Destination-scoped calendar export and text-only clipboard; never accepts a frontend path.
use std::{
    io::Write,
    path::{Path, PathBuf},
    sync::atomic::{AtomicBool, Ordering},
};
use tauri::{Manager, WebviewWindow};
use tauri_plugin_clipboard_manager::ClipboardExt;
use tauri_plugin_dialog::DialogExt;
static SAVING: AtomicBool = AtomicBool::new(false);
pub fn is_saving() -> bool {
    SAVING.load(Ordering::SeqCst)
}
struct Saving;
impl Drop for Saving {
    fn drop(&mut self) {
        SAVING.store(false, Ordering::SeqCst);
    }
}
#[derive(Debug, PartialEq, serde::Serialize)]
#[serde(tag = "status", rename_all = "lowercase")]
pub enum SaveOutcome {
    Saved,
    Cancelled,
}
fn main_window(label: &str) -> Result<(), String> {
    if label == "main" {
        Ok(())
    } else {
        Err("Sharing is available only from the main window".into())
    }
}
pub fn validate_text(text: &str) -> Result<(), String> {
    if text.len() > 128 * 1024 || text.contains('\0') {
        return Err("Clipboard text is invalid or too large".into());
    }
    Ok(())
}
pub fn validate_name(name: &str) -> Result<(), String> {
    let stem = name
        .strip_suffix(".ics")
        .ok_or("Only .ics export is supported")?;
    let upper = stem.to_ascii_uppercase();
    let device = ["CON", "PRN", "AUX", "NUL"].contains(&upper.as_str())
        || (upper.len() == 4
            && (upper.starts_with("COM") || upper.starts_with("LPT"))
            && upper.as_bytes()[3].is_ascii_digit());
    if stem.is_empty()
        || stem.len() > 80
        || device
        || !stem
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_')
    {
        return Err("Invalid calendar filename".into());
    }
    Ok(())
}
pub fn validate_calendar(contents: &str) -> Result<(), String> {
    if contents.len() > 256 * 1024
        || !contents.starts_with("BEGIN:VCALENDAR\r\n")
        || !contents.ends_with("END:VCALENDAR\r\n")
        || contents
            .chars()
            .any(|c| c.is_control() && c != '\r' && c != '\n' && c != '\t')
    {
        return Err("Invalid or oversized calendar data".into());
    }
    for line in contents.split_terminator("\r\n") {
        if line.len() > 75 || line.contains(['\r', '\n']) {
            return Err("Calendar lines require CRLF and at most 75 UTF-8 octets".into());
        }
    }
    Ok(())
}
/// Only called with the path returned by the native dialog; not exposed as an IPC command.
fn export_selected(path: Option<PathBuf>, contents: &str) -> Result<SaveOutcome, String> {
    let Some(path) = path else {
        return Ok(SaveOutcome::Cancelled);
    };
    if path
        .extension()
        .and_then(|s| s.to_str())
        .map(|s| s.eq_ignore_ascii_case("ics"))
        != Some(true)
    {
        return Err("Choose an .ics filename".into());
    }
    write_calendar(&path, contents)?;
    Ok(SaveOutcome::Saved)
}
fn write_calendar(path: &Path, contents: &str) -> Result<(), String> {
    validate_calendar(contents)?;
    let parent = path.parent().ok_or("Missing export directory")?;
    let mut file = tempfile::NamedTempFile::new_in(parent)
        .map_err(|e| format!("Could not prepare calendar file: {e}"))?;
    file.write_all(contents.as_bytes())
        .and_then(|_| file.as_file().sync_all())
        .map_err(|e| format!("Could not write calendar file: {e}"))?;
    file.persist(path)
        .map_err(|e| format!("Could not replace calendar file: {}", e.error))?;
    #[cfg(unix)]
    std::fs::File::open(parent)
        .and_then(|f| f.sync_all())
        .map_err(|e| {
            format!(
                "Calendar replaced but directory sync failed; verify the file before retrying: {e}"
            )
        })?;
    Ok(())
}
#[tauri::command]
pub fn longitude_copy_text(window: WebviewWindow, text: String) -> Result<(), String> {
    main_window(window.label())?;
    validate_text(&text)?;
    window
        .app_handle()
        .clipboard()
        .write_text(text)
        .map_err(|e| format!("Clipboard unavailable: {e}"))
}
#[tauri::command]
pub async fn longitude_save_calendar(
    window: WebviewWindow,
    name: String,
    contents: String,
) -> Result<SaveOutcome, String> {
    main_window(window.label())?;
    validate_name(&name)?;
    validate_calendar(&contents)?;
    SAVING
        .compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
        .map_err(|_| "Another calendar Save dialog is already open")?;
    let guard = Saving;
    tauri::async_runtime::spawn_blocking(move || {
        let _guard = guard;
        let dialog = window
            .app_handle()
            .dialog()
            .file()
            .set_parent(&window)
            .set_title("Export meeting calendar")
            .add_filter("iCalendar", &["ics"])
            .set_file_name(&name);
        // Existing debug test-root isolation also keeps picker tests out of user Documents.
        // This only selects the initial directory; the real native Save/Cancel is still required.
        #[cfg(debug_assertions)]
        let dialog = if std::env::var_os("LONGITUDE_TEST_ROOT").is_some() {
            dialog.set_directory(window.state::<super::Host>().root.clone())
        } else {
            dialog
        };
        let chosen = dialog.blocking_save_file();
        let path = chosen
            .map(|p| {
                p.into_path()
                    .map_err(|e| format!("Unsupported calendar destination: {e}"))
            })
            .transpose()?;
        export_selected(path, &contents)
    })
    .await
    .map_err(|e| format!("Calendar export failed: {e}"))?
}
#[cfg(test)]
mod tests {
    use super::*;
    const ICS: &str = "BEGIN:VCALENDAR\r\nVERSION:2.0\r\nEND:VCALENDAR\r\n";
    #[test]
    fn only_main_can_share() {
        assert!(main_window("main").is_ok());
        assert!(main_window("widget").is_err());
    }
    #[test]
    fn bounded_text_clipboard() {
        assert!(validate_text("Hello 世界\nMeeting").is_ok());
        assert!(validate_text("\0").is_err());
        assert!(validate_text(&"x".repeat(128 * 1024 + 1)).is_err());
    }
    #[test]
    fn names_cannot_supply_paths_or_devices() {
        for n in [
            "../meeting.ics",
            "C:\\secret.ics",
            "file.txt",
            ".ics",
            "CON.ics",
            "com1.ics",
            "meet:ing.ics",
            "meeting.ics.exe",
            "a/b.ics",
        ] {
            assert!(validate_name(n).is_err(), "{n}");
        }
        assert!(validate_name("project-sync_1.ics").is_ok());
    }
    #[test]
    fn reject_malformed_or_oversized_calendar() {
        for s in [
            "text",
            "BEGIN:VCALENDAR\nEND:VCALENDAR\n",
            "BEGIN:VCALENDAR\r\nBAD\0\r\nEND:VCALENDAR\r\n",
            "BEGIN:VCALENDAR\r\nA\nB\r\nEND:VCALENDAR\r\n",
        ] {
            assert!(validate_calendar(s).is_err());
        }
        assert!(validate_calendar(&format!(
            "BEGIN:VCALENDAR\r\n{}\r\nEND:VCALENDAR\r\n",
            "x".repeat(76)
        ))
        .is_err());
        assert!(validate_calendar(&"x".repeat(256 * 1024 + 1)).is_err());
        assert!(validate_calendar(ICS).is_ok());
    }
    #[test]
    fn cancellation_never_writes() {
        assert_eq!(export_selected(None, ICS).unwrap(), SaveOutcome::Cancelled);
    }
    #[test]
    fn selected_destination_is_atomically_replaced() {
        let d = tempfile::tempdir().unwrap();
        let p = d.path().join("meeting.ics");
        std::fs::write(&p, "old").unwrap();
        assert_eq!(
            export_selected(Some(p.clone()), ICS).unwrap(),
            SaveOutcome::Saved
        );
        assert_eq!(std::fs::read_to_string(p).unwrap(), ICS);
    }
    #[test]
    fn filesystem_error_preserves_existing_destination() {
        let d = tempfile::tempdir().unwrap();
        let p = d.path().join("meeting.ics");
        std::fs::create_dir(&p).unwrap();
        assert!(export_selected(Some(p.clone()), ICS).is_err());
        assert!(p.is_dir());
        assert_eq!(std::fs::read_dir(d.path()).unwrap().count(), 1);
        assert!(export_selected(Some(d.path().join("missing/meeting.ics")), ICS).is_err());
    }
    #[test]
    fn invalid_extension_and_content_do_not_overwrite() {
        let d = tempfile::tempdir().unwrap();
        let p = d.path().join("meeting.txt");
        std::fs::write(&p, "original").unwrap();
        assert!(export_selected(Some(p.clone()), ICS).is_err());
        assert_eq!(std::fs::read_to_string(p).unwrap(), "original");
        let p = d.path().join("meeting.ics");
        std::fs::write(&p, "original").unwrap();
        assert!(export_selected(Some(p.clone()), "broken").is_err());
        assert_eq!(std::fs::read_to_string(p).unwrap(), "original");
    }
}
