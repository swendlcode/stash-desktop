use super::{FuzzyMatcher, SynonymExpander};
use std::collections::HashSet;

/// Processes and enhances search queries with smart matching capabilities
pub struct QueryProcessor {
    fuzzy_matcher: FuzzyMatcher,
    synonym_expander: SynonymExpander,
}

#[derive(Debug, Clone)]
pub struct ProcessedQuery {
    pub original: String,
    pub normalized: String,
    pub expanded_terms: Vec<String>,
    pub fuzzy_variants: Vec<String>,
    pub suggested_corrections: Vec<String>,
}

impl QueryProcessor {
    pub fn new() -> Self {
        Self {
            fuzzy_matcher: FuzzyMatcher::new(),
            synonym_expander: SynonymExpander::new(),
        }
    }

    /// Process a search query and return enhanced search terms
    pub fn process_query(&mut self, query: &str, known_terms: &[String]) -> ProcessedQuery {
        let normalized = self.normalize_query(query);
        let expanded_terms = self.expand_with_synonyms(&normalized);
        let fuzzy_variants = self.generate_fuzzy_variants(&normalized, known_terms);
        let suggested_corrections = self.suggest_corrections(&normalized, known_terms);

        ProcessedQuery {
            original: query.to_string(),
            normalized,
            expanded_terms,
            fuzzy_variants,
            suggested_corrections,
        }
    }

    /// Normalize the query by cleaning and standardizing it
    fn normalize_query(&self, query: &str) -> String {
        query
            .to_lowercase()
            .trim()
            .chars()
            .map(|c| {
                if c.is_alphanumeric() || c.is_whitespace() {
                    c
                } else if c == '-' || c == '_' {
                    ' '
                } else {
                    ' '
                }
            })
            .collect::<String>()
            .split_whitespace()
            .collect::<Vec<_>>()
            .join(" ")
    }

    /// Expand query terms with synonyms
    fn expand_with_synonyms(&self, query: &str) -> Vec<String> {
        let mut expanded = HashSet::new();
        
        // Add original query
        expanded.insert(query.to_string());
        
        // Add synonym expansions
        let synonym_queries = self.synonym_expander.expand_query(query);
        for synonym_query in synonym_queries {
            expanded.insert(synonym_query);
        }

        // Also try expanding individual terms and recombining
        let terms: Vec<&str> = query.split_whitespace().collect();
        if terms.len() > 1 {
            for term in &terms {
                let term_synonyms = self.synonym_expander.expand_term(term);
                for synonym in term_synonyms {
                    if synonym != *term {
                        let new_query = terms.iter()
                            .map(|&t| if t == *term { synonym.as_str() } else { t })
                            .collect::<Vec<_>>()
                            .join(" ");
                        expanded.insert(new_query);
                    }
                }
            }
        }

        expanded.into_iter().collect()
    }

    /// Generate fuzzy variants for typo tolerance
    fn generate_fuzzy_variants(&mut self, query: &str, known_terms: &[String]) -> Vec<String> {
        let mut variants = HashSet::new();
        let terms: Vec<&str> = query.split_whitespace().collect();

        for term in &terms {
            // Find fuzzy matches for each term
            for known_term in known_terms {
                let similarity = self.fuzzy_matcher.similarity(term, known_term);
                if similarity > 0.7 && similarity < 1.0 {
                    // Create variant by replacing the term
                    let variant = terms.iter()
                        .map(|&t| if t == *term { known_term.as_str() } else { t })
                        .collect::<Vec<_>>()
                        .join(" ");
                    variants.insert(variant);
                }
            }
        }

        variants.into_iter().collect()
    }

    /// Suggest corrections for likely typos
    fn suggest_corrections(&mut self, query: &str, known_terms: &[String]) -> Vec<String> {
        let mut corrections = Vec::new();
        let terms: Vec<&str> = query.split_whitespace().collect();

        for term in &terms {
            if let Some((best_match, score)) = self.fuzzy_matcher.find_best_match(term, known_terms) {
                if score > 0.6 && score < 0.95 && best_match != *term {
                    let correction = terms.iter()
                        .map(|&t| if t == *term { best_match.as_str() } else { t })
                        .collect::<Vec<_>>()
                        .join(" ");
                    corrections.push(correction);
                }
            }
        }

        corrections
    }

    /// Check if a query matches a target with smart matching
    pub fn smart_match(&mut self, query: &str, target: &str, threshold: f32) -> bool {
        // Direct fuzzy match
        if self.fuzzy_matcher.matches(query, target, threshold) {
            return true;
        }

        // Try with expanded synonyms
        let expanded = self.synonym_expander.expand_query(query);
        for expanded_query in expanded {
            if self.fuzzy_matcher.matches(&expanded_query, target, threshold) {
                return true;
            }
        }

        // Try matching individual terms
        let query_terms: Vec<&str> = query.split_whitespace().collect();
        let target_terms: Vec<&str> = target.split_whitespace().collect();

        let mut matched_terms = 0;
        for query_term in &query_terms {
            for target_term in &target_terms {
                if self.fuzzy_matcher.matches(query_term, target_term, threshold) {
                    matched_terms += 1;
                    break;
                }
            }
        }

        // Consider it a match if most terms match
        let match_ratio = matched_terms as f32 / query_terms.len() as f32;
        match_ratio >= 0.6
    }

