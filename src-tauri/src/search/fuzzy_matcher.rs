use std::collections::HashMap;

/// Fuzzy string matching with typo tolerance
pub struct FuzzyMatcher {
    /// Cache for computed distances to avoid recalculation
    distance_cache: HashMap<(String, String), f32>,
}

impl FuzzyMatcher {
    pub fn new() -> Self {
        Self {
            distance_cache: HashMap::new(),
        }
    }

    /// Calculate similarity score between two strings (0.0 = no match, 1.0 = perfect match)
    pub fn similarity(&mut self, query: &str, target: &str) -> f32 {
        if query.is_empty() || target.is_empty() {
            return 0.0;
        }

        let query_lower = query.to_lowercase();
        let target_lower = target.to_lowercase();

        // Exact match
        if query_lower == target_lower {
            return 1.0;
        }

        // Check cache first
        let cache_key = (query_lower.clone(), target_lower.clone());
        if let Some(&cached) = self.distance_cache.get(&cache_key) {
            return cached;
        }

        let score = self.calculate_similarity(&query_lower, &target_lower);
        self.distance_cache.insert(cache_key, score);
        score
    }

    fn calculate_similarity(&self, query: &str, target: &str) -> f32 {
        // Multiple scoring strategies combined
        let mut scores = Vec::new();

        // 1. Substring matching (high weight for contains)
        if target.contains(query) {
            scores.push(0.9);
        } else if query.contains(target) {
            scores.push(0.8);
        }

        // 2. Prefix matching
        if target.starts_with(query) {
            scores.push(0.95);
        } else if query.starts_with(target) {
            scores.push(0.85);
        }

        // 3. Levenshtein distance based similarity
        let lev_score = self.levenshtein_similarity(query, target);
        scores.push(lev_score);

        // 4. Jaro-Winkler similarity (good for typos)
        let jw_score = self.jaro_winkler_similarity(query, target);
        scores.push(jw_score);

        // 5. Token-based matching (for multi-word queries)
        let token_score = self.token_similarity(query, target);
        scores.push(token_score);

        // Return the maximum score from all strategies
        scores.into_iter().fold(0.0, f32::max)
    }

    fn levenshtein_similarity(&self, s1: &str, s2: &str) -> f32 {
        let distance = self.levenshtein_distance(s1, s2);
        let max_len = s1.len().max(s2.len()) as f32;
        if max_len == 0.0 {
            return 1.0;
        }
        1.0 - (distance as f32 / max_len)
    }

    fn levenshtein_distance(&self, s1: &str, s2: &str) -> usize {
        let chars1: Vec<char> = s1.chars().collect();
        let chars2: Vec<char> = s2.chars().collect();
        let len1 = chars1.len();
        let len2 = chars2.len();

        if len1 == 0 {
            return len2;
        }
        if len2 == 0 {
            return len1;
        }

        let mut matrix = vec![vec![0; len2 + 1]; len1 + 1];

        // Initialize first row and column
        for i in 0..=len1 {
            matrix[i][0] = i;
        }
        for j in 0..=len2 {
            matrix[0][j] = j;
        }

        // Fill the matrix
        for i in 1..=len1 {
            for j in 1..=len2 {
                let cost = if chars1[i - 1] == chars2[j - 1] { 0 } else { 1 };
                matrix[i][j] = (matrix[i - 1][j] + 1)
                    .min(matrix[i][j - 1] + 1)
                    .min(matrix[i - 1][j - 1] + cost);
            }
        }

        matrix[len1][len2]
    }

    fn jaro_winkler_similarity(&self, s1: &str, s2: &str) -> f32 {
        let jaro = self.jaro_similarity(s1, s2);
        if jaro < 0.7 {
            return jaro;
        }

        // Calculate common prefix length (up to 4 characters)
        let prefix_len = s1
            .chars()
            .zip(s2.chars())
            .take(4)
            .take_while(|(c1, c2)| c1 == c2)
            .count() as f32;

        jaro + (0.1 * prefix_len * (1.0 - jaro))
    }

