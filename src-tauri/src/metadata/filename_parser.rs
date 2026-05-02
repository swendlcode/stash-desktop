use once_cell::sync::Lazy;
use regex::Regex;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct FilenameMetadata {
    pub bpm: Option<f32>,
    pub key_note: Option<String>,
    pub key_scale: Option<String>,
    pub instrument: Option<String>,
    pub subtype: Option<String>,
    pub pack_code: Option<String>,
    pub confidence: f32,
    /// Energy level: "high" | "low" | None
    pub energy_level: Option<String>,
    /// Texture: "organic" | "synthetic" | None
    pub texture: Option<String>,
    /// Space: "dry" | "wet" | None
    pub space: Option<String>,
    /// Role: "foundation" | "top_end" | "ear_candy" | None
    pub role: Option<String>,
}

// BPM patterns in priority order - most specific first
static BPM_WITH_LABEL_RE: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r"(?i)(\d{2,3})\s*bpm(?:[_\-\s\.\)\]\}]|$)").unwrap()  // 120bpm / 120 bpm / (120 BPM)
});

static BPM_LABEL_FIRST_RE: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r"(?i)bpm[_\-\s]*(\d{2,3})").unwrap()  // bpm120 / bpm_120
});

static BPM_STANDALONE_RE: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r"(?:^|[_\-\s\.\(\[\{])(\d{2,3})(?:[_\-\s\.\)\]\}]|$)").unwrap()  // _120_ / (120)
});

// matches Cmaj, gm, F#min, Bb, Abmaj, Ebm etc. preceded by _ or - or ( or [ or {
static KEY_RE: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r"(?i)(?:^|[_\-\s\(\[\{])([A-G][b#]?)(maj|min|m)?(?:[_\-\s\.\)\]\}]|$)").unwrap()
});

