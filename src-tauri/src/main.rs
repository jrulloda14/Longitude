#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
mod authority;
mod lifecycle;
mod macos;
mod placement;
mod shortcuts;
mod storage;
use authority::{Authority, Reply, Snapshot};
use serde_json::{json, Value};
use std::{
    collections::HashMap,
    fs::File,
    sync::{
        atomic::{AtomicBool, AtomicU64, Ordering},
        Mutex,
    },
};
use tauri::{
    menu::{Menu, MenuItem, Submenu},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Emitter, Manager, WebviewWindow,
};
use tauri_plugin_autostart::ManagerExt as AutostartExt;
use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};

struct Host {
    authority: Mutex<Authority>,
    shortcut: Mutex<Option<String>>,
    exiting: AtomicBool,
    quitting: Mutex<Vec<String>>,
    quit_generation: AtomicU64,
    root: std::path::PathBuf,
    _instance: File,
}
#[derive(Clone, serde::Serialize, serde::Deserialize)]
struct SavedPlacement {
    #[serde(flatten)]
    rect: placement::Rect,
    scale: f64,
}
fn read_placements(root: &std::path::Path) -> HashMap<String, SavedPlacement> {
    storage::Storage::new(root.join("window-layout"))
        .read("longitude.configuration")
        .ok()
        .flatten()
        .and_then(|raw| serde_json::from_str::<HashMap<String, SavedPlacement>>(&raw).ok())
        .unwrap_or_default()
}
fn fail(e: impl std::fmt::Display) -> String {
    e.to_string()
}
fn caller(window: &WebviewWindow) -> Result<(), String> {
    if ["main", "widget"].contains(&window.label()) {
        Ok(())
    } else {
        Err("Untrusted window".into())
    }
}
fn main_only(window: &WebviewWindow) -> Result<(), String> {
    if window.label() == "main" {
        Ok(())
    } else {
        Err("Only the main window may hydrate storage".into())
    }
}
fn emit_error(app: &AppHandle, message: String) {
    eprintln!("{message}");
    let _ = app.emit("longitude-error", message);
}
fn publish(app: &AppHandle, snapshot: &Snapshot) {
    let _ = app.emit("longitude-state", snapshot);
}

