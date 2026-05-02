pub mod commands;
pub mod core;
pub mod db;
pub mod error;
pub mod metadata;
pub mod models;
pub mod search;
pub mod state;

#[cfg(target_os = "macos")]
use tauri::menu::{AboutMetadata, CheckMenuItem, Menu, MenuBuilder, MenuItem, SubmenuBuilder};
use tauri::{Emitter, Listener, Manager};
#[cfg(target_os = "macos")]
use tauri::Runtime;
#[cfg(target_os = "macos")]
use tauri_plugin_opener::OpenerExt;
use tauri::{WebviewUrl, WebviewWindowBuilder};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutState};

use crate::state::AppState;

#[tauri::command]
fn close_overlay(app: tauri::AppHandle) -> Result<(), String> {
    if let Some(win) = app.get_webview_window("overlay") {
        win.hide().map_err(|e| e.to_string())?;
    }
    Ok(())
}

fn toggle_overlay(app: &tauri::AppHandle) {
    const LABEL: &str = "overlay";

    if let Some(win) = app.get_webview_window(LABEL) {
        let is_visible = win.is_visible().unwrap_or(false);
        if is_visible {
            let _ = win.hide();
        } else {
            let _ = win.set_visible_on_all_workspaces(true);
            let _ = win.set_always_on_top(true);
            let _ = win.show();
            let _ = win.set_focus();
            let _ = app.emit("stack://overlay-opened", ());
        }
        return;
    }

    let win = WebviewWindowBuilder::new(app, LABEL, WebviewUrl::App("index.html".into()))
        .title("Stack Overlay")
        .decorations(false)
        .transparent(true)
        .shadow(false)
        .resizable(true)
        .always_on_top(true)
        .visible_on_all_workspaces(true)
        .skip_taskbar(true)
        .min_inner_size(760.0, 560.0)
        .inner_size(980.0, 760.0)
        .build();

    if let Ok(win) = win {
        let _ = win.set_visible_on_all_workspaces(true);
        let _ = win.show();
        let _ = win.set_focus();
        let _ = app.emit("stack://overlay-opened", ());
    }
}

#[cfg(target_os = "macos")]
fn build_macos_menu<R: Runtime, M: Manager<R>>(manager: &M) -> tauri::Result<Menu<R>> {
    let app_menu = SubmenuBuilder::new(manager, "Stack")
        .about(Some(AboutMetadata {
            name: Some("Stack".into()),
            version: Some(env!("CARGO_PKG_VERSION").into()),
            short_version: Some("Desktop".into()),
            copyright: Some("Copyright 2026 Swendl".into()),
            website: Some("https://swendl.com".into()),
            website_label: Some("swendl.com".into()),
            credits: Some(
                "Stack is a local-first sample manager for producers.\n\
                 Organize samples, MIDI and presets with fast search and musical filters."
                    .into(),
            ),
            icon: manager.app_handle().default_window_icon().cloned(),
            ..Default::default()
        }))
        .separator()
        .hide()
        .hide_others()
        .show_all()
        .separator()
        .quit()
        .build()?;

    let file_menu = SubmenuBuilder::new(manager, "File")
        .close_window_with_text("Close Window")
        .build()?;

    let nav_browser = CheckMenuItem::with_id(
        manager,
        "navigate.browser",
        "Browser",
        true,
        true,
        Some("CmdOrCtrl+1"),
    )?;
    let nav_packs = CheckMenuItem::with_id(
        manager,
        "navigate.packs",
        "Packs",
        true,
        false,
        Some("CmdOrCtrl+2"),
    )?;
    let nav_favorites = CheckMenuItem::with_id(
        manager,
        "navigate.favorites",
        "Favorites",
        true,
        false,
        Some("CmdOrCtrl+3"),
    )?;
    let nav_presets = CheckMenuItem::with_id(
        manager,
        "navigate.presets",
        "Presets",
        true,
        false,
        Some("CmdOrCtrl+4"),
    )?;
    let nav_midi = CheckMenuItem::with_id(
        manager,
        "navigate.midi",
        "MIDI",
        true,
        false,
        Some("CmdOrCtrl+5"),
    )?;
    let nav_plugins = CheckMenuItem::with_id(
        manager,
        "navigate.plugins",
        "Plugins",
        true,
        false,
        Some("CmdOrCtrl+6"),
    )?;
    let nav_settings = CheckMenuItem::with_id(
        manager,
        "navigate.settings",
        "Settings",
        true,
        false,
        Some("CmdOrCtrl+,"),
    )?;
    let navigate_menu = SubmenuBuilder::new(manager, "Navigate")
        .item(&nav_browser)
        .item(&nav_packs)
        .item(&nav_favorites)
        .item(&nav_presets)
        .item(&nav_midi)
        .item(&nav_plugins)
        .separator()
        .item(&nav_settings)
        .build()?;

    let edit_menu = SubmenuBuilder::new(manager, "Edit")
        .undo()
        .redo()
        .separator()
        .cut()
        .copy()
        .paste()
        .select_all()
        .build()?;

    let view_menu = SubmenuBuilder::new(manager, "View")
        .fullscreen_with_text("Toggle Full Screen")
        .build()?;

    let window_menu = SubmenuBuilder::new(manager, "Window")
        .minimize()
        .maximize()
        .separator()
        .close_window()
        .build()?;

    let help_focus_search = MenuItem::with_id(
        manager,
        "help.focus_search",
        "Focus Search",
        true,
        Some("CmdOrCtrl+F"),
    )?;
    let help_menu = SubmenuBuilder::new(manager, "Help")
        .item(&help_focus_search)
        .separator()
        .text("help.learn_swendl", "Learn about Swendl")
        .build()?;

    MenuBuilder::new(manager)
        .item(&app_menu)
        .item(&file_menu)
        .item(&navigate_menu)
        .item(&edit_menu)
        .item(&view_menu)
        .item(&window_menu)
        .item(&help_menu)
        .build()
}

