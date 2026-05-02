use once_cell::sync::Lazy;
use regex::Regex;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ProjectFolderMeta {
    pub title: String,
    pub key_note: Option<String>,
    pub key_scale: Option<String>,
    pub alt_key_note: Option<String>,
    pub alt_key_scale: Option<String>,
    pub bpm: Option<u16>,
    /// ISO 8601 date (YYYY-MM-DD). Frontend handles display formatting.
    pub deadline: Option<String>,
}

static BPM_RE: Lazy<Regex> =
    Lazy::new(|| Regex::new(r"(?i)\b(\d{2,3})\s*bpm\b").unwrap());

static KEY_RE: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r"(?i)^\s*([A-G][#b]?)\s*(major|minor|maj|min|m)?\s*$").unwrap()
});

static DEADLINE_RE: Lazy<Regex> =
    Lazy::new(|| Regex::new(r"(?i)deadline\s+(.+)$").unwrap());

static DATE_NUMERIC_RE: Lazy<Regex> =
    Lazy::new(|| Regex::new(r"^(\d{4})-(\d{1,2})-(\d{1,2})$").unwrap());

static DATE_DMY_RE: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r"(?i)^(\d{1,2})\s+([A-Za-z]+)[,\s]+(\d{4})$").unwrap()
});

const MONTHS: &[(&str, u8)] = &[
    ("jan", 1), ("january", 1),
    ("feb", 2), ("february", 2),
    ("mar", 3), ("march", 3),
    ("apr", 4), ("april", 4),
    ("may", 5),
    ("jun", 6), ("june", 6),
    ("jul", 7), ("july", 7),
    ("aug", 8), ("august", 8),
    ("sep", 9), ("sept", 9), ("september", 9),
    ("oct", 10), ("october", 10),
    ("nov", 11), ("november", 11),
    ("dec", 12), ("december", 12),
];

pub fn parse(folder_name: &str) -> ProjectFolderMeta {
    let segments: Vec<&str> = folder_name.split(" - ").map(str::trim).collect();
    let mut meta = ProjectFolderMeta::default();
    let mut title_end = 1usize;

    for (idx, seg) in segments.iter().enumerate().skip(1) {
        if let Some(caps) = DEADLINE_RE.captures(seg) {
            let raw = caps.get(1).map(|m| m.as_str().trim()).unwrap_or("");
            if let Some(iso) = parse_date(raw) {
                meta.deadline = Some(iso);
            }
            continue;
        }

        if let Some(caps) = BPM_RE.captures(seg) {
            if let Some(n) = caps.get(1).and_then(|m| m.as_str().parse::<u16>().ok()) {
                meta.bpm = Some(n);
            }
            continue;
        }

        if let Some((note, scale)) = parse_key_segment(seg) {
            if meta.key_note.is_none() {
                meta.key_note = Some(note);
                meta.key_scale = scale;
            } else if meta.alt_key_note.is_none() {
                meta.alt_key_note = Some(note);
                meta.alt_key_scale = scale;
            }
            continue;
        }

        // Segment didn't match any field — extend the title to absorb it,
        // so titles containing " - " survive (e.g. "Foo - Bar - 128BPM").
        if meta.key_note.is_none()
            && meta.bpm.is_none()
            && meta.deadline.is_none()
        {
            title_end = idx + 1;
        }
    }

    meta.title = segments[..title_end].join(" - ").trim().to_string();
    if meta.title.is_empty() {
        meta.title = folder_name.to_string();
    }
    meta
}

fn parse_key_segment(seg: &str) -> Option<(String, Option<String>)> {
    let caps = KEY_RE.captures(seg)?;
    let note = caps.get(1)?.as_str();
    let note_norm = normalize_note(note);
    let scale = caps.get(2).map(|m| normalize_scale(m.as_str()));
    Some((note_norm, scale))
}

fn normalize_note(note: &str) -> String {
    let mut chars = note.chars();
    let head = chars.next().unwrap().to_ascii_uppercase();
    let rest: String = chars.collect();
    format!("{}{}", head, rest)
}

