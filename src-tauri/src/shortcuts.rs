//! Validate global chords before touching OS registrations; no key monitoring.
use tauri_plugin_global_shortcut::{Code, Modifiers, Shortcut};

pub fn parse(value: &str, macos: bool) -> Result<Shortcut, String> {
    let shortcut: Shortcut = value
        .parse()
        .map_err(|e| format!("Invalid shortcut: {e}"))?;
    let command = shortcut.mods.contains(Modifiers::SUPER);
    let control = shortcut.mods.contains(Modifiers::CONTROL);
    let alt = shortcut.mods.contains(Modifiers::ALT);
    let function_key = matches!(
        shortcut.key,
        Code::F1
            | Code::F2
            | Code::F3
            | Code::F4
            | Code::F5
            | Code::F6
            | Code::F7
            | Code::F8
            | Code::F9
            | Code::F10
            | Code::F11
            | Code::F12
            | Code::F13
            | Code::F14
            | Code::F15
            | Code::F16
            | Code::F17
            | Code::F18
            | Code::F19
            | Code::F20
            | Code::F21
            | Code::F22
            | Code::F23
            | Code::F24
    );
    if !(command || control || alt || function_key) {
        return Err(
            "Invalid global shortcut: add Control, Option/Alt or Command/Super to a typing key"
                .into(),
        );
    }
    // Command-only (including Shift+Command) chords belong to focused apps:
    // Quit/Close/Hide, Edit, navigation and window actions must keep working.
    // Control+Space switches input sources. Other occupied chords are rejected
    // by the OS/plugin; this policy is not a claim of global availability.
    if macos
        && ((command && !(control || alt))
            || (control && !command && !alt && shortcut.key == Code::Space))
    {
        return Err("Reserved macOS shortcut: preserve application/system shortcuts; use Option+Command or another modified chord".into());
    }
    Ok(shortcut)
}

pub fn same_owned(owned: Option<&str>, next: &Shortcut) -> bool {
    owned
        .and_then(|value| value.parse::<Shortcut>().ok())
        .as_ref()
        == Some(next)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn platform_defaults_are_valid() {
        assert!(parse("Alt+Super+T", true).is_ok());
        assert!(parse("Ctrl+Alt+T", false).is_ok());
    }
    #[test]
    fn bare_typing_and_shift_typing_cannot_capture_normal_input() {
        for value in ["T", "Shift+T", "Space"] {
            assert!(parse(value, false).is_err());
        }
        assert!(parse("F13", true).is_ok());
    }
    #[test]
    fn standard_mac_application_and_input_source_chords_are_preserved() {
        for value in [
            "Cmd+Q",
            "Cmd+W",
            "Cmd+H",
            "Cmd+M",
            "Cmd+Shift+M",
            "Cmd+Comma",
            "Cmd+Tab",
            "Ctrl+Space",
            "Ctrl+Shift+Space",
        ] {
            assert!(parse(value, true).is_err(), "{value}");
        }
    }
    #[test]
    fn explicit_option_command_and_other_modified_chords_remain_configurable() {
        for value in ["Alt+Super+T", "Ctrl+Shift+Y", "Alt+Shift+T"] {
            assert!(parse(value, true).is_ok(), "{value}");
        }
        assert!(parse("Ctrl+Space", false).is_ok());
    }
    #[test]
    fn aliases_do_not_attempt_to_register_an_already_owned_chord() {
        let next = parse("Control+Alt+T", false).unwrap();
        assert!(same_owned(Some("Ctrl+Alt+T"), &next));
        assert!(!same_owned(Some("Ctrl+Alt+Y"), &next));
        assert!(!same_owned(None, &next));
    }
    #[test]
    fn malformed_shortcuts_fail_before_os_changes() {
        for value in ["", "Invalid+Nope", "Ctrl+", "Ctrl+Alt+T+Y"] {
            assert!(parse(value, true).is_err());
        }
    }
}
