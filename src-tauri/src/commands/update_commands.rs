fn is_newer(latest: &str, current: &str) -> bool {
    let parse = |v: &str| -> (u32, u32, u32) {
        let mut parts = v.splitn(3, '.');
        let n = |s: Option<&str>| s.and_then(|x| x.parse::<u32>().ok()).unwrap_or(0);
        (n(parts.next()), n(parts.next()), n(parts.next()))
    };
    parse(latest) > parse(current)
}

#[tauri::command]
pub async fn check_for_update() -> Result<Option<String>, String> {
    let client = reqwest::Client::builder()
        .user_agent(format!("stack-desktop/{}", env!("CARGO_PKG_VERSION")))
        .timeout(std::time::Duration::from_secs(5))
        .build()
        .map_err(|e| e.to_string())?;

    let resp = client
        .get("https://api.github.com/repos/swendlcode/stack-desktop/releases/latest")
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !resp.status().is_success() {
        return Ok(None);
    }

    let json: serde_json::Value = resp.json().await.map_err(|e| e.to_string())?;
    let tag = json["tag_name"]
        .as_str()
        .unwrap_or("")
        .trim_start_matches('v')
        .to_string();

    if tag.is_empty() {
        return Ok(None);
    }

    let current = env!("CARGO_PKG_VERSION");
    if is_newer(&tag, current) {
        Ok(Some(tag))
    } else {
        Ok(None)
    }
}