#[tauri::command]
fn longitude_environment(app: AppHandle, window: WebviewWindow) -> Result<Value, String> {
    caller(&window)?;
    let windows:Vec<Value>=["main","widget"].iter().filter_map(|label|app.get_webview_window(label).map(|w|{
        let position=w.outer_position().ok();let size=w.inner_size().ok();
        json!({"label":label,"visible":w.is_visible().ok(),"minimized":w.is_minimized().ok(),"maximized":w.is_maximized().ok(),"fullscreen":w.is_fullscreen().ok(),"alwaysOnTop":w.is_always_on_top().ok(),"position":position.map(|p|json!({"x":p.x,"y":p.y})),"size":size.map(|s|json!({"width":s.width,"height":s.height})),"scale":w.scale_factor().ok()})
    })).collect();
    let host = app.state::<Host>();
    Ok(
        json!({"os":std::env::consts::OS,"windows":windows,"shortcut":host.shortcut.lock().map_err(fail)?.clone(),"autostart":app.autolaunch().is_enabled().ok()}),
    )
}
#[tauri::command]
fn longitude_read_configuration(
    window: WebviewWindow,
    host: tauri::State<Host>,
    key: String,
) -> Result<Option<String>, String> {
    main_only(&window)?;
    host.authority.lock().map_err(fail)?.storage.read(&key)
}
#[tauri::command]
fn longitude_commit_configuration(
    window: WebviewWindow,
    host: tauri::State<Host>,
    key: String,
    expected: Option<String>,
    next: String,
) -> Result<bool, String> {
    main_only(&window)?;
    let authority = host.authority.lock().map_err(fail)?;
    if authority.snapshot.is_some() {
        return Err("Use revisioned state transactions after hydration".into());
    }
    let record: Value = serde_json::from_str(&next).map_err(fail)?;
    if record["format"] != 1 {
        return Err("Invalid storage format".into());
    }
    let envelope: Value =
        serde_json::from_str(record["current"].as_str().ok_or("Missing configuration")?)
            .map_err(fail)?;
    if envelope["version"] != 1 {
        return Err("Invalid schema version".into());
    }
    let mut state = envelope["data"].clone();
    state["selected"] = Value::Null;
    state["mode"] = json!("full");
    state["view"] = json!("clock");
    authority::validate(&state)?;
    authority.storage.cas(&key, expected.as_deref(), &next)
}
#[tauri::command]
fn longitude_snapshot(
    window: WebviewWindow,
    host: tauri::State<Host>,
) -> Result<Option<Snapshot>, String> {
    caller(&window)?;
    Ok(host.authority.lock().map_err(fail)?.snapshot.clone())
}
#[tauri::command]
fn longitude_initialize(
    app: AppHandle,
    window: WebviewWindow,
    host: tauri::State<Host>,
    state: Value,
    writable: bool,
) -> Result<Snapshot, String> {
    main_only(&window)?;
    let mut authority = host.authority.lock().map_err(fail)?;
    if let Some(snapshot) = &authority.snapshot {
        return Ok(snapshot.clone());
    }
    authority.initialize(state, writable)?;
    if writable {
        if let Err(error) = configure(
            &app,
            &authority.snapshot.as_ref().unwrap().state["settings"],
        ) {
            authority.snapshot.as_mut().unwrap().warning = Some(error);
        }
    } else {
        authority.snapshot.as_mut().unwrap().warning = Some("Saving is disabled to protect a future configuration. Native preferences were not changed.".into());
    }
    let snapshot = authority.snapshot.clone().unwrap();
    drop(authority);
    update_tray(&app, &snapshot.state)?;
    restore_window(&app, "main");
    restore_window(&app, "widget");
    publish(&app, &snapshot);
    show(&app, "main", true)?;
    Ok(snapshot)
}
#[tauri::command]
fn longitude_apply_state(
    app: AppHandle,
    window: WebviewWindow,
    host: tauri::State<Host>,
    revision: u64,
    state: Value,
    origin: String,
    request_id: String,
) -> Result<Reply, String> {
    caller(&window)?;
    apply(&app, &host, revision, state, origin, request_id)
}
fn apply(
    app: &AppHandle,
    host: &Host,
    revision: u64,
    state: Value,
    origin: String,
    request_id: String,
) -> Result<Reply, String> {
    let mut authority = host.authority.lock().map_err(fail)?;
    let current = authority
        .snapshot
        .as_ref()
        .ok_or("Desktop state is loading")?
        .clone();
    if current.revision != revision {
        return Ok(Reply {
            accepted: false,
            snapshot: current,
        });
    }
    authority::validate(&state)?;
    if !authority.writable && authority::durable(&current.state) != authority::durable(&state) {
        return Err("Saving is disabled to protect a future configuration; native preferences were not changed".into());
    }
    let changed = [
        "globalShortcut",
        "launchAtSignIn",
        "widgetPinned",
        "trayIcon",
    ]
    .iter()
    .any(|key| current.state["settings"][*key] != state["settings"][*key])
        || (cfg!(target_os = "macos")
            && current.state["settings"]["theme"] != state["settings"]["theme"]);
    let groups_changed = current.state["groups"] != state["groups"];
    if changed {
        if let Err(error) = configure(app, &state["settings"]) {
            if let Err(rollback) = configure(app, &current.state["settings"]) {
                emit_error(app, format!("Preference rollback failed: {rollback}"));
            }
            return Err(error);
        }
    }
    let result = authority.apply(revision, state, origin, request_id);
    if result.is_err() && changed {
        if let Err(e) = configure(app, &current.state["settings"]) {
            emit_error(app, format!("Preference rollback failed: {e}"));
        }
    }
    let reply = result?;
    drop(authority);
    if reply.accepted {
        if groups_changed {
            if let Err(e) = update_tray(app, &reply.snapshot.state) {
                emit_error(app, e);
            }
        }
        publish(app, &reply.snapshot);
        if changed {
            ensure_accessible(app)?;
        }
    }
    Ok(reply)
}

