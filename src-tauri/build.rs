fn main() {
    tauri_build::try_build(tauri_build::Attributes::new().app_manifest(
        tauri_build::AppManifest::new().commands(&[
            "longitude_read_configuration",
            "longitude_commit_configuration",
            "longitude_snapshot",
            "longitude_initialize",
            "longitude_apply_state",
            "longitude_window",
            "longitude_environment",
            "longitude_quit_ready",
            "longitude_copy_text",
            "longitude_save_calendar",
        ]),
    ))
    .expect("Tauri build configuration failed");
}