/// Maps a filename token to a normalized instrument category.
const INSTRUMENT_TOKENS: &[(&str, &str)] = &[
    // ── Short preset prefixes ──────────────────────────────────────────────
    ("bs", "bass"),
    ("pl", "pluck"),
    ("plk", "pluck"),
    ("ld", "lead"),
    ("pd", "pad"),
    ("ch", "chord"),
    ("chd", "chord"),
    ("arp", "arp"),
    ("dr", "drum"),
    ("drm", "drum"),
    ("vox", "vocal"),
    ("vc", "vocal"),
    ("ky", "keys"),
    ("pn", "piano"),
    // ── World / Ethnic instruments ─────────────────────────────────────────
    ("kaval", "ethnic"),
    ("ney", "ethnic"),
    ("nay", "ethnic"),
    ("baglama", "ethnic"),
    ("saz", "ethnic"),
    ("kamanche", "ethnic"),
    ("kemanche", "ethnic"),
    ("oud", "ethnic"),
    ("ud", "ethnic"),
    ("darbuka", "ethnic"),
    ("doumbek", "ethnic"),
    ("tabla", "ethnic"),
    ("sitar", "ethnic"),
    ("sarod", "ethnic"),
    ("santoor", "ethnic"),
    ("santur", "ethnic"),
    ("duduk", "ethnic"),
    ("zurna", "ethnic"),
    ("rebab", "ethnic"),
    ("kemenche", "ethnic"),
    ("kanun", "ethnic"),
    ("qanun", "ethnic"),
    ("bendir", "ethnic"),
    ("riq", "ethnic"),
    ("def", "ethnic"),
    ("daf", "ethnic"),
    ("tar", "ethnic"),
    ("setar", "ethnic"),
    ("balaban", "ethnic"),
    ("mey", "ethnic"),
    ("tulum", "ethnic"),
    ("gaida", "ethnic"),
    ("kora", "ethnic"),
    ("mbira", "ethnic"),
    ("kalimba", "ethnic"),
    ("djembe", "ethnic"),
    ("cajon", "ethnic"),
    ("berimbau", "ethnic"),
    ("cuica", "ethnic"),
    ("pandeiro", "ethnic"),
    ("gamelan", "ethnic"),
    ("shamisen", "ethnic"),
    ("koto", "ethnic"),
    ("erhu", "ethnic"),
    ("pipa", "ethnic"),
    ("guzheng", "ethnic"),
    ("taiko", "ethnic"),
    ("didgeridoo", "ethnic"),
    ("bagpipe", "ethnic"),
    ("hurdy", "ethnic"),
    ("bouzouki", "ethnic"),
    ("mandolin", "ethnic"),
    ("banjo", "ethnic"),
    ("ukulele", "ethnic"),
    ("charango", "ethnic"),
    ("cuatro", "ethnic"),
    ("tiple", "ethnic"),
    ("vihuela", "ethnic"),
    ("lute", "ethnic"),
    ("uskup", "ethnic"),   // common in Turkish sample pack names
    ("turkish", "ethnic"),
    ("arabic", "ethnic"),
    ("persian", "ethnic"),
    ("indian", "ethnic"),
    ("oriental", "ethnic"),
    ("middle", "ethnic"),  // "middle eastern"
    ("eastern", "ethnic"),
    ("ethnic", "ethnic"),
    ("world", "ethnic"),
    ("folk", "ethnic"),
    ("tribal", "ethnic"),
    // ── Drums / Percussion ─────────────────────────────────────────────────
    ("kick", "drum"),
    ("kck", "drum"),
    ("kik", "drum"),
    ("bd", "drum"),          // bass drum
    ("snare", "drum"),
    ("snr", "drum"),
    ("sn", "drum"),
    ("clap", "drum"),
    ("clp", "drum"),
    ("cp", "drum"),
    ("hat", "drum"),
    ("hihat", "drum"),
    ("hi-hat", "drum"),
    ("hh", "drum"),
    ("ohh", "drum"),         // open hi-hat
    ("chh", "drum"),         // closed hi-hat
    ("rim", "drum"),
    ("rimshot", "drum"),
    ("tom", "drum"),
    ("ht", "drum"),          // high tom
    ("mt", "drum"),          // mid tom
    ("lt", "drum"),          // low tom
    ("crash", "drum"),
    ("ride", "drum"),
    ("cymbal", "drum"),
    ("cym", "drum"),
    ("perc", "drum"),
    ("percussion", "drum"),
    ("shaker", "drum"),
    ("tambourine", "drum"),
    ("cowbell", "drum"),
    ("conga", "drum"),
    ("bongo", "drum"),
    ("drum", "drum"),
    ("drums", "drum"),
    // ── Bass ──────────────────────────────────────────────────────────────
    ("bass", "bass"),
    ("sub", "bass"),
    ("808", "bass"),
    ("subbass", "bass"),
    ("reese", "bass"),
    ("wobble", "bass"),
    // ── Synth / Lead / Pad ────────────────────────────────────────────────
    ("synth", "synth"),
    ("stab", "synth"),
    ("lead", "lead"),
    ("pad", "pad"),
    ("atmo", "pad"),
    ("atmosphere", "pad"),
    ("texture", "pad"),
    ("drone", "pad"),
    ("pluck", "pluck"),
    ("chord", "chord"),
    ("chords", "chord"),
    ("arp", "arp"),
    ("arpeggiated", "arp"),
    // ── Keys / Piano ──────────────────────────────────────────────────────
    ("piano", "piano"),
    ("epiano", "piano"),
    ("e-piano", "piano"),
    ("rhodes", "piano"),
    ("wurlitzer", "piano"),
    ("key", "keys"),
    ("keys", "keys"),
    ("organ", "keys"),
    ("clav", "keys"),
    ("clavinet", "keys"),
    ("harpsichord", "keys"),
    // ── Guitar / Strings ──────────────────────────────────────────────────
    ("guitar", "guitar"),
    ("gtr", "guitar"),
    ("acoustic", "guitar"),
    ("elec", "guitar"),
    ("strings", "strings"),
    ("violin", "strings"),
    ("viola", "strings"),
    ("cello", "strings"),
    ("orchestra", "strings"),
    ("orch", "strings"),
    // ── Brass / Wind ──────────────────────────────────────────────────────
    ("brass", "brass"),
    ("horn", "brass"),
    ("trumpet", "brass"),
    ("trombone", "brass"),
    ("sax", "brass"),
    ("saxophone", "brass"),
    ("flute", "wind"),
    ("clarinet", "wind"),
    ("oboe", "wind"),
    // ── Vocal ─────────────────────────────────────────────────────────────
    ("vocal", "vocal"),
    ("vocals", "vocal"),
    ("vox", "vocal"),
    ("voice", "vocal"),
    ("choir", "vocal"),
    ("chant", "vocal"),
    ("adlib", "vocal"),
    ("ad-lib", "vocal"),
    ("hook", "vocal"),
    ("rap", "vocal"),
    ("spoken", "vocal"),
    // ── FX ────────────────────────────────────────────────────────────────
    ("fx", "fx"),
    ("sfx", "fx"),
    ("riser", "fx"),
    ("sweep", "fx"),
    ("impact", "fx"),
    ("foley", "fx"),
    ("noise", "fx"),
    ("glitch", "fx"),
    ("transition", "fx"),
    ("downlifter", "fx"),
    ("uplifter", "fx"),
    ("reverse", "fx"),
    ("reversed", "fx"),
    ("rev", "fx"),
    ("ambience", "fx"),
    ("ambient", "fx"),
    ("atmos", "fx"),
    ("texture", "fx"),
    ("field", "fx"),
    ("laser", "fx"),
    ("lasers", "fx"),
    ("zap", "fx"),
    ("zaps", "fx"),
    ("downer", "fx"),
    ("downers", "fx"),
    // ── Drum / Percussion plurals + extras ─────────────────────────────────
    ("kicks", "drum"),
    ("snares", "drum"),
    ("claps", "drum"),
    ("hats", "drum"),
    ("hihats", "drum"),
    ("toms", "drum"),
    ("cymbals", "drum"),
    ("rides", "drum"),
    ("crashes", "drum"),
    ("rims", "drum"),
    ("rimshots", "drum"),
    ("shakers", "drum"),
    ("tambourines", "drum"),
    ("cowbells", "drum"),
    ("congas", "drum"),
    ("bongos", "drum"),
    ("snap", "drum"),
    ("snaps", "drum"),
    ("bell", "drum"),
    ("bells", "drum"),
    ("gong", "drum"),
    ("gongs", "drum"),
    ("agogo", "drum"),
    ("agogos", "drum"),
    ("clave", "drum"),
    ("claves", "drum"),
    ("timbale", "drum"),
    ("timbales", "drum"),
    ("xylophone", "drum"),
    ("xylo", "drum"),
    ("mallet", "drum"),
    ("mallets", "drum"),
    ("guiro", "drum"),
    ("triangle", "drum"),
    ("woodblock", "drum"),
    ("vibe", "drum"),
    ("vibes", "drum"),
    ("tops", "drum"),
    // ── Synth / Melodic plurals + melody/grooves ───────────────────────────
    ("melody", "synth"),
    ("melodies", "synth"),
    ("synths", "synth"),
    ("plucks", "pluck"),
    ("leads", "lead"),
    ("pads", "pad"),
    ("stabs", "synth"),
    ("arps", "arp"),
    ("groove", "synth"),
    ("grooves", "synth"),
    ("songstarter", "synth"),
    ("songstarters", "synth"),
    // ── Keys variants ──────────────────────────────────────────────────────
    ("ep", "piano"),
    ("wurli", "piano"),
    ("organs", "keys"),
    // ── Wind / brass extras ────────────────────────────────────────────────
    ("woodwind", "wind"),
    ("woodwinds", "wind"),
    ("horns", "brass"),
    ("trumpets", "brass"),
    ("saxes", "brass"),
    ("flutes", "wind"),
    // ── Strings extras ─────────────────────────────────────────────────────
    ("violins", "strings"),
    ("violas", "strings"),
    ("cellos", "strings"),
    ("guitars", "guitar"),
    // ── Vocal extras ───────────────────────────────────────────────────────
    ("male", "vocal"),
    ("female", "vocal"),
    ("shout", "vocal"),
    ("shouts", "vocal"),
    ("phrase", "vocal"),
    ("phrases", "vocal"),
    ("chop", "vocal"),
    ("chops", "vocal"),
    ("harmony", "vocal"),
    ("harmonies", "vocal"),
    ("hooks", "vocal"),
    ("adlibs", "vocal"),
    // ── FX plurals ─────────────────────────────────────────────────────────
    ("risers", "fx"),
    ("impacts", "fx"),
    ("downlifters", "fx"),
    ("uplifters", "fx"),
    ("transitions", "fx"),
    ("ambiences", "fx"),
    ("atmospheres", "pad"),
    ("textures", "fx"),
];

