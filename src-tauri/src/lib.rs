//! Markpad's Rust backend. `app::run` builds the Tauri app; `commands`,
//! `window_runtime` and `tab_transfer` hold what the frontend can `invoke`.

mod app;
mod asset_protocol;
mod commands;
mod connector;
mod error;
mod fs_safety;
mod highlight;
mod local_commands;
mod markdown;
mod pdf;
mod semantic;
mod tab_transfer;
mod window_runtime;

pub use app::run;
