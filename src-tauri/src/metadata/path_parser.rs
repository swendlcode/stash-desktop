use std::path::Path;

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct PathMetadata {
    pub pack_name: Option<String>,
    pub vendor: Option<String>,
    pub genre: Option<String>,
    pub category: Option<String>,
    pub subtype: Option<String>,
}

// Multi-word genres come BEFORE their single-word counterparts so the longest
// match wins (e.g. "afro house" before "house", "deep house" before "house").
const GENRES: &[&str] = &[
    // ── Compound house genres (must come before "house") ──────────────────
    "nu disco", "afro house", "afrohouse", "deep house", "deephouse",
    "tech house", "techhouse", "bass house", "basshouse", "future house",
    "slap house", "progressive house",
    // ── House root ────────────────────────────────────────────────────────
    "house",
    // ── Other electronic ─────────────────────────────────────────────────
    "techno", "minimal", "trance", "psytrance", "hardstyle", "hardcore",
    "hard dance", "big room", "edm", "electro", "synthwave", "vaporwave",
    "chillhop", "lofi", "lo-fi", "lo_fi", "ambient", "drone",
    // ── Bass music ────────────────────────────────────────────────────────
    "future bass", "color bass", "wave", "trap soul", "trap",
    "drum and bass", "dnb", "liquid", "neuro", "neurofunk",
    "dubstep", "riddim", "tearout",
    "uk garage", "garage", "breakbeat", "breakcore", "jungle",
    "glitch hop", "phonk", "drill", "hyperpop",
    // ── Hip hop / RnB ─────────────────────────────────────────────────────
    "hiphop", "hip-hop", "boom bap", "rnb", "r&b", "soul",
    // ── Latin / Afro / World ─────────────────────────────────────────────
    "amapiano", "kuduro", "afrobeat", "afro",
    "reggaeton", "moombahton", "dancehall", "reggae",
    "latin", "salsa", "merengue", "bachata", "cumbia",
    "world", "ethnic", "oriental", "arabic", "turkish", "persian", "indian", "tribal",
    // ── Disco / Funk / Jazz ──────────────────────────────────────────────
    "disco", "funk", "jazz", "fusion",
    // ── Pop / Rock ────────────────────────────────────────────────────────
    "pop", "rock", "indie", "metal", "punk", "country",
    // ── Cinematic ─────────────────────────────────────────────────────────
    "orchestral", "cinematic", "trailer", "score", "film",
];