/// Maps a filename token to a normalized subtype (more specific than instrument).
/// These are stored in the `subtype` column and used for fine-grained filtering.
const SUBTYPE_TOKENS: &[(&str, &str)] = &[
    // ── Loop / One-shot ───────────────────────────────────────────────────
    ("loop", "loop"),
    ("loops", "loop"),
    ("oneshot", "oneshot"),
    ("one_shot", "oneshot"),
    ("one-shot", "oneshot"),
    ("shot", "oneshot"),
    ("hit", "oneshot"),
    // ── Drum subtypes ─────────────────────────────────────────────────────
    ("kick", "kick"),
    ("kck", "kick"),
    ("kik", "kick"),
    ("bd", "kick"),
    ("snare", "snare"),
    ("snr", "snare"),
    ("sn", "snare"),
    ("clap", "clap"),
    ("clp", "clap"),
    ("cp", "clap"),
    ("hihat", "hihat"),
    ("hi-hat", "hihat"),
    ("hat", "hihat"),
    ("hh", "hihat"),
    ("ohh", "open_hihat"),
    ("openhat", "open_hihat"),
    ("open_hat", "open_hihat"),
    ("chh", "closed_hihat"),
    ("closedhat", "closed_hihat"),
    ("closed_hat", "closed_hihat"),
    ("rim", "rimshot"),
    ("rimshot", "rimshot"),
    ("tom", "tom"),
    ("ht", "tom"),
    ("mt", "tom"),
    ("lt", "tom"),
    ("crash", "crash"),
    ("ride", "ride"),
    ("cymbal", "cymbal"),
    ("cym", "cymbal"),
    ("shaker", "shaker"),
    ("tambourine", "tambourine"),
    ("cowbell", "cowbell"),
    ("conga", "conga"),
    ("bongo", "bongo"),
    ("perc", "percussion"),
    ("percussion", "percussion"),
    // ── Bass subtypes ─────────────────────────────────────────────────────
    ("808", "808"),
    ("sub", "sub_bass"),
    ("subbass", "sub_bass"),
    ("reese", "reese"),
    ("wobble", "wobble"),
    // ── Synth subtypes ────────────────────────────────────────────────────
    ("stab", "stab"),
    ("lead", "lead"),
    ("pad", "pad"),
    ("pluck", "pluck"),
    ("chord", "chord"),
    ("chords", "chord"),
    ("arp", "arp"),
    ("arpeggiated", "arp"),
    // ── FX subtypes ───────────────────────────────────────────────────────
    ("riser", "riser"),
    ("sweep", "sweep"),
    ("impact", "impact"),
    ("downlifter", "downlifter"),
    ("uplifter", "uplifter"),
    ("reverse", "reverse"),
    ("reversed", "reverse"),
    ("rev", "reverse"),
    ("ambience", "ambience"),
    ("ambient", "ambience"),
    ("atmos", "ambience"),
    ("atmosphere", "ambience"),
    ("texture", "texture"),
    ("noise", "noise"),
    ("glitch", "glitch"),
    ("foley", "foley"),
    ("transition", "transition"),
    ("field", "field_recording"),
    // ── Vocal subtypes ────────────────────────────────────────────────────
    ("adlib", "adlib"),
    ("ad-lib", "adlib"),
    ("hook", "hook"),
    ("choir", "choir"),
    ("chant", "chant"),
    ("rap", "rap"),
    ("spoken", "spoken"),
    // ── Song structure ────────────────────────────────────────────────────
    ("fill", "fill"),
    ("buildup", "buildup"),
    ("build", "buildup"),
    ("drop", "drop"),
    ("intro", "intro"),
    ("outro", "outro"),
    ("break", "break"),
    ("breakdown", "break"),
    ("bridge", "bridge"),
    ("verse", "verse"),
    ("chorus", "chorus"),
    // ── Texture / character ───────────────────────────────────────────────
    ("dry", "dry"),
    ("wet", "wet"),
    ("processed", "processed"),
    ("raw", "raw"),
    ("layered", "layered"),
    ("layer", "layered"),
    ("punchy", "punchy"),
    ("tight", "tight"),
    ("fat", "fat"),
    ("thin", "thin"),
    ("deep", "deep"),
    ("bright", "bright"),
    ("dark", "dark"),
    ("warm", "warm"),
    ("hard", "hard"),
    ("soft", "soft"),
    ("distorted", "distorted"),
    ("dist", "distorted"),
    ("saturated", "saturated"),
    ("sat", "saturated"),
    ("compressed", "compressed"),
    ("comp", "compressed"),
    ("pitched", "pitched"),
    ("tuned", "pitched"),
    ("muted", "muted"),
    ("mute", "muted"),
    ("low", "low"),
    ("high", "high"),
    // ── Drum subtype plurals + new percussion types ────────────────────────
    ("kicks", "kick"),
    ("snares", "snare"),
    ("claps", "clap"),
    ("hats", "hihat"),
    ("hihats", "hihat"),
    ("toms", "tom"),
    ("cymbals", "cymbal"),
    ("rides", "ride"),
    ("crashes", "crash"),
    ("rims", "rimshot"),
    ("rimshots", "rimshot"),
    ("shakers", "shaker"),
    ("tambourines", "tambourine"),
    ("cowbells", "cowbell"),
    ("congas", "conga"),
    ("bongos", "bongo"),
    ("openhats", "open_hihat"),
    ("closedhats", "closed_hihat"),
    ("snap", "snap"),
    ("snaps", "snap"),
    ("bell", "bell"),
    ("bells", "bell"),
    ("gong", "gong"),
    ("gongs", "gong"),
    ("agogo", "agogo"),
    ("agogos", "agogo"),
    ("clave", "clave"),
    ("claves", "clave"),
    ("timbale", "timbale"),
    ("timbales", "timbale"),
    ("xylophone", "xylophone"),
    ("xylo", "xylophone"),
    ("mallet", "mallet"),
    ("mallets", "mallet"),
    ("guiro", "guiro"),
    ("triangle", "triangle"),
    ("woodblock", "woodblock"),
    ("vibe", "vibes"),
    ("vibes", "vibes"),
    ("djembe", "djembe"),
    ("cajon", "cajon"),
    ("tabla", "tabla"),
    ("darbuka", "darbuka"),
    ("tops", "tops"),
    ("toploop", "tops"),
    ("layers", "layered"),
    ("layer", "layered"),
    // ── Synth / melodic subtype plurals ────────────────────────────────────
    ("plucks", "pluck"),
    ("leads", "lead"),
    ("pads", "pad"),
    ("stabs", "stab"),
    ("arps", "arp"),
    ("melody", "melody"),
    ("melodies", "melody"),
    ("groove", "groove"),
    ("grooves", "groove"),
    ("songstarter", "songstarter"),
    ("songstarters", "songstarter"),
    // ── Vocal subtypes ─────────────────────────────────────────────────────
    ("male", "male_vocal"),
    ("female", "female_vocal"),
    ("shout", "shout"),
    ("shouts", "shout"),
    ("phrase", "phrase"),
    ("phrases", "phrase"),
    ("chop", "chop"),
    ("chops", "chop"),
    ("harmony", "harmony"),
    ("harmonies", "harmony"),
    ("hooks", "hook"),
    ("adlibs", "adlib"),
    // ── FX subtype plurals + new ───────────────────────────────────────────
    ("risers", "riser"),
    ("impacts", "impact"),
    ("downlifters", "downlifter"),
    ("uplifters", "uplifter"),
    ("transitions", "transition"),
    ("ambiences", "ambience"),
    ("textures", "texture"),
    ("atmospheres", "ambience"),
    ("laser", "laser"),
    ("lasers", "laser"),
    ("zap", "zap"),
    ("zaps", "zap"),
    ("downer", "downer"),
    ("downers", "downer"),
    ("sweepup", "sweep_up"),
    ("sweep_up", "sweep_up"),
    ("sweepdown", "sweep_down"),
    ("sweep_down", "sweep_down"),
    // ── Song structure plurals ─────────────────────────────────────────────
    ("loops", "loop"),
    ("hits", "hit"),
    ("oneshots", "oneshot"),
    ("fills", "fill"),
    ("drops", "drop"),
    ("breaks", "break"),
    ("bridges", "bridge"),
    ("verses", "verse"),
    ("choruses", "chorus"),
    ("intros", "intro"),
    ("outros", "outro"),
    ("buildups", "buildup"),
    ("builds", "buildup"),
];