fn normalize_scale(s: &str) -> String {
    match s.to_ascii_lowercase().as_str() {
        "maj" | "major" => "major".to_string(),
        "min" | "m" | "minor" => "minor".to_string(),
        other => other.to_string(),
    }
}

fn parse_date(s: &str) -> Option<String> {
    let s = s.trim().trim_end_matches(',').trim();

    if let Some(caps) = DATE_NUMERIC_RE.captures(s) {
        let y = caps.get(1)?.as_str().parse::<i32>().ok()?;
        let m = caps.get(2)?.as_str().parse::<u8>().ok()?;
        let d = caps.get(3)?.as_str().parse::<u8>().ok()?;
        if (1..=12).contains(&m) && (1..=31).contains(&d) {
            return Some(format!("{:04}-{:02}-{:02}", y, m, d));
        }
    }

    if let Some(caps) = DATE_DMY_RE.captures(s) {
        let d = caps.get(1)?.as_str().parse::<u8>().ok()?;
        let mon_name = caps.get(2)?.as_str().to_ascii_lowercase();
        let y = caps.get(3)?.as_str().parse::<i32>().ok()?;
        let m = MONTHS
            .iter()
            .find(|(name, _)| *name == mon_name)
            .map(|(_, n)| *n)?;
        if (1..=31).contains(&d) {
            return Some(format!("{:04}-{:02}-{:02}", y, m, d));
        }
    }

    None
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_full_format() {
        let meta = parse("Promise - A# min - Gmin - 128BPM - Deadline 23 Sep, 2023");
        assert_eq!(meta.title, "Promise");
        assert_eq!(meta.key_note.as_deref(), Some("A#"));
        assert_eq!(meta.key_scale.as_deref(), Some("minor"));
        assert_eq!(meta.alt_key_note.as_deref(), Some("G"));
        assert_eq!(meta.alt_key_scale.as_deref(), Some("minor"));
        assert_eq!(meta.bpm, Some(128));
        assert_eq!(meta.deadline.as_deref(), Some("2023-09-23"));
    }

    #[test]
    fn title_only() {
        let meta = parse("Promise");
        assert_eq!(meta.title, "Promise");
        assert!(meta.bpm.is_none());
        assert!(meta.key_note.is_none());
    }

    #[test]
    fn title_with_dashes_survives() {
        let meta = parse("My - Cool - Track - 140 BPM");
        assert_eq!(meta.title, "My - Cool - Track");
        assert_eq!(meta.bpm, Some(140));
    }

    #[test]
    fn key_variants() {
        let meta = parse("Track - C#maj - 120BPM");
        assert_eq!(meta.title, "Track");
        assert_eq!(meta.key_note.as_deref(), Some("C#"));
        assert_eq!(meta.key_scale.as_deref(), Some("major"));
        assert_eq!(meta.bpm, Some(120));
    }

    #[test]
    fn key_no_scale() {
        let meta = parse("Track - F# - 100BPM");
        assert_eq!(meta.key_note.as_deref(), Some("F#"));
        assert_eq!(meta.key_scale, None);
        assert_eq!(meta.bpm, Some(100));
    }

    #[test]
    fn deadline_iso_input() {
        let meta = parse("Track - Deadline 2024-01-15");
        assert_eq!(meta.deadline.as_deref(), Some("2024-01-15"));
    }

    #[test]
    fn deadline_no_comma() {
        let meta = parse("Track - Deadline 5 March 2024");
        assert_eq!(meta.deadline.as_deref(), Some("2024-03-05"));
    }

    #[test]
    fn bpm_with_space() {
        let meta = parse("Track - 90 BPM");
        assert_eq!(meta.bpm, Some(90));
    }

    #[test]
    fn empty_string() {
        let meta = parse("");
        assert_eq!(meta.title, "");
    }

    #[test]
    fn lowercase_key() {
        let meta = parse("Track - a# min");
        assert_eq!(meta.key_note.as_deref(), Some("A#"));
        assert_eq!(meta.key_scale.as_deref(), Some("minor"));
    }
}
