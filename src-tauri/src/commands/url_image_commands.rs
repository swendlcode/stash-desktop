use serde::Serialize;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FetchedImage {
    pub bytes: Vec<u8>,
    pub mime: String,
    pub source_url: String,
}

const MAX_BYTES: usize = 20 * 1024 * 1024; // 20 MB — headroom for high-res artwork
const TIMEOUT_SECS: u64 = 20;

/// Fetches an image referenced by `url`. If `url` points directly at an image
/// we return its bytes. If it points at an HTML page, we scan for an
/// `og:image` / `twitter:image` meta tag and follow it.
#[tauri::command]
pub async fn fetch_url_image(url: String) -> Result<FetchedImage, String> {
    let client = reqwest::Client::builder()
        .user_agent("StackArtworkFetcher/1.0")
        .timeout(std::time::Duration::from_secs(TIMEOUT_SECS))
        .build()
        .map_err(|e| format!("client build failed: {e}"))?;

    let res = client
        .get(&url)
        .send()
        .await
        .map_err(|e| format!("fetch failed: {e}"))?;
    if !res.status().is_success() {
        return Err(format!("HTTP {}", res.status()));
    }

    let ct = header_lower(&res, "content-type");
    if ct.starts_with("image/") {
        return read_image(res, &url).await;
    }

    if ct.starts_with("text/html") || ct.is_empty() {
        let body = res.text().await.map_err(|e| format!("body read failed: {e}"))?;
        let img_ref = extract_image_ref(&body)
            .ok_or_else(|| "No image found on page (missing og:image / twitter:image).".to_string())?;
        let resolved = resolve_url(&img_ref, &url);

        let res2 = client
            .get(&resolved)
            .send()
            .await
            .map_err(|e| format!("image fetch failed: {e}"))?;
        if !res2.status().is_success() {
            return Err(format!("HTTP {} fetching og:image", res2.status()));
        }
        let ct2 = header_lower(&res2, "content-type");
        if !ct2.starts_with("image/") {
            return Err(format!("og:image returned {ct2} (not an image)"));
        }
        return read_image(res2, &resolved).await;
    }

    Err(format!("Unsupported content type: {ct}"))
}

fn header_lower(res: &reqwest::Response, name: &str) -> String {
    res.headers()
        .get(name)
        .and_then(|v| v.to_str().ok())
        .unwrap_or("")
        .split(';')
        .next()
        .unwrap_or("")
        .trim()
        .to_lowercase()
}

async fn read_image(res: reqwest::Response, src: &str) -> Result<FetchedImage, String> {
    let mime = header_lower(&res, "content-type");
    let bytes = res.bytes().await.map_err(|e| format!("body read failed: {e}"))?;
    if bytes.len() > MAX_BYTES {
        return Err(format!("Image too large ({} bytes, limit {MAX_BYTES}).", bytes.len()));
    }
    Ok(FetchedImage {
        bytes: bytes.to_vec(),
        mime,
        source_url: src.to_string(),
    })
}

/// Scans HTML for `og:image` or `twitter:image`, in either attribute order.
fn extract_image_ref(html: &str) -> Option<String> {
    let patterns = [
        r#"(?is)<meta\s+[^>]*property\s*=\s*["'](?:og:image|og:image:secure_url|twitter:image)["'][^>]*content\s*=\s*["']([^"']+)["']"#,
        r#"(?is)<meta\s+[^>]*content\s*=\s*["']([^"']+)["'][^>]*property\s*=\s*["'](?:og:image|og:image:secure_url|twitter:image)["']"#,
        r#"(?is)<meta\s+[^>]*name\s*=\s*["']twitter:image["'][^>]*content\s*=\s*["']([^"']+)["']"#,
        r#"(?is)<meta\s+[^>]*content\s*=\s*["']([^"']+)["'][^>]*name\s*=\s*["']twitter:image["']"#,
    ];
    for p in patterns {
        if let Ok(re) = regex::Regex::new(p) {
            if let Some(m) = re.captures(html) {
                if let Some(g) = m.get(1) {
                    return Some(g.as_str().to_string());
                }
            }
        }
    }
    None
}

/// Minimal relative → absolute URL resolver. Handles `http(s)://`, `//host`,
/// `/path`, and falls back to concatenation for other relatives.
fn resolve_url(found: &str, base: &str) -> String {
    if found.starts_with("http://") || found.starts_with("https://") {
        return found.to_string();
    }
    if found.starts_with("//") {
        let scheme = if base.starts_with("https") { "https:" } else { "http:" };
        return format!("{scheme}{found}");
    }
    let scheme_end = match base.find("://") { Some(i) => i + 3, None => return found.to_string() };
    let after_scheme = &base[scheme_end..];
    let path_start = after_scheme.find('/').map(|i| scheme_end + i).unwrap_or(base.len());
    if found.starts_with('/') {
        let origin = &base[..path_start];
        return format!("{origin}{found}");
    }
    // relative: strip query/hash from base, then trim to last '/'
    let base_clean = base
        .split_once('?').map(|(a, _)| a).unwrap_or(base)
        .split_once('#').map(|(a, _)| a).unwrap_or(base);
    let cut = base_clean.rfind('/').unwrap_or(base_clean.len());
    format!("{}/{found}", &base_clean[..cut])
}