/// Keywords that indicate HIGH energy.
const HIGH_ENERGY_TOKENS: &[&str] = &[
    "tearout", "dubstep", "slap", "aggressive", "hard", "heavy", "distorted",
    "dist", "saturated", "sat", "dirty", "gritty", "gnarly", "brutal",
    "banger", "banger", "rave", "techno", "industrial", "metal", "punk",
    "glitch", "chaos", "mayhem", "intense", "powerful", "massive",
];

/// Keywords that indicate LOW energy.
const LOW_ENERGY_TOKENS: &[&str] = &[
    "ambient", "ambience", "atmos", "atmosphere", "chill", "chillout",
    "lofi", "lo-fi", "lo_fi", "soft", "gentle", "calm", "peaceful",
    "meditation", "sleep", "relax", "mellow", "dreamy", "ethereal",
    "pad", "drone", "texture", "background", "subtle",
];

/// Keywords that indicate ORGANIC texture.
const ORGANIC_TOKENS: &[&str] = &[
    "acoustic", "live", "real", "natural", "organic", "raw", "field",
    "recording", "foley", "vinyl", "tape", "analog", "analogue", "lofi",
    "lo-fi", "lo_fi", "vintage", "retro", "warm", "wooden", "wood",
    "ethnic", "world", "folk", "tribal", "kaval", "ney", "nay", "baglama",
    "saz", "kamanche", "oud", "darbuka", "tabla", "sitar", "duduk",
    "kemenche", "kanun", "qanun", "bendir", "riq", "def", "daf",
    "guitar", "piano", "violin", "cello", "strings", "brass", "flute",
    "clarinet", "oboe", "choir", "voice", "vocal", "vocals",
];

