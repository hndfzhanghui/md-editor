use tauri::Manager;

// 收集启动时的命令行文件参数（跳过 exe 自身路径和 - 开头的 flag）
// Windows 双击关联文件时，系统会把文件路径作为命令行参数传给 exe
fn collect_launch_files() -> Vec<String> {
  std::env::args()
    .skip(1)
    .filter(|a| !a.starts_with('-'))
    .collect()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  let launch_files = collect_launch_files();

  let mut builder = tauri::Builder::default();

  // 单实例：若程序已在运行，再次启动会把命令行参数转发给已存在的窗口
  // 这样双击 md 文件时会在原窗口打开，而不是新开窗口
  #[cfg(desktop)]
  {
    builder = builder.plugin(tauri_plugin_single_instance::init(|app, args, _cwd| {
      let files: Vec<String> = args.into_iter().skip(1).filter(|a| !a.starts_with('-')).collect();
      // 第二次双击：先把路径加入 fs scope，再用 eval 调用前端的加载函数
      use tauri_plugin_fs::FsExt;
      if let Some(path) = files.first() {
        let _ = app.fs_scope().allow_file(path);
        let escaped = path.replace('\\', "\\\\").replace('"', "\\\"");
        let _ = app
          .get_webview_window("main")
          .map(|w| w.eval(&format!("window.__openExternal && window.__openExternal(\"{escaped}\")")));
      }
      let _ = app.get_webview_window("main").map(|w| w.set_focus());
    }));
  }

  builder
    .plugin(tauri_plugin_dialog::init())
    .plugin(tauri_plugin_fs::init())
    .setup(move |app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }
      // 把启动文件路径加入 fs scope，否则前端 readFile 会被拒绝（forbidden path）
      // 对话框打开的文件会自动加入 scope，但命令行/双击传入的路径不会
      use tauri_plugin_fs::FsExt;
      for f in &launch_files {
        let _ = app.fs_scope().allow_file(f);
      }
      // setup 时主窗口刚创建，立即 eval 注入全局变量 window.__openedFiles
      // 这发生在前端 JS 脚本执行之前，因此前端读取时一定存在（无时序竞争）
      if !launch_files.is_empty() {
        let files_js = launch_files
          .iter()
          .map(|f| format!("\"{}\"", f.replace('\\', "\\\\").replace('"', "\\\"")))
          .collect::<Vec<_>>()
          .join(",");
        if let Some(window) = app.get_webview_window("main") {
          let _ = window.eval(&format!("window.__openedFiles = [{files_js}];"));
        }
      }
      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