    /// Calculate a relevance score for a query-target pair
    pub fn calculate_relevance(&mut self, query: &str, target: &str) -> f32 {
        let mut max_score: f32 = 0.0;

        // Direct match score
        let direct_score = self.fuzzy_matcher.similarity(query, target);
        max_score = max_score.max(direct_score);

        // Synonym expansion scores
        let expanded = self.synonym_expander.expand_query(query);
        for expanded_query in expanded {
            let score = self.fuzzy_matcher.similarity(&expanded_query, target);
            max_score = max_score.max(score);
        }

        // Token-based scoring with higher weight
        let query_terms: Vec<&str> = query.split_whitespace().collect();
        let target_terms: Vec<&str> = target.split_whitespace().collect();

        if !query_terms.is_empty() && !target_terms.is_empty() {
            let mut total_score: f32 = 0.0;
            let mut matched_terms = 0;

            for query_term in &query_terms {
                let mut best_term_score: f32 = 0.0;
                
                for target_term in &target_terms {
                    let score = self.fuzzy_matcher.similarity(query_term, target_term);
                    best_term_score = best_term_score.max(score);
                }

                // Also try with synonyms
                let term_synonyms = self.synonym_expander.expand_term(query_term);
                for synonym in term_synonyms {
                    for target_term in &target_terms {
                        let score = self.fuzzy_matcher.similarity(&synonym, target_term);
                        best_term_score = best_term_score.max(score);
                    }
                }

                if best_term_score > 0.5 {
                    total_score += best_term_score;
                    matched_terms += 1;
                }
            }

            if matched_terms > 0 {
                let avg_score = total_score / matched_terms as f32;
                let coverage = matched_terms as f32 / query_terms.len() as f32;
                let token_score = avg_score * coverage;
                max_score = max_score.max(token_score);
            }
        }

        max_score
    }

    /// Get search suggestions based on partial input
    pub fn get_suggestions(&mut self, partial_query: &str, known_terms: &[String], limit: usize) -> Vec<String> {
        let mut suggestions = Vec::new();
        let normalized = self.normalize_query(partial_query);

        if normalized.is_empty() {
            return suggestions;
        }

        // Find terms that start with the query
        for term in known_terms {
            if term.to_lowercase().starts_with(&normalized) {
                suggestions.push(term.clone());
            }
        }

        // Find fuzzy matches
        for term in known_terms {
            let score = self.fuzzy_matcher.similarity(&normalized, term);
            if score > 0.6 && !suggestions.contains(term) {
                suggestions.push(term.clone());
            }
        }

        // Add synonym suggestions
        let expanded = self.synonym_expander.expand_term(&normalized);
        for synonym in expanded {
            if !suggestions.contains(&synonym) && synonym != normalized {
                suggestions.push(synonym);
            }
        }

        suggestions.truncate(limit);
        suggestions
    }
}

impl Default for QueryProcessor {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_query_normalization() {
        let processor = QueryProcessor::new();
        assert_eq!(processor.normalize_query("  ATMOSPHERE  "), "atmosphere");
        assert_eq!(processor.normalize_query("dark-atmosphere"), "dark atmosphere");
        assert_eq!(processor.normalize_query("test@#$%query"), "test query");
    }

    #[test]
    fn test_smart_matching() {
        let mut processor = QueryProcessor::new();
        assert!(processor.smart_match("atmosphere", "atmospheric pad", 0.7));
        assert!(processor.smart_match("atmoshere", "atmosphere", 0.7)); // typo
        assert!(processor.smart_match("drum", "percussion loop", 0.7)); // synonym
    }

    #[test]
    fn test_relevance_calculation() {
        let mut processor = QueryProcessor::new();
        let score1 = processor.calculate_relevance("atmosphere", "atmospheric pad");
        let score2 = processor.calculate_relevance("atmosphere", "guitar riff");
        assert!(score1 > score2);
    }

    #[test]
    fn test_suggestions() {
        let mut processor = QueryProcessor::new();
        let known_terms = vec![
            "atmosphere".to_string(),
            "atmospheric".to_string(),
            "ambient".to_string(),
            "drum".to_string(),
        ];
        let suggestions = processor.get_suggestions("atmo", &known_terms, 5);
        assert!(suggestions.contains(&"atmosphere".to_string()));
        assert!(suggestions.contains(&"atmospheric".to_string()));
    }
}