/// Keywords that indicate SYNTHETIC texture.
const SYNTHETIC_TOKENS: &[&str] = &[
    "synth", "synthesizer", "digital", "serum", "massive", "vital",
    "wavetable", "fm", "additive", "subtractive", "modular", "eurorack",
    "preset", "patch", "plugin", "vst", "software", "electronic",
    "808", "909", "tr", "tb", "dx7", "juno", "moog", "prophet",
    "arp2600", "minimoog", "oberheim", "roland", "korg", "yamaha",
];

/// Keywords that indicate DRY space.
const DRY_TOKENS: &[&str] = &["dry", "dr", "close", "tight", "direct", "anechoic", "dead"];

/// Keywords that indicate WET space.
const WET_TOKENS: &[&str] = &[
    "wet", "wt", "reverb", "verb", "room", "hall", "plate", "spring",
    "ambient", "ambience", "space", "cathedral", "cave", "chamber",
    "delay", "echo", "dub", "washed", "lush", "airy", "open",
];

/// Keywords that indicate FOUNDATION role.
const FOUNDATION_TOKENS: &[&str] = &[
    "kick", "kck", "kik", "bd", "808", "bass", "sub", "subbass",
    "bassline", "bass_loop", "bass_line",
];

/// Keywords that indicate TOP_END role.
const TOP_END_TOKENS: &[&str] = &[
    "hihat", "hi-hat", "hat", "hh", "ohh", "chh", "shaker",
    "tambourine", "top", "top_loop", "toploop", "ride", "cymbal",
];

