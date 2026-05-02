use std::process::Command;

use crate::error::Result;

#[tauri::command]
pub async fn open_project_in_daw(project_path: String) -> Result<()> {
    tracing::info!("Opening project in DAW: {}", project_path);
    
    #[cfg(target_os = "macos")]
    {
        let output = Command::new("open")
            .arg(&project_path)
            .output()?;
        
        if !output.status.success() {
            let error = String::from_utf8_lossy(&output.stderr);
            return Err(crate::error::StackError::Other(format!(
                "Failed to open project: {}", error
            )));
        }
    }
    
    #[cfg(target_os = "windows")]
    {
        let output = Command::new("cmd")
            .args(["/C", "start", "", &project_path])
            .output()?;
        
        if !output.status.success() {
            let error = String::from_utf8_lossy(&output.stderr);
            return Err(crate::error::StackError::Other(format!(
                "Failed to open project: {}", error
            )));
        }
    }
    
    #[cfg(target_os = "linux")]
    {
        let output = Command::new("xdg-open")
            .arg(&project_path)
            .output()?;
        
        if !output.status.success() {
            let error = String::from_utf8_lossy(&output.stderr);
            return Err(crate::error::StackError::Other(format!(
                "Failed to open project: {}", error
            )));
        }
    }
    
    Ok(())
}

#[tauri::command]
pub async fn open_with_default_app(path: String) -> Result<()> {
    tracing::info!("Opening with default app: {}", path);
    
    #[cfg(target_os = "macos")]
    {
        Command::new("open").arg(&path).spawn()?;
    }
    
    #[cfg(target_os = "windows")]
    {
        Command::new("cmd")
            .args(["/C", "start", "", &path])
            .spawn()?;
    }
    
    #[cfg(target_os = "linux")]
    {
        Command::new("xdg-open").arg(&path).spawn()?;
    }
    
    Ok(())
}