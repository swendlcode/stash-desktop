use std::collections::HashMap;

/// Expands search queries with synonyms and common music terminology
pub struct SynonymExpander {
    synonyms: HashMap<String, Vec<String>>,
}

impl SynonymExpander {
    pub fn new() -> Self {
        let mut synonyms = HashMap::new();
        
        // Musical instrument synonyms
        synonyms.insert("drum".to_string(), vec!["drums".to_string(), "percussion".to_string(), "perc".to_string(), "beat".to_string(), "rhythm".to_string()]);
        synonyms.insert("drums".to_string(), vec!["drum".to_string(), "percussion".to_string(), "perc".to_string(), "beat".to_string(), "rhythm".to_string()]);
        synonyms.insert("bass".to_string(), vec!["bassline".to_string(), "sub".to_string(), "low".to_string(), "bottom".to_string()]);
        synonyms.insert("synth".to_string(), vec!["synthesizer".to_string(), "synthetic".to_string(), "electronic".to_string(), "digital".to_string()]);
        synonyms.insert("lead".to_string(), vec!["melody".to_string(), "melodic".to_string(), "main".to_string(), "solo".to_string()]);
        synonyms.insert("pad".to_string(), vec!["atmosphere".to_string(), "atmospheric".to_string(), "ambient".to_string(), "texture".to_string(), "background".to_string()]);
        synonyms.insert("pluck".to_string(), vec!["plucked".to_string(), "pizzicato".to_string(), "staccato".to_string(), "short".to_string()]);
        synonyms.insert("chord".to_string(), vec!["chords".to_string(), "harmony".to_string(), "harmonic".to_string(), "progression".to_string()]);
        synonyms.insert("arp".to_string(), vec!["arpeggio".to_string(), "arpeggiated".to_string(), "sequence".to_string(), "pattern".to_string()]);
        synonyms.insert("keys".to_string(), vec!["keyboard".to_string(), "piano".to_string(), "electric piano".to_string(), "ep".to_string()]);
        synonyms.insert("piano".to_string(), vec!["keys".to_string(), "keyboard".to_string(), "acoustic piano".to_string(), "grand".to_string()]);
        synonyms.insert("guitar".to_string(), vec!["gtr".to_string(), "electric guitar".to_string(), "acoustic guitar".to_string(), "strings".to_string()]);
        synonyms.insert("strings".to_string(), vec!["string section".to_string(), "orchestral".to_string(), "violin".to_string(), "viola".to_string(), "cello".to_string()]);
        synonyms.insert("brass".to_string(), vec!["horn".to_string(), "trumpet".to_string(), "trombone".to_string(), "saxophone".to_string(), "sax".to_string()]);
        synonyms.insert("wind".to_string(), vec!["woodwind".to_string(), "flute".to_string(), "clarinet".to_string(), "oboe".to_string()]);
        synonyms.insert("vocal".to_string(), vec!["voice".to_string(), "vocals".to_string(), "singer".to_string(), "choir".to_string(), "choral".to_string()]);
        synonyms.insert("fx".to_string(), vec!["effect".to_string(), "effects".to_string(), "sfx".to_string(), "sound effect".to_string(), "foley".to_string()]);

        // Atmosphere and mood synonyms
        synonyms.insert("atmosphere".to_string(), vec!["atmospheric".to_string(), "ambient".to_string(), "mood".to_string(), "texture".to_string(), "pad".to_string(), "background".to_string()]);
        synonyms.insert("atmospheric".to_string(), vec!["atmosphere".to_string(), "ambient".to_string(), "moody".to_string(), "textural".to_string()]);
        synonyms.insert("ambient".to_string(), vec!["atmosphere".to_string(), "atmospheric".to_string(), "chill".to_string(), "relaxed".to_string(), "calm".to_string()]);
        synonyms.insert("dark".to_string(), vec!["deep".to_string(), "moody".to_string(), "mysterious".to_string(), "brooding".to_string(), "ominous".to_string()]);
        synonyms.insert("bright".to_string(), vec!["light".to_string(), "happy".to_string(), "uplifting".to_string(), "cheerful".to_string(), "positive".to_string()]);
        synonyms.insert("warm".to_string(), vec!["cozy".to_string(), "comfortable".to_string(), "soft".to_string(), "mellow".to_string()]);
        synonyms.insert("cold".to_string(), vec!["cool".to_string(), "icy".to_string(), "distant".to_string(), "sterile".to_string()]);
        synonyms.insert("aggressive".to_string(), vec!["hard".to_string(), "intense".to_string(), "powerful".to_string(), "driving".to_string(), "heavy".to_string()]);
        synonyms.insert("soft".to_string(), vec!["gentle".to_string(), "smooth".to_string(), "mellow".to_string(), "subtle".to_string()]);
        synonyms.insert("energetic".to_string(), vec!["upbeat".to_string(), "lively".to_string(), "dynamic".to_string(), "active".to_string(), "pumping".to_string()]);

        // Genre and style synonyms
        synonyms.insert("electronic".to_string(), vec!["edm".to_string(), "dance".to_string(), "techno".to_string(), "house".to_string(), "synth".to_string()]);
        synonyms.insert("hip hop".to_string(), vec!["hiphop".to_string(), "rap".to_string(), "trap".to_string(), "urban".to_string()]);
        synonyms.insert("rock".to_string(), vec!["guitar".to_string(), "band".to_string(), "alternative".to_string(), "indie".to_string()]);
        synonyms.insert("pop".to_string(), vec!["popular".to_string(), "mainstream".to_string(), "catchy".to_string(), "commercial".to_string()]);
        synonyms.insert("jazz".to_string(), vec!["swing".to_string(), "blues".to_string(), "improvisation".to_string(), "smooth".to_string()]);
        synonyms.insert("classical".to_string(), vec!["orchestral".to_string(), "symphony".to_string(), "chamber".to_string(), "baroque".to_string()]);
        synonyms.insert("folk".to_string(), vec!["acoustic".to_string(), "traditional".to_string(), "country".to_string(), "americana".to_string()]);

        // Technical and production terms
        synonyms.insert("loop".to_string(), vec!["sample".to_string(), "phrase".to_string(), "pattern".to_string(), "cycle".to_string()]);
        synonyms.insert("one shot".to_string(), vec!["oneshot".to_string(), "hit".to_string(), "single".to_string(), "stab".to_string()]);
        synonyms.insert("reverb".to_string(), vec!["verb".to_string(), "space".to_string(), "room".to_string(), "hall".to_string(), "echo".to_string()]);
        synonyms.insert("delay".to_string(), vec!["echo".to_string(), "repeat".to_string(), "feedback".to_string()]);
        synonyms.insert("distortion".to_string(), vec!["overdrive".to_string(), "fuzz".to_string(), "saturation".to_string(), "grit".to_string()]);
        synonyms.insert("filter".to_string(), vec!["eq".to_string(), "sweep".to_string(), "cutoff".to_string(), "resonance".to_string()]);

        // Common misspellings and abbreviations
        synonyms.insert("atmo".to_string(), vec!["atmosphere".to_string(), "atmospheric".to_string()]);
        synonyms.insert("perc".to_string(), vec!["percussion".to_string(), "drums".to_string()]);
        synonyms.insert("vox".to_string(), vec!["vocal".to_string(), "voice".to_string(), "vocals".to_string()]);
        synonyms.insert("gtr".to_string(), vec!["guitar".to_string()]);
        synonyms.insert("sax".to_string(), vec!["saxophone".to_string()]);
        synonyms.insert("ep".to_string(), vec!["electric piano".to_string(), "rhodes".to_string()]);

        Self { synonyms }
    }