/// Keywords that indicate EAR_CANDY role.
const EAR_CANDY_TOKENS: &[&str] = &[
    "glitch", "fx", "sfx", "adlib", "ad-lib", "stutter", "chop",
    "fill", "riser", "sweep", "impact", "downlifter", "uplifter",
    "transition", "foley", "noise", "texture", "oneshot", "one_shot",
    "one-shot", "shot", "hit", "stab",
];

pub fn parse(filename: &str) -> FilenameMetadata {
    let stem = strip_ext(filename);
    let lower = stem.to_lowercase();
    let mut meta = FilenameMetadata::default();
    let mut score = 0.0f32;

    // Try BPM patterns in priority order - most specific first
    let mut bpm_found = false;
    
    // Priority 1: Numbers with "bpm" label (e.g., "124 BPM", "120bpm")
    if let Some(caps) = BPM_WITH_LABEL_RE.captures(&lower) {
        if let Some(m) = caps.get(1) {
            if let Ok(bpm) = m.as_str().parse::<f32>() {
                if (40.0..=240.0).contains(&bpm) {
                    meta.bpm = Some(bpm);
                    score += 0.4;
                    bpm_found = true;
                }
            }
        }
    }
    
    // Priority 2: "bpm" followed by numbers (e.g., "bpm120", "bpm_140")
    if !bpm_found {
        if let Some(caps) = BPM_LABEL_FIRST_RE.captures(&lower) {
            if let Some(m) = caps.get(1) {
                if let Ok(bpm) = m.as_str().parse::<f32>() {
                    if (40.0..=240.0).contains(&bpm) {
                        meta.bpm = Some(bpm);
                        score += 0.4;
                        bpm_found = true;
                    }
                }
            }
        }
    }
    
    // Priority 3: Standalone numbers with delimiters (e.g., "_120_", "(124)")
    if !bpm_found {
        if let Some(caps) = BPM_STANDALONE_RE.captures(&lower) {
            if let Some(m) = caps.get(1) {
                if let Ok(bpm) = m.as_str().parse::<f32>() {
                    if (40.0..=240.0).contains(&bpm) {
                        meta.bpm = Some(bpm);
                        score += 0.4;
                    }
                }
            }
        }
    }

    if let Some(caps) = KEY_RE.captures(&stem) {
        if let (Some(note_m), scale_m) = (caps.get(1), caps.get(2)) {
            let note = normalize_note(note_m.as_str());
            let scale = match scale_m.map(|m| m.as_str().to_lowercase()) {
                Some(s) if s == "maj" => Some("major".to_string()),
                Some(s) if s == "min" || s == "m" => Some("minor".to_string()),
                _ => {
                    // lone "Am" vs "A" ambiguous. If note literal was lowercase single char, lean minor.
                    if note_m.as_str().chars().next().map(|c| c.is_ascii_lowercase()).unwrap_or(false) {
                        Some("minor".to_string())
                    } else {
                        Some("major".to_string())
                    }
                }
            };
            meta.key_note = Some(note);
            meta.key_scale = scale;
            score += 0.3;
        }
    }

    // Split on common delimiters for token matching (including parentheses, brackets, braces)
    let tokens: Vec<&str> = lower
        .split(|c: char| c == '_' || c == '-' || c == ' ' || c == '.' || c == '(' || c == ')' || c == '[' || c == ']' || c == '{' || c == '}')
        .filter(|t| !t.is_empty())
        .collect();

    for token in &tokens {
        if meta.instrument.is_none() {
            for (k, v) in INSTRUMENT_TOKENS {
                if *token == *k {
                    meta.instrument = Some((*v).to_string());
                    score += 0.2;
                    break;
                }
            }
        }
        if meta.subtype.is_none() {
            for (k, v) in SUBTYPE_TOKENS {
                if *token == *k {
                    meta.subtype = Some((*v).to_string());
                    break;
                }
            }
        }
    }

    // ── Smart tags derived from filename tokens ────────────────────────────

    // Energy level: BPM-based heuristic + keyword matching
    // High energy: BPM >= 140 or aggressive keywords
    // Low energy: BPM <= 95 or chill keywords
    let bpm_energy: Option<&str> = meta.bpm.map(|b| {
        if b >= 140.0 { "high" } else if b <= 95.0 { "low" } else { "medium" }
    });

    let keyword_energy: Option<&str> = if tokens.iter().any(|t| HIGH_ENERGY_TOKENS.contains(t)) {
        Some("high")
    } else if tokens.iter().any(|t| LOW_ENERGY_TOKENS.contains(t)) {
        Some("low")
    } else {
        None
    };

    meta.energy_level = keyword_energy
        .map(|s| s.to_string())
        .or_else(|| bpm_energy.filter(|&e| e != "medium").map(|s| s.to_string()));

    // Texture: organic vs synthetic
    let is_organic = tokens.iter().any(|t| ORGANIC_TOKENS.contains(t))
        || meta.instrument.as_deref().map(|i| matches!(i, "ethnic" | "guitar" | "strings" | "brass" | "wind" | "piano" | "vocal")).unwrap_or(false);
    let is_synthetic = tokens.iter().any(|t| SYNTHETIC_TOKENS.contains(t))
        || meta.instrument.as_deref().map(|i| matches!(i, "synth" | "lead" | "pad" | "bass" | "arp")).unwrap_or(false);

    meta.texture = match (is_organic, is_synthetic) {
        (true, false) => Some("organic".to_string()),
        (false, true) => Some("synthetic".to_string()),
        _ => None, // ambiguous or unknown
    };

    // Space: dry vs wet
    meta.space = if tokens.iter().any(|t| DRY_TOKENS.contains(t)) {
        Some("dry".to_string())
    } else if tokens.iter().any(|t| WET_TOKENS.contains(t)) {
        Some("wet".to_string())
    } else {
        None
    };

    // Role: foundation / top_end / ear_candy
    meta.role = if tokens.iter().any(|t| FOUNDATION_TOKENS.contains(t))
        || meta.subtype.as_deref().map(|s| matches!(s, "kick" | "808" | "sub_bass")).unwrap_or(false)
    {
        Some("foundation".to_string())
    } else if tokens.iter().any(|t| TOP_END_TOKENS.contains(t))
        || meta.subtype.as_deref().map(|s| matches!(s, "hihat" | "open_hihat" | "closed_hihat" | "shaker" | "tambourine")).unwrap_or(false)
    {
        Some("top_end".to_string())
    } else if tokens.iter().any(|t| EAR_CANDY_TOKENS.contains(t))
        || meta.subtype.as_deref().map(|s| matches!(s, "glitch" | "riser" | "downlifter" | "uplifter" | "transition" | "adlib" | "fill")).unwrap_or(false)
    {
        Some("ear_candy".to_string())
    } else {
        None
    };

    meta.confidence = score.min(1.0);
    meta
}

