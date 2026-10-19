// Native policy stays out of the timezone/scheduling/persistence engines.
pub fn can_hide_main(close_behavior: &str, tray: bool, dock: bool) -> bool {
    close_behavior == "hide" && (tray || dock)
}
pub fn needs_rescue(any_visible: bool, tray: bool, dock: bool) -> bool {
    !any_visible && !tray && !dock
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn hide_requires_reachable_native_entry_point() {
        for tray in [false, true] {
            for dock in [false, true] {
                assert_eq!(can_hide_main("hide", tray, dock), tray || dock);
                assert!(!can_hide_main("quit", tray, dock));
            }
        }
    }
    #[test]
    fn rescue_does_not_undo_mac_dock_hide() {
        assert!(!needs_rescue(false, false, true));
        assert!(needs_rescue(false, false, false));
        assert!(!needs_rescue(false, true, false));
        assert!(!needs_rescue(true, false, false));
    }
}