// CATEGORY_MAP uses `seg == k || seg.contains(k)` — so multi-word phrases
// match as folder-name substrings. Order more specific BEFORE more generic
// so "electric piano" wins over "piano".
const CATEGORY_MAP: &[(&str, &str)] = &[
    // ── Specific keyboard / guitar variants (before generic) ──────────────
    ("electric piano", "piano"),
    ("electric guitar", "guitar"),
    ("acoustic guitar", "guitar"),
    ("acoustic piano", "piano"),
    ("brass and woodwinds", "brass"),
    ("brass & woodwinds", "brass"),
    ("woodwinds", "wind"),
    ("woodwind", "wind"),
    // ── Drums & percussion ────────────────────────────────────────────────
    ("drum_loops", "drum"),
    ("drum loops", "drum"),
    ("drums", "drum"),
    ("percussion", "drum"),
    ("kicks", "drum"),
    ("snares", "drum"),
    ("hats", "drum"),
    ("hi-hats", "drum"),
    ("hihats", "drum"),
    ("claps", "drum"),
    ("toms", "drum"),
    ("cymbals", "drum"),
    ("crashes", "drum"),
    ("rides", "drum"),
    ("rims", "drum"),
    ("shakers", "drum"),
    ("tambourines", "drum"),
    ("cowbells", "drum"),
    ("congas", "drum"),
    ("bongos", "drum"),
    ("bells", "drum"),
    ("snaps", "drum"),
    ("agogo", "drum"),
    ("agogos", "drum"),
    ("claves", "drum"),
    ("timbales", "drum"),
    ("xylophone", "drum"),
    ("mallets", "drum"),
    ("guiro", "drum"),
    ("gong", "drum"),
    ("gongs", "drum"),
    ("cajon", "drum"),
    ("tops", "drum"),
    ("grooves", "drum"),
    ("groove", "drum"),
    // ── Vocals ────────────────────────────────────────────────────────────
    ("vocals", "vocal"),
    ("vocal", "vocal"),
    ("hooks", "vocal"),
    ("ad-libs", "vocal"),
    ("adlibs", "vocal"),
    ("ad libs", "vocal"),
    ("phrases", "vocal"),
    ("shouts", "vocal"),
    ("chops", "vocal"),
    ("harmonies", "vocal"),
    // ── FX / atmosphere ───────────────────────────────────────────────────
    ("fx", "fx"),
    ("effects", "fx"),
    ("atmospheres", "fx"),
    ("ambiences", "fx"),
    ("ambience", "fx"),
    ("risers", "fx"),
    ("downers", "fx"),
    ("impacts", "fx"),
    ("transitions", "fx"),
    ("lasers", "fx"),
    ("noises", "fx"),
    // ── One-shots / loops ────────────────────────────────────────────────
    ("one_shots", "one_shot"),
    ("one shots", "one_shot"),
    ("oneshots", "one_shot"),
    ("loops", "loop"),
    ("midi", "midi"),
    ("presets", "preset"),
    // ── Bass ──────────────────────────────────────────────────────────────
    ("bass", "bass"),
    // ── Synths / melodic ─────────────────────────────────────────────────
    ("synths", "synth"),
    ("synth", "synth"),
    ("pads", "pad"),
    ("leads", "lead"),
    ("keys", "keys"),
    ("plucks", "pluck"),
    ("stabs", "synth"),
    ("chords", "chord"),
    ("arps", "arp"),
    ("melodies", "synth"),
    ("melody", "synth"),
    ("songstarters", "songstarter"),
    ("songstarter", "songstarter"),
    // ── Strings / brass / piano (after compound matches above) ────────────
    ("strings", "strings"),
    ("violins", "strings"),
    ("violin", "strings"),
    ("violas", "strings"),
    ("viola", "strings"),
    ("cellos", "strings"),
    ("cello", "strings"),
    ("trumpet", "brass"),
    ("trumpets", "brass"),
    ("horns", "brass"),
    ("brass", "brass"),
    ("organ", "keys"),
    ("organs", "keys"),
    ("piano", "piano"),
    ("guitar", "guitar"),
    ("guitars", "guitar"),
    // ── World / ethnic instruments ────────────────────────────────────────
    ("djembe", "ethnic"),
    ("ethnic", "ethnic"),
    ("world", "ethnic"),
    ("oriental", "ethnic"),
    ("arabic", "ethnic"),
    ("turkish", "ethnic"),
    ("persian", "ethnic"),
    ("indian", "ethnic"),
    ("middle east", "ethnic"),
    ("folk", "ethnic"),
    ("tribal", "ethnic"),
];