fn strip_ext(name: &str) -> String {
    match name.rfind('.') {
        Some(i) => name[..i].to_string(),
        None => name.to_string(),
    }
}

fn normalize_note(raw: &str) -> String {
    let mut chars = raw.chars();
    let letter = chars.next().map(|c| c.to_ascii_uppercase()).unwrap_or('C');
    let acc = chars.next();
    match acc {
        Some('#') => format!("{}#", letter),
        Some('b') => format!("{}b", letter),
        Some('B') => format!("{}b", letter),
        _ => letter.to_string(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_bpm_parentheses_patterns() {
        // Test the new parentheses BPM patterns
        let test_cases = vec![
            ("kick_punchy_(124BPM)_dry.wav", Some(124.0)),
            ("bass_wobble_[140BPM]_wet.wav", Some(140.0)),
            ("synth_lead_{128BPM}_ambient.wav", Some(128.0)),
            ("drum_loop_(120)_tight.wav", Some(120.0)),
            ("melody_[110]_reverb.wav", Some(110.0)),
            ("pad_{95}_lush.wav", Some(95.0)),
            // Existing patterns should still work
            ("kick_120bpm_dry.wav", Some(120.0)),
            ("bass_bpm140_wet.wav", Some(140.0)),
            ("synth_128_lead.wav", Some(128.0)),
        ];

        for (filename, expected_bpm) in test_cases {
            let result = parse(filename);
            assert_eq!(result.bpm, expected_bpm, "Failed for filename: {}", filename);
        }
    }

    #[test]
    fn test_dry_wet_parentheses_patterns() {
        // Test the new parentheses dry/wet patterns
        let test_cases = vec![
            ("kick_punchy_(dry)_120bpm.wav", Some("dry".to_string())),
            ("bass_wobble_(wet)_140bpm.wav", Some("wet".to_string())),
            ("synth_lead_[dry]_128bpm.wav", Some("dry".to_string())),
            ("drum_loop_{wet}_120bpm.wav", Some("wet".to_string())),
            // Test abbreviations
            ("kick_punchy_(dr)_120bpm.wav", Some("dry".to_string())),
            ("bass_wobble_(wt)_140bpm.wav", Some("wet".to_string())),
            // Existing patterns should still work
            ("kick_dry_120bpm.wav", Some("dry".to_string())),
            ("bass_wet_140bpm.wav", Some("wet".to_string())),
            ("synth_reverb_128bpm.wav", Some("wet".to_string())),
        ];

        for (filename, expected_space) in test_cases {
            let result = parse(filename);
            assert_eq!(result.space, expected_space, "Failed for filename: {}", filename);
        }
    }

    #[test]
    fn test_key_parentheses_patterns() {
        // Test the new parentheses key patterns
        let test_cases = vec![
            ("melody_(Cmaj)_120bpm.wav", (Some("C".to_string()), Some("major".to_string()))),
            ("bass_[Gmin]_140bpm.wav", (Some("G".to_string()), Some("minor".to_string()))),
            ("chord_{F#maj}_128bpm.wav", (Some("F#".to_string()), Some("major".to_string()))),
            ("arp_(Bbm)_110bpm.wav", (Some("Bb".to_string()), Some("minor".to_string()))),
            // Existing patterns should still work
            ("melody_Cmaj_120bpm.wav", (Some("C".to_string()), Some("major".to_string()))),
            ("bass_Gmin_140bpm.wav", (Some("G".to_string()), Some("minor".to_string()))),
        ];

        for (filename, (expected_note, expected_scale)) in test_cases {
            let result = parse(filename);
            assert_eq!(result.key_note, expected_note, "Failed note for filename: {}", filename);
            assert_eq!(result.key_scale, expected_scale, "Failed scale for filename: {}", filename);
        }
    }

    #[test]
    fn test_combined_patterns() {
        // Test files with multiple new patterns combined
        let result = parse("kick_punchy_(124BPM)_(dry)_(Cmaj)_tight.wav");
        assert_eq!(result.bpm, Some(124.0));
        assert_eq!(result.space, Some("dry".to_string()));
        assert_eq!(result.key_note, Some("C".to_string()));
        assert_eq!(result.key_scale, Some("major".to_string()));
        assert_eq!(result.instrument, Some("drum".to_string()));
        assert_eq!(result.subtype, Some("kick".to_string()));

        let result2 = parse("bass_wobble_[140BPM]_[wet]_[Gmin]_lush.wav");
        assert_eq!(result2.bpm, Some(140.0));
        assert_eq!(result2.space, Some("wet".to_string()));
        assert_eq!(result2.key_note, Some("G".to_string()));
        assert_eq!(result2.key_scale, Some("minor".to_string()));
        assert_eq!(result2.instrument, Some("bass".to_string()));
    }
}
    #[test]
    fn test_real_world_bpm_cases() {
        // Test the specific case reported by user
        let test_cases = vec![
            ("TPS - Illusion - Fill 02 (124 BPM).wav", Some(124.0)),
            ("Track Name (120 BPM).wav", Some(120.0)),
            ("Song Title (140BPM).wav", Some(140.0)),
            ("Beat (128 bpm).wav", Some(128.0)),
            ("Loop (95 BPM) Dry.wav", Some(95.0)),
            ("Melody [130 BPM].wav", Some(130.0)),
            ("Bass {110 BPM}.wav", Some(110.0)),
            // More real-world cases
            ("Kick - Punchy - 120 BPM - Dry.wav", Some(120.0)),
            ("Synth Lead (140 BPM) Wet.wav", Some(140.0)),
            ("Bass Line [128 BPM] Tight.wav", Some(128.0)),
            ("Drum Loop {95 BPM} Ambient.wav", Some(95.0)),
            ("Melody_120_BPM_Reverb.wav", Some(120.0)),
            ("Track-140-BPM-Clean.wav", Some(140.0)),
            // Edge cases
            ("Track (60 BPM).wav", Some(60.0)),  // Lower bound
            ("Fast (200 BPM).wav", Some(200.0)), // Higher bound
            ("Invalid (300 BPM).wav", None),     // Out of range
            ("Invalid (30 BPM).wav", None),      // Out of range
            // Should prioritize BPM over random numbers
            ("Track 02 (124 BPM) Version 03.wav", Some(124.0)), // Should get 124, not 02 or 03
            ("Beat 01 - 120 BPM - Take 05.wav", Some(120.0)),   // Should get 120, not 01 or 05
        ];

        for (filename, expected_bpm) in test_cases {
            let result = parse(filename);
            assert_eq!(result.bpm, expected_bpm, "Failed for filename: {}", filename);
        }
    }
