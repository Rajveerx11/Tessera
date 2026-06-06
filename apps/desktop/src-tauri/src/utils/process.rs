//! Process spawning utility helpers.

/// Configures a `Command` to spawn as a detached process without a console window on Windows.
/// On other platforms, this is a no-op.
pub fn configure_detached_process(cmd: &mut std::process::Command) {
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        // CREATE_NO_WINDOW (0x0800_0000) - run in background without console window
        // DETACHED_PROCESS (0x0000_0008) - run independently of parent process
        // CREATE_NEW_PROCESS_GROUP (0x0000_0200) - process group leader for signal isolation
        cmd.creation_flags(0x0800_0000 | 0x0000_0008 | 0x0000_0200);
    }
    #[cfg(not(windows))]
    {
        let _ = cmd;
    }
}