// Portable services, official plugins; no Windows registry paths or hotkey APIs
// leak into the schema, domain engine or frontend state reducer.
fn configure(app: &AppHandle, settings: &Value) -> Result<(), String> {
    let host = app.state::<Host>();
    let mut owned = host.shortcut.lock().map_err(fail)?;
    let next = settings["globalShortcut"]
        .as_str()
        .ok_or("Missing shortcut")?;
    let parsed = shortcuts::parse(next, cfg!(target_os = "macos"))?;
    let changed = !shortcuts::same_owned(owned.as_deref(), &parsed);
    if changed {
        app.global_shortcut().register(parsed).map_err(|e| {
            format!(
                "Could not register {next}; the shortcut may be reserved or already in use: {e}"
            )
        })?;
    }
    let autostart = app.autolaunch();
    let actual = match autostart.is_enabled() {
        Ok(value) => value,
        Err(error) => {
            if changed {
                let _ = app.global_shortcut().unregister(parsed);
            }
            return Err(format!("Could not read sign-in preference: {error}"));
        }
    };
    let requested = settings["launchAtSignIn"].as_bool().unwrap_or(false);
    let result = if actual != requested {
        if requested {
            autostart.enable()
        } else {
            autostart.disable()
        }
    } else {
        Ok(())
    };
    if let Err(e) = result {
        if changed {
            let _ = app.global_shortcut().unregister(parsed);
        }
        return Err(format!("Could not change sign-in preference: {e}"));
    }
    if changed {
        if let Some(previous) = owned.as_deref() {
            if let Err(e) = app.global_shortcut().unregister(previous) {
                let _ = app.global_shortcut().unregister(parsed);
                return Err(format!("Could not release previous shortcut: {e}"));
            }
        }
    }
    *owned = Some(next.into());
    #[cfg(target_os = "macos")]
    app.set_theme(macos::preferred_theme(
        settings["theme"].as_str().ok_or("Missing theme")?,
    )?);
    if let Some(widget) = app.get_webview_window("widget") {
        widget
            .set_always_on_top(settings["widgetPinned"].as_bool().unwrap_or(true))
            .map_err(fail)?;
    }
    if let Some(tray) = app.tray_by_id("longitude") {
        tray.set_visible(settings["trayIcon"].as_bool().unwrap_or(true))
            .map_err(fail)?;
    }
    Ok(())
}
fn update_tray(app: &AppHandle, state: &Value) -> Result<(), String> {
    let menu = Menu::new(app).map_err(fail)?;
    for (id, title) in [
        ("main", "Open Longitude"),
        ("widget", "Show / hide widget"),
        ("now", "Back to now"),
        ("settings", "Settings"),
    ] {
        menu.append(&MenuItem::with_id(app, id, title, true, None::<&str>).map_err(fail)?)
            .map_err(fail)?;
    }
    let groups = Submenu::new(app, "Groups", true).map_err(fail)?;
    if let Some(rows) = state["groups"].as_array() {
        for group in rows {
            let id = group["id"].as_str().unwrap_or("");
            let name = group["name"].as_str().unwrap_or("Group");
            groups
                .append(
                    &MenuItem::with_id(app, format!("group:{id}"), name, true, None::<&str>)
                        .map_err(fail)?,
                )
                .map_err(fail)?;
        }
    }
    menu.append(&groups).map_err(fail)?;
    menu.append(
        &MenuItem::with_id(app, "quit", "Quit Longitude", true, None::<&str>).map_err(fail)?,
    )
    .map_err(fail)?;
    if let Some(tray) = app.tray_by_id("longitude") {
        tray.set_menu(Some(menu)).map_err(fail)?;
    }
    #[cfg(target_os = "macos")]
    macos::install_menu(app, state).map_err(fail)?;
    Ok(())
}
fn show(app: &AppHandle, label: &str, focus: bool) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    app.show().map_err(fail)?;
    let w = app.get_webview_window(label).ok_or("Window unavailable")?;
    if label == "widget" {
        apply_widget_pin(app)?;
    }
    restore_visible_bounds(&w);
    w.unminimize().map_err(fail)?;
    w.show().map_err(fail)?;
    if focus {
        w.set_focus().map_err(fail)?;
    }
    Ok(())
}
fn apply_widget_pin(app: &AppHandle) -> Result<(), String> {
    let pin = app
        .state::<Host>()
        .authority
        .try_lock()
        .map_err(|_| "Desktop settings are busy; retry the widget")?
        .snapshot
        .as_ref()
        .ok_or("Desktop settings are loading")?
        .state["settings"]["widgetPinned"]
        .as_bool()
        .unwrap_or(true);
    app.get_webview_window("widget")
        .ok_or("Widget unavailable")?
        .set_always_on_top(pin)
        .map_err(fail)
}
fn toggle_widget(app: &AppHandle) -> Result<(), String> {
    let widget = app
        .get_webview_window("widget")
        .ok_or("Widget unavailable")?;
    if widget.is_visible().map_err(fail)? {
        widget.hide().map_err(fail)?;
        ensure_accessible(app)
    } else {
        show(app, "widget", true)
    }
}
fn ensure_accessible(app: &AppHandle) -> Result<(), String> {
    let host = app.state::<Host>();
    let tray = host
        .authority
        .try_lock()
        .ok()
        .and_then(|a| {
            a.snapshot
                .as_ref()
                .map(|s| s.state["settings"]["trayIcon"].as_bool().unwrap_or(false))
        })
        .unwrap_or(false);
    let any_visible = ["main", "widget"].iter().any(|label| {
        app.get_webview_window(label)
            .is_some_and(|w| w.is_visible().unwrap_or(false))
    });
    if lifecycle::needs_rescue(any_visible, tray, cfg!(target_os = "macos")) {
        show(app, "main", true)?;
    }
    Ok(())
}
fn finish_quit(app: &AppHandle) {
    let host = app.state::<Host>();
    host.exiting.store(true, Ordering::SeqCst);
    save_placements(app);
    let _ = app.global_shortcut().unregister_all();
    app.exit(0);
}
fn quit(app: &AppHandle) {
    let host = app.state::<Host>();
    if host
        .authority
        .try_lock()
        .ok()
        .is_some_and(|a| a.snapshot.is_none())
    {
        finish_quit(app);
        return;
    }
    let Ok(mut waiting) = host.quitting.try_lock() else {
        return;
    };
    if !waiting.is_empty() {
        return;
    }
    *waiting = vec!["main".into(), "widget".into()];
    let generation = host.quit_generation.fetch_add(1, Ordering::SeqCst) + 1;
    drop(waiting);
    let _ = app.emit("longitude-quit-request", generation);
    let handle = app.clone();
    std::thread::spawn(move || {
        std::thread::sleep(std::time::Duration::from_secs(8));
        let host = handle.state::<Host>();
        let timed_out = if let Ok(mut waiting) = host.quitting.lock() {
            if host.quit_generation.load(Ordering::SeqCst) == generation && !waiting.is_empty() {
                waiting.clear();
                true
            } else {
                false
            }
        } else {
            false
        };
        if timed_out {
            emit_error(
                &handle,
                "Quit paused: a window did not finish saving. Retry or discard pending changes."
                    .into(),
            );
            let _ = show(&handle, "main", true);
        }
    });
}
#[tauri::command]
fn longitude_quit_ready(
    app: AppHandle,
    window: WebviewWindow,
    host: tauri::State<Host>,
    generation: u64,
    success: bool,
    message: String,
) -> Result<(), String> {
    caller(&window)?;
    if generation != host.quit_generation.load(Ordering::SeqCst) {
        return Ok(());
    }
    let mut waiting = host.quitting.lock().map_err(fail)?;
    if waiting.is_empty() {
        return Ok(());
    }
    if !success {
        waiting.clear();
        drop(waiting);
        emit_error(
            &app,
            format!(
                "Quit paused: {}",
                message.chars().take(500).collect::<String>()
            ),
        );
        show(&app, "main", true)?;
        return Ok(());
    }
    waiting.retain(|label| label != window.label());
    let done = waiting.is_empty();
    drop(waiting);
    if done {
        finish_quit(&app);
    }
    Ok(())
}
fn close_main(app: &AppHandle) -> Result<(), String> {
    let host = app.state::<Host>();
    let settings = host
        .authority
        .try_lock()
        .ok()
        .and_then(|a| a.snapshot.as_ref().map(|s| s.state["settings"].clone()));
    if settings.is_some_and(|s| {
        lifecycle::can_hide_main(
            s["closeBehavior"].as_str().unwrap_or("quit"),
            s["trayIcon"] == true,
            cfg!(target_os = "macos"),
        )
    }) {
        save_placements(app);
        app.get_webview_window("main")
            .ok_or("Main unavailable")?
            .hide()
            .map_err(fail)
    } else {
        quit(app);
        Ok(())
    }
}
#[tauri::command]
fn longitude_window(app: AppHandle, window: WebviewWindow, action: String) -> Result<(), String> {
    caller(&window)?;
    match action.as_str() {
        "widget-pin" => apply_widget_pin(&app),
        "main" => show(&app, "main", true),
        "widget" => toggle_widget(&app),
        "expand" => {
            show(&app, "main", true)?;
            app.get_webview_window("widget")
                .ok_or("Widget unavailable")?
                .hide()
                .map_err(fail)
        }
        "hide-widget" => {
            app.get_webview_window("widget")
                .ok_or("Widget unavailable")?
                .hide()
                .map_err(fail)?;
            ensure_accessible(&app)
        }
        "minimize" => window.minimize().map_err(fail),
        "maximize" => {
            if window.label() != "main" {
                return Err("Widget cannot maximize".into());
            }
            if window.is_maximized().map_err(fail)? {
                window.unmaximize().map_err(fail)
            } else {
                window.maximize().map_err(fail)
            }
        }
        "close" => {
            if window.label() == "main" {
                close_main(&app)
            } else {
                window.hide().map_err(fail)?;
                ensure_accessible(&app)
            }
        }
        "quit" => {
            quit(&app);
            Ok(())
        }
        value if value.starts_with("widget-height:") && window.label() == "widget" => {
            let height = value[14..].parse::<u32>().map_err(fail)?.clamp(100, 360);
            window
                .set_size(tauri::LogicalSize::new(264.0, height as f64))
                .map_err(fail)
        }
        _ => Err("Unsupported window operation".into()),
    }
}
fn menu_action(app: &AppHandle, id: &str) {
    let result = match id {
        "main" => show(app, "main", true),
        "widget" => toggle_widget(app),
        "quit" => {
            quit(app);
            Ok(())
        }
        _ => {
            let host = app.state::<Host>();
            let snapshot = host
                .authority
                .try_lock()
                .ok()
                .and_then(|a| a.snapshot.clone());
            if let Some(snapshot) = snapshot {
                let mut next = snapshot.state;
                match id {
                    "now" => next["selected"] = Value::Null,
                    "settings" => next["view"] = json!("settings"),
                    v if v.starts_with("group:") => next["activeGroupId"] = json!(&v[6..]),
                    _ => return,
                }
                apply(
                    app,
                    &host,
                    snapshot.revision,
                    next,
                    "tray".into(),
                    id.into(),
                )
                .and_then(|_| {
                    if id == "settings" {
                        show(app, "main", true)
                    } else {
                        Ok(())
                    }
                })
            } else {
                Err("Desktop state is loading; try again".into())
            }
        }
    };
    if let Err(error) = result {
        emit_error(app, error);
    }
}
fn work_areas(window: &WebviewWindow) -> Vec<placement::Rect> {
    window
        .available_monitors()
        .unwrap_or_default()
        .iter()
        .map(|m| {
            let r = m.work_area();
            placement::Rect {
                x: r.position.x,
                y: r.position.y,
                width: r.size.width,
                height: r.size.height,
            }
        })
        .collect()
}
fn restore_visible_bounds(window: &WebviewWindow) {
    if window.is_fullscreen().unwrap_or(false) {
        return;
    }
    let Ok(position) = window.outer_position() else {
        return;
    };
    let Ok(size) = window.outer_size() else {
        return;
    };
    let scale = window.scale_factor().unwrap_or(1.0);
    let min = if window.label() == "widget" {
        (264.0, 100.0)
    } else {
        (380.0, 480.0)
    };
    if let Some(r) = placement::fit(
        placement::Rect {
            x: position.x,
            y: position.y,
            width: size.width,
            height: size.height,
        },
        &work_areas(window),
        ((min.0 * scale) as u32, (min.1 * scale) as u32),
    ) {
        let _ = window.set_position(tauri::PhysicalPosition::new(r.x, r.y));
        if !window.is_maximized().unwrap_or(false)
            && (r.width != size.width || r.height != size.height)
        {
            if let Ok(inner) = window.inner_size() {
                let width = r
                    .width
                    .saturating_sub(size.width.saturating_sub(inner.width))
                    .max(1);
                let height = r
                    .height
                    .saturating_sub(size.height.saturating_sub(inner.height))
                    .max(1);
                let _ = window.set_size(tauri::PhysicalSize::new(width, height));
            }
        }
    }
}
fn save_placements(app: &AppHandle) {
    let root = app.state::<Host>().root.clone();
    let mut placements = read_placements(&root);
    for label in ["main", "widget"] {
        if let Some(w) = app.get_webview_window(label) {
            if !w.is_maximized().unwrap_or(false) && !w.is_fullscreen().unwrap_or(false) {
                if let (Ok(p), Ok(s)) = (w.outer_position(), w.inner_size()) {
                    placements.insert(
                        label.to_string(),
                        SavedPlacement {
                            rect: placement::Rect {
                                x: p.x,
                                y: p.y,
                                width: s.width,
                                height: s.height,
                            },
                            scale: w.scale_factor().unwrap_or(1.0),
                        },
                    );
                }
            }
        }
    }
    let s = storage::Storage::new(root.join("window-layout"));
    if let Ok(previous) = s.read("longitude.configuration") {
        if let Ok(next) = serde_json::to_string(&placements) {
            if let Err(e) = s.cas("longitude.configuration", previous.as_deref(), &next) {
                emit_error(app, e);
            }
        }
    }
}
fn restore_window(app: &AppHandle, label: &str) {
    if let Some(w) = app.get_webview_window(label) {
        let dir = &app.state::<Host>().root;
        if let Ok(Some(raw)) =
            storage::Storage::new(dir.join("window-layout")).read("longitude.configuration")
        {
            if let Ok(values) = serde_json::from_str::<HashMap<String, SavedPlacement>>(&raw) {
                if let Some(r) = values.get(label) {
                    let _ = w.set_position(tauri::PhysicalPosition::new(r.rect.x, r.rect.y));
                }
            }
        }
        restore_visible_bounds(&w);
    }
}
fn main() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _, _| {
            if let Err(e) = show(app, "main", true) {
                emit_error(app, e);
            }
        }))
        .plugin(tauri_plugin_autostart::Builder::new().build())
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, _, event| {
                    if event.state() == ShortcutState::Pressed {
                        if let Err(e) = toggle_widget(app) {
                            emit_error(app, e);
                        }
                    }
                })
                .build(),
        )
        .on_menu_event(|app, event| {
            // Tray events have unprefixed IDs and their own handler. Avoid
            // dispatching them twice through the application menu listener.
            if let Some(id) = event.id().as_ref().strip_prefix("mac:") {
                menu_action(app, id);
            }
        })
        .setup(|app| {
            let dir = app.path().app_config_dir()?;
            #[cfg(debug_assertions)]
            let dir = std::env::var_os("LONGITUDE_TEST_ROOT")
                .map(std::path::PathBuf::from)
                .unwrap_or(dir);
            std::fs::create_dir_all(&dir)?;
            let instance = std::fs::OpenOptions::new()
                .read(true)
                .write(true)
                .create(true)
                .truncate(false)
                .open(dir.join("instance.lock"))?;
            instance.try_lock()?;
            app.manage(Host {
                authority: Mutex::new(Authority {
                    snapshot: None,
                    storage: storage::Storage::new(dir.clone()),
                    writable: false,
                    disk_expected: None,
                }),
                shortcut: Mutex::new(None),
                exiting: AtomicBool::new(false),
                quitting: Mutex::new(Vec::new()),
                quit_generation: AtomicU64::new(0),
                root: dir.clone(),
                _instance: instance,
            });
            let tray = TrayIconBuilder::with_id("longitude")
                .icon(app.default_window_icon().ok_or("Missing app icon")?.clone())
                .tooltip("Longitude")
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| menu_action(app, event.id().as_ref()))
                .on_tray_icon_event(|tray, event| {
                    if matches!(
                        event,
                        TrayIconEvent::Click {
                            button: MouseButton::Left,
                            button_state: MouseButtonState::Up,
                            ..
                        }
                    ) {
                        if let Err(e) = toggle_widget(tray.app_handle()) {
                            emit_error(tray.app_handle(), e);
                        }
                    }
                });
            #[cfg(target_os = "macos")]
            let tray = tray
                .icon(macos::template_icon())
                .icon_as_template(true)
                // macOS status items open their menu on the primary click.
                // Do not simultaneously toggle a window behind the menu.
                .show_menu_on_left_click(true)
                .on_tray_icon_event(|_, _| {});
            tray.build(app)?;
            update_tray(app.handle(), &Value::Null).map_err(std::io::Error::other)?;
            // Create webviews only after state and services are managed: their
            // frontend scripts can invoke IPC immediately during construction.
            let placements = read_placements(&dir);
            for config in &app.config().app.windows {
                let mut config = config.clone();
                if let Some(saved) = placements.get(&config.label) {
                    if saved.scale.is_finite() && (0.5..=8.0).contains(&saved.scale) {
                        config.width = (saved.rect.width as f64 / saved.scale)
                            .clamp(config.min_width.unwrap_or(100.0), 4096.0);
                        config.height = (saved.rect.height as f64 / saved.scale)
                            .clamp(config.min_height.unwrap_or(100.0), 4096.0);
                    }
                }
                let builder = tauri::WebviewWindowBuilder::from_config(app, &config)?;
                #[cfg(target_os = "macos")]
                let builder = if config.label == "widget" {
                    builder.visible_on_all_workspaces(true)
                } else {
                    builder
                };
                #[cfg(debug_assertions)]
                let builder = if std::env::var_os("LONGITUDE_TEST_ROOT").is_some() {
                    builder.data_directory(dir.join("webview"))
                } else {
                    builder
                };
                builder.build()?;
            }
            show(app.handle(), "main", true).map_err(std::io::Error::other)?;
            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                let app = window.app_handle();
                if app.state::<Host>().exiting.load(Ordering::SeqCst) {
                    return;
                }
                api.prevent_close();
                let result = if window.label() == "main" {
                    close_main(app)
                } else {
                    window
                        .hide()
                        .map_err(fail)
                        .and_then(|_| ensure_accessible(app))
                };
                if let Err(e) = result {
                    emit_error(app, e);
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            longitude_environment,
            longitude_read_configuration,
            longitude_commit_configuration,
            longitude_snapshot,
            longitude_initialize,
            longitude_apply_state,
            longitude_window,
            longitude_quit_ready
        ])
        .build(tauri::generate_context!())
        .expect("Could not start Longitude");
    app.run(|app, event| {
        #[cfg(target_os = "macos")]
        if let tauri::RunEvent::Reopen { .. } = &event {
            if let Err(e) = show(app, "main", true) {
                emit_error(app, e);
            }
        }
        if let tauri::RunEvent::ExitRequested { api, .. } = event {
            if !app.state::<Host>().exiting.load(Ordering::SeqCst) {
                api.prevent_exit();
                #[cfg(target_os = "macos")]
                quit(app);
                #[cfg(not(target_os = "macos"))]
                if let Err(e) = show(app, "main", true) {
                    emit_error(app, e);
                }
            }
        }
    });
}
