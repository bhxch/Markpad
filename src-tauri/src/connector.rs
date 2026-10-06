//! dev-connector 插件接线（自 lib.rs 撤出，源 lib.rs:1022-1023 与 :1068-1073）。
//!
//! 调用点（lib.rs 的 `run()`/`setup()`）不再散布 `#[cfg(feature = "dev-connector")]`：
//! 非 dev-connector 构建下 `init_plugin` 直接透传 builder、`register_capability` 为空操作。

/// 挂接 tauri-plugin-connector。
///
/// dev-connector 构建下在 builder 上追加插件；否则原样透传。
pub fn init_plugin(builder: tauri::Builder<tauri::Wry>) -> tauri::Builder<tauri::Wry> {
    #[cfg(feature = "dev-connector")]
    let builder = builder.plugin(tauri_plugin_connector::init());
    builder
}

/// 注册 dev-connector capability（include `capabilities-dev/dev-connector.json`）。
///
/// dev-connector 构建下注册运行时 capability；注册失败时 panic 阻止应用启动
/// （与原先 setup 闭包内 `?` 返回 Err 中止启动的失败语义等价，成功路径行为不变）。
pub fn register_capability(app: &tauri::AppHandle) {
    #[cfg(feature = "dev-connector")]
    {
        use tauri::Manager;
        let dev_connector_capability = include_str!("../capabilities-dev/dev-connector.json");
        app.add_capability(dev_connector_capability)
            .map_err(|e| format!("dev-connector capability: {e}"))
            .expect("dev-connector capability registration failed");
    }
    #[cfg(not(feature = "dev-connector"))]
    {
        let _ = app;
    }
}