const SUBTYPE_MAP: &[(&str, &str)] = &[
    // ── Song structure ────────────────────────────────────────────────────
    ("fills", "fill"),
    ("fill", "fill"),
    ("buildup", "buildup"),
    ("buildups", "buildup"),
    ("builds", "buildup"),
    ("drops", "drop"),
    ("drop", "drop"),
    ("intro", "intro"),
    ("outro", "outro"),
    ("breaks", "break"),
    ("break", "break"),
    ("verse", "verse"),
    ("verses", "verse"),
    ("chorus", "chorus"),
    ("choruses", "chorus"),
    ("bridge", "bridge"),
    ("bridges", "bridge"),
    ("hooks", "hook"),
    ("hook", "hook"),
    // ── FX subtypes ───────────────────────────────────────────────────────
    ("risers", "riser"),
    ("riser", "riser"),
    ("downers", "downer"),
    ("downer", "downer"),
    ("downlifters", "downlifter"),
    ("downlifter", "downlifter"),
    ("uplifters", "uplifter"),
    ("uplifter", "uplifter"),
    ("transitions", "transition"),
    ("transition", "transition"),
    ("impacts", "impact"),
    ("impact", "impact"),
    ("lasers", "laser"),
    ("laser", "laser"),
    ("sweeps", "sweep"),
    ("sweep up", "sweep_up"),
    ("sweep_up", "sweep_up"),
    ("sweep down", "sweep_down"),
    ("sweep_down", "sweep_down"),
    // ── Loop / one-shot ──────────────────────────────────────────────────
    ("one shots", "oneshot"),
    ("one_shots", "oneshot"),
    ("oneshots", "oneshot"),
    ("loops", "loop"),
    // ── Drum subtypes (folder-level) ─────────────────────────────────────
    ("kicks", "kick"),
    ("snares", "snare"),
    ("claps", "clap"),
    ("hats", "hihat"),
    ("hihats", "hihat"),
    ("hi-hats", "hihat"),
    ("open hats", "open_hihat"),
    ("closed hats", "closed_hihat"),
    ("toms", "tom"),
    ("crashes", "crash"),
    ("rides", "ride"),
    ("cymbals", "cymbal"),
    ("rims", "rimshot"),
    ("snaps", "snap"),
    ("bells", "bell"),
    ("shakers", "shaker"),
    ("tambourines", "tambourine"),
    ("congas", "conga"),
    ("bongos", "bongo"),
    ("claves", "clave"),
    ("timbales", "timbale"),
    ("agogos", "agogo"),
    ("mallets", "mallet"),
    ("tops", "tops"),
    // ── Synth / melodic subtypes ─────────────────────────────────────────
    ("plucks", "pluck"),
    ("leads", "lead"),
    ("pads", "pad"),
    ("stabs", "stab"),
    ("chords", "chord"),
    ("arps", "arp"),
    ("melody", "melody"),
    ("melodies", "melody"),
    ("grooves", "groove"),
    ("groove", "groove"),
    ("songstarters", "songstarter"),
    ("songstarter", "songstarter"),
    // ── Vocal subtypes ────────────────────────────────────────────────────
    ("male", "male_vocal"),
    ("female", "female_vocal"),
    ("shouts", "shout"),
    ("phrases", "phrase"),
    ("chops", "chop"),
    ("harmonies", "harmony"),
    ("ad libs", "adlib"),
    ("ad-libs", "adlib"),
    ("adlibs", "adlib"),
    // ── Texture / character ──────────────────────────────────────────────
    ("dry", "dry"),
    ("wet", "wet"),
    ("muted", "muted"),
    ("layered", "layered"),
    ("reverse", "reverse"),
    ("reversed", "reverse"),
    ("bright", "bright"),
    ("dark", "dark"),
    ("warm", "warm"),
    ("hard", "hard"),
    ("soft", "soft"),
    ("low", "low"),
    ("high", "high"),
    ("noise", "noise"),
    ("glitch", "glitch"),
    // ── Bass subtypes ────────────────────────────────────────────────────
    ("808", "808"),
    ("subs", "sub_bass"),
    ("sub", "sub_bass"),
    ("reese", "reese"),
];

pub fn parse(file_path: &Path, pack_root: &Path) -> PathMetadata {
    let mut meta = PathMetadata::default();

    let pack_name = pack_root
        .file_name()
        .and_then(|n| n.to_str())
        .map(|s| s.to_string());
    meta.pack_name = pack_name.clone();

    if let Some(pn) = &pack_name {
        let lower = pn.to_lowercase();
        for g in GENRES {
            if lower.contains(g) {
                meta.genre = Some((*g).to_string());
                break;
            }
        }
        // vendor heuristic: first word if pack name has multiple
        let tokens: Vec<&str> = pn.split_whitespace().collect();
        if tokens.len() >= 2 {
            meta.vendor = Some(tokens[0].to_string());
        }
    }

    // Walk path segments between pack_root and file for category/subtype hints.
    if let Ok(rel) = file_path.strip_prefix(pack_root) {
        for comp in rel.components() {
            let seg = comp.as_os_str().to_string_lossy().to_lowercase();
            for (k, v) in CATEGORY_MAP {
                if seg == *k || seg.contains(*k) {
                    meta.category.get_or_insert_with(|| (*v).to_string());
                }
            }
            for (k, v) in SUBTYPE_MAP {
                if seg == *k || seg.contains(*k) {
                    meta.subtype.get_or_insert_with(|| (*v).to_string());
                }
            }
        }
    }

    meta
}