    fn jaro_similarity(&self, s1: &str, s2: &str) -> f32 {
        let chars1: Vec<char> = s1.chars().collect();
        let chars2: Vec<char> = s2.chars().collect();
        let len1 = chars1.len();
        let len2 = chars2.len();

        if len1 == 0 && len2 == 0 {
            return 1.0;
        }
        if len1 == 0 || len2 == 0 {
            return 0.0;
        }

        let match_window = (len1.max(len2) / 2).saturating_sub(1);
        let mut s1_matches = vec![false; len1];
        let mut s2_matches = vec![false; len2];

        let mut matches = 0;
        let mut transpositions = 0;

        // Find matches
        for i in 0..len1 {
            let start = i.saturating_sub(match_window);
            let end = (i + match_window + 1).min(len2);

            for j in start..end {
                if s2_matches[j] || chars1[i] != chars2[j] {
                    continue;
                }
                s1_matches[i] = true;
                s2_matches[j] = true;
                matches += 1;
                break;
            }
        }

        if matches == 0 {
            return 0.0;
        }

        // Count transpositions
        let mut k = 0;
        for i in 0..len1 {
            if !s1_matches[i] {
                continue;
            }
            while !s2_matches[k] {
                k += 1;
            }
            if chars1[i] != chars2[k] {
                transpositions += 1;
            }
            k += 1;
        }

        let matches_f = matches as f32;
        (matches_f / len1 as f32 + matches_f / len2 as f32 + (matches_f - transpositions as f32 / 2.0) / matches_f) / 3.0
    }

    fn token_similarity(&self, query: &str, target: &str) -> f32 {
        let query_tokens: Vec<&str> = query.split_whitespace().collect();
        let target_tokens: Vec<&str> = target.split_whitespace().collect();

        if query_tokens.is_empty() || target_tokens.is_empty() {
            return 0.0;
        }

        let mut total_score = 0.0;
        let mut matched_tokens = 0;

        for query_token in &query_tokens {
            let mut best_score: f32 = 0.0;
            for target_token in &target_tokens {
                let score = self.levenshtein_similarity(query_token, target_token);
                best_score = best_score.max(score);
            }
            if best_score > 0.6 {
                // Only count tokens with reasonable similarity
                total_score += best_score;
                matched_tokens += 1;
            }
        }

        if matched_tokens == 0 {
            return 0.0;
        }

        // Average score of matched tokens, with bonus for matching more tokens
        let avg_score = total_score / matched_tokens as f32;
        let coverage_bonus = matched_tokens as f32 / query_tokens.len() as f32;
        avg_score * coverage_bonus
    }

    /// Check if a query matches a target with a minimum similarity threshold
    pub fn matches(&mut self, query: &str, target: &str, threshold: f32) -> bool {
        self.similarity(query, target) >= threshold
    }

    /// Find the best matching string from a list of candidates
    pub fn find_best_match(&mut self, query: &str, candidates: &[String]) -> Option<(String, f32)> {
        let mut best_match = None;
        let mut best_score: f32 = 0.0;

        for candidate in candidates {
            let score = self.similarity(query, candidate);
            if score > best_score {
                best_score = score;
                best_match = Some((candidate.clone(), score));
            }
        }

        best_match
    }
}

impl Default for FuzzyMatcher {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_exact_match() {
        let mut matcher = FuzzyMatcher::new();
        assert_eq!(matcher.similarity("atmosphere", "atmosphere"), 1.0);
    }

    #[test]
    fn test_typo_tolerance() {
        let mut matcher = FuzzyMatcher::new();
        // Common typos should have high similarity
        assert!(matcher.similarity("atmosphere", "atmoshere") > 0.8);
        assert!(matcher.similarity("atmosphere", "atmoshpere") > 0.7);
        assert!(matcher.similarity("atmosphere", "atmosfere") > 0.7);
    }

    #[test]
    fn test_substring_matching() {
        let mut matcher = FuzzyMatcher::new();
        assert!(matcher.similarity("atmo", "atmosphere") > 0.8);
        assert!(matcher.similarity("sphere", "atmosphere") > 0.8);
    }

    #[test]
    fn test_prefix_matching() {
        let mut matcher = FuzzyMatcher::new();
        assert!(matcher.similarity("atmos", "atmosphere") > 0.9);
    }

    #[test]
    fn test_token_matching() {
        let mut matcher = FuzzyMatcher::new();
        assert!(matcher.similarity("dark atmosphere", "atmospheric dark pad") > 0.7);
    }
}