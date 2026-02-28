
// Temporarily disable windows_subsystem for debugging
// #![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    // Initialize logger
    env_logger::Builder::from_env(env_logger::Env::default().default_filter_or("info"))
        .init();
    markpad_lib::run()
}