#[cfg(target_os = "macos")]
fn update_navigate_checks<R: Runtime>(app: &tauri::AppHandle<R>, page: &str) {
    let Some(menu) = app.menu() else {
        return;
    };
    for (id, active) in [
        ("navigate.browser", page == "browser"),
        ("navigate.packs", page == "packs" || page == "pack"),
        ("navigate.favorites", page == "favorites"),
        ("navigate.presets", page == "presets"),
        ("navigate.midi", page == "midi"),
        ("navigate.plugins", page == "plugins"),
        ("navigate.settings", page == "settings"),
    ] {
        if let Some(item) = menu.get(id) {
            if let Some(check) = item.as_check_menuitem() {
                let _ = check.set_checked(active);
            }
        }
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "stack_lib=info".into()),
        )
        .init();

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_drag::init())
        .plugin(tauri_plugin_autostart::init(tauri_plugin_autostart::MacosLauncher::LaunchAgent, None))
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, _shortcut, event| {
                    if event.state == ShortcutState::Pressed {
                        // Only registered shortcuts will reach this handler.
                        toggle_overlay(app);
                    }
                })
                .build(),
        )
        .setup(|app| {
            let state = AppState::init(app.handle().clone())?;
            app.manage(state);

            // Register global overlay shortcut. We register both variants explicitly
            // to approximate "CmdOrCtrl+Shift+O" across platforms.
            let ctrl = Shortcut::new(
                Some(tauri_plugin_global_shortcut::Modifiers::CONTROL | tauri_plugin_global_shortcut::Modifiers::SHIFT),
                tauri_plugin_global_shortcut::Code::KeyO,
            );
            let cmd = Shortcut::new(
                Some(tauri_plugin_global_shortcut::Modifiers::META | tauri_plugin_global_shortcut::Modifiers::SHIFT),
                tauri_plugin_global_shortcut::Code::KeyO,
            );
            let _ = app.global_shortcut().register(ctrl);
            let _ = app.global_shortcut().register(cmd);

            #[cfg(target_os = "macos")]
            {
                let menu = build_macos_menu(app)?;
                app.set_menu(menu)?;
                update_navigate_checks(&app.handle(), "browser");
                let app_handle = app.handle().clone();
                app.handle().listen("stack://active-page-changed", move |event| {
                    let trimmed = event.payload().trim_matches('"');
                    update_navigate_checks(&app_handle, trimmed);
                });
            }
            Ok(())
        })
        .on_menu_event(|app, event| {
            #[cfg(target_os = "macos")]
            {
                let id = event.id().as_ref();
                if id == "help.learn_swendl" {
                    let _ = app.opener().open_url("https://swendl.com", None::<&str>);
                } else if id == "help.focus_search" {
                    let _ = app.emit("stack://menu-focus-search", ());
                } else if let Some(page) = id.strip_prefix("navigate.") {
                    let _ = app.emit("stack://menu-navigate", page);
                    update_navigate_checks(app, page);
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            commands::library_commands::scan_folder,
            commands::library_commands::add_watched_folder,
            commands::library_commands::add_project_folder,
            commands::library_commands::remove_watched_folder,
            commands::library_commands::get_watched_folders,
            commands::library_commands::get_scan_progress,
            commands::library_commands::cancel_scan,
            commands::library_commands::run_reconciliation,
            commands::library_commands::clean_cache,
            commands::library_commands::hard_clean_cache,
            commands::library_commands::get_library_tree,
            commands::library_commands::get_folder_info,
            commands::library_commands::get_project_info,
            commands::library_commands::move_library_folder,
            commands::asset_commands::search_assets,
            commands::asset_commands::get_asset,
            commands::asset_commands::asset_exists,
            commands::asset_commands::toggle_favorite,
            commands::asset_commands::add_tag,
            commands::asset_commands::remove_tag,
            commands::asset_commands::increment_play_count,
            commands::asset_commands::get_waveform,
            commands::asset_commands::get_midi_notes,
            commands::asset_commands::get_facet_counts,
            commands::asset_commands::find_similar,
            commands::pack_commands::get_packs,
            commands::pack_commands::get_pack,
            commands::pack_commands::set_pack_color,
            commands::pack_commands::get_pack_assets,
            commands::pack_commands::get_pack_cover,
            commands::pack_commands::set_pack_artwork,
            commands::pack_commands::clear_pack_artwork,
            commands::pack_commands::get_pack_description,
            commands::pack_commands::set_pack_description,
            commands::pack_commands::delete_pack,
            commands::pack_commands::rescan_pack,
            commands::player_commands::decode_audio,
            commands::drag_commands::get_drag_icon,
            commands::drag_commands::get_drag_icon_for_pack,
            commands::drag_commands::save_export,
            commands::settings_commands::get_settings,
            commands::settings_commands::update_settings,
            commands::settings_commands::sync_autostart,
            commands::plugin_commands::scan_plugins,
            commands::project_commands::open_project_in_daw,
            commands::project_commands::open_with_default_app,
            commands::url_image_commands::fetch_url_image,
            commands::update_commands::check_for_update,
            close_overlay,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