    /// Expand a query term with its synonyms
    pub fn expand_term(&self, term: &str) -> Vec<String> {
        let term_lower = term.to_lowercase();
        let mut expanded = vec![term_lower.clone()];
        
        if let Some(synonyms) = self.synonyms.get(&term_lower) {
            expanded.extend(synonyms.clone());
        }

        // Also check if the term is a synonym of something else
        for (key, synonyms) in &self.synonyms {
            if synonyms.contains(&term_lower) && !expanded.contains(key) {
                expanded.push(key.clone());
            }
        }

        expanded
    }

    /// Expand a full query with synonyms for each term
    pub fn expand_query(&self, query: &str) -> Vec<String> {
        let terms: Vec<&str> = query.split_whitespace().collect();
        if terms.is_empty() {
            return vec![query.to_string()];
        }

        let mut expanded_queries = vec![query.to_lowercase()];

        // For each term, try expanding with synonyms
        for (i, term) in terms.iter().enumerate() {
            let synonyms = self.expand_term(term);
            for synonym in synonyms {
                if synonym != term.to_lowercase() {
                    let mut new_terms = terms.clone();
                    new_terms[i] = &synonym;
                    expanded_queries.push(new_terms.join(" "));
                }
            }
        }

        // Remove duplicates and return
        expanded_queries.sort();
        expanded_queries.dedup();
        expanded_queries
    }

    /// Get the most relevant synonym for a term (first in the list)
    pub fn get_primary_synonym(&self, term: &str) -> Option<String> {
        let term_lower = term.to_lowercase();
        self.synonyms.get(&term_lower).and_then(|synonyms| synonyms.first().cloned())
    }
}

impl Default for SynonymExpander {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_instrument_synonyms() {
        let expander = SynonymExpander::new();
        let expanded = expander.expand_term("drum");
        assert!(expanded.contains(&"drums".to_string()));
        assert!(expanded.contains(&"percussion".to_string()));
        assert!(expanded.contains(&"beat".to_string()));
    }

    #[test]
    fn test_atmosphere_synonyms() {
        let expander = SynonymExpander::new();
        let expanded = expander.expand_term("atmosphere");
        assert!(expanded.contains(&"atmospheric".to_string()));
        assert!(expanded.contains(&"ambient".to_string()));
        assert!(expanded.contains(&"pad".to_string()));
    }

    #[test]
    fn test_query_expansion() {
        let expander = SynonymExpander::new();
        let expanded = expander.expand_query("dark atmosphere");
        assert!(expanded.len() > 1);
        assert!(expanded.iter().any(|q| q.contains("ambient")));
        assert!(expanded.iter().any(|q| q.contains("moody")));
    }

    #[test]
    fn test_abbreviation_expansion() {
        let expander = SynonymExpander::new();
        let expanded = expander.expand_term("atmo");
        assert!(expanded.contains(&"atmosphere".to_string()));
        assert!(expanded.contains(&"atmospheric".to_string()));
    }
}