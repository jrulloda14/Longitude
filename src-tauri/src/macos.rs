// Public Tauri APIs only. Compiled on Windows too to type-check menu construction;
// activation/reopen and Spaces calls are guarded in the shared host.
#![cfg_attr(not(target_os = "macos"), allow(dead_code))]
use serde_json::Value;
use tauri::{
    menu::{Menu, MenuItem, PredefinedMenuItem as Native, Submenu},
    AppHandle,
};

pub fn preferred_theme(value: &str) -> Result<Option<tauri::Theme>, String> {
    match value {
        "system" => Ok(None),
        "dark" => Ok(Some(tauri::Theme::Dark)),
        "light" => Ok(Some(tauri::Theme::Light)),
        _ => Err("Invalid native appearance preference".into()),
    }
}

pub fn install_menu(app: &AppHandle, state: &Value) -> tauri::Result<()> {
    let app_menu = Submenu::with_items(
        app,
        "Longitude",
        true,
        &[
            &Native::about(app, Some("About Longitude"), None)?,
            &MenuItem::with_id(app, "mac:settings", "Settings…", true, Some("Cmd+,"))?,
            &Native::separator(app)?,
            &Native::services(app, None)?,
            &Native::separator(app)?,
            &Native::hide(app, Some("Hide Longitude"))?,
            &Native::hide_others(app, None)?,
            &Native::show_all(app, None)?,
            &Native::separator(app)?,
            // Custom Quit routes through the same durable flush barrier as Windows.
            &MenuItem::with_id(app, "mac:quit", "Quit Longitude", true, Some("Cmd+Q"))?,
        ],
    )?;
    let edit = Submenu::with_items(
        app,
        "Edit",
        true,
        &[
            &Native::undo(app, None)?,
            &Native::redo(app, None)?,
            &Native::separator(app)?,
            &Native::cut(app, None)?,
            &Native::copy(app, None)?,
            &Native::paste(app, None)?,
            &Native::select_all(app, None)?,
        ],
    )?;
    let groups = Submenu::new(app, "Groups", true)?;
    if let Some(rows) = state["groups"].as_array() {
        for group in rows {
            if let (Some(id), Some(name)) = (group["id"].as_str(), group["name"].as_str()) {
                groups.append(&MenuItem::with_id(
                    app,
                    format!("mac:group:{id}"),
                    name,
                    true,
                    None::<&str>,
                )?)?;
            }
        }
    }
    let windows = Submenu::with_items(
        app,
        "Window",
        true,
        &[
            &MenuItem::with_id(app, "mac:main", "Open Longitude", true, None::<&str>)?,
            &MenuItem::with_id(
                app,
                "mac:widget",
                "Show / hide widget",
                true,
                Some("Cmd+Shift+M"),
            )?,
            &MenuItem::with_id(app, "mac:now", "Back to now", true, None::<&str>)?,
            &groups,
            &Native::separator(app)?,
            &Native::minimize(app, None)?,
            &Native::maximize(app, Some("Zoom"))?,
            &Native::fullscreen(app, None)?,
            &Native::close_window(app, None)?,
        ],
    )?;
    app.set_menu(Menu::with_items(app, &[&app_menu, &edit, &windows])?)?;
    Ok(())
}

/// Monochrome 2x menu-bar mark derived from the existing dial/meridian artwork.
/// Template alpha lets macOS choose light/dark/highlight colors.
pub fn template_icon() -> tauri::image::Image<'static> {
    let mut pixels = vec![0u8; 36 * 36 * 4];
    for y in 0..36 {
        for x in 0..36 {
            let dx = x as f64 - 17.5;
            let dy = y as f64 - 17.5;
            let r = (dx * dx + dy * dy).sqrt();
            let ring = (13.0..=15.0).contains(&r);
            let meridian = dx.abs() <= 1.0 && dy.abs() <= 14.0;
            let hand = (0.0..=7.0).contains(&dx) && (dy + dx * 0.66).abs() <= 1.1;
            if ring || meridian || hand {
                pixels[(y * 36 + x) * 4 + 3] = 255;
            }
        }
    }
    tauri::image::Image::new_owned(pixels, 36, 36)
}

#[cfg(test)]
mod tests {
    #[test]
    fn native_appearance_follows_system_or_explicit_preference() {
        assert_eq!(super::preferred_theme("system").unwrap(), None);
        assert_eq!(
            super::preferred_theme("dark").unwrap(),
            Some(tauri::Theme::Dark)
        );
        assert_eq!(
            super::preferred_theme("light").unwrap(),
            Some(tauri::Theme::Light)
        );
        assert!(super::preferred_theme("invalid").is_err());
    }
    #[test]
    fn platform_overrides_merge_and_deserialize_with_tauris_parser() {
        use tauri::utils::{config::parse::read_from, platform::Target};
        let root = std::path::Path::new(env!("CARGO_MANIFEST_DIR"));
        for target in [Target::MacOS, Target::Windows] {
            let (raw, files) = read_from(target, root).unwrap();
            let config: tauri::Config = serde_json::from_value(raw.clone()).unwrap();
            assert_eq!(files.len(), 2);
            assert_eq!(config.app.windows.len(), 2);
            assert_eq!(config.identifier, "app.longitude.desktop");
            if target == Target::MacOS {
                assert_eq!(raw["bundle"]["targets"], serde_json::json!(["app", "dmg"]));
                assert_eq!(raw["app"]["windows"][0]["decorations"], true);
                assert_eq!(raw["app"]["windows"][0]["titleBarStyle"], "Overlay");
                assert_eq!(raw["app"]["windows"][1]["transparent"], true);
                assert_eq!(raw["app"]["macOSPrivateApi"], true);
                assert_eq!(
                    raw["build"]["features"],
                    serde_json::json!(["macos-transparency"])
                );
            } else {
                assert_eq!(raw["bundle"]["targets"], serde_json::json!(["nsis"]));
                assert_eq!(raw["app"]["windows"][0]["decorations"], false);
                assert!(raw["app"].get("macOSPrivateApi").is_none());
            }
        }
    }

    #[test]
    fn app_icon_has_a_valid_icns_container_header() {
        let bytes = include_bytes!("../icons/icon.icns");
        assert_eq!(&bytes[..4], b"icns");
        assert_eq!(
            u32::from_be_bytes(bytes[4..8].try_into().unwrap()) as usize,
            bytes.len()
        );
    }

    #[test]
    fn template_has_retina_dimensions_and_transparent_background() {
        let icon = super::template_icon();
        assert_eq!((icon.width(), icon.height()), (36, 36));
        assert_eq!(icon.rgba()[3], 0);
        assert!(icon.rgba().chunks_exact(4).filter(|p| p[3] == 255).count() > 150);
        assert!(icon.rgba().chunks_exact(4).all(|p| p[..3] == [0, 0, 0]));
    }
}
