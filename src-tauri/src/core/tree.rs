use std::collections::BTreeMap;
use std::path::{Path, PathBuf};

use crate::models::{TreeNode, WatchedFolder};

/// Build one TreeNode per watched folder, with children reflecting the filesystem
/// hierarchy of every active asset underneath. Asset counts aggregate upward.
/// Watched folders with zero assets are excluded — they show as empty after deletion.
pub fn build(watched: &[WatchedFolder], asset_paths: &[String]) -> Vec<TreeNode> {
    watched
        .iter()
        .map(|wf| build_for_root(&wf.path, asset_paths))
        .filter(|node| node.asset_count > 0)
        .collect()
}

fn build_for_root(root_str: &str, asset_paths: &[String]) -> TreeNode {
    let root = PathBuf::from(root_str);
    let mut builder = NodeBuilder::new(&root);

    for ap in asset_paths {
        let p = Path::new(ap);
        if let Ok(rel) = p.strip_prefix(&root) {
            let parts: Vec<String> = rel
                .components()
                .map(|c| c.as_os_str().to_string_lossy().to_string())
                .collect();
            // Skip the file itself — we only organize by folders.
            if parts.len() > 1 {
                builder.insert(&parts[..parts.len() - 1]);
            } else {
                // File sits directly in the root — just increment root count.
                builder.inc_root();
            }
        }
    }

    builder.finish()
}

struct NodeBuilder {
    root_path: PathBuf,
    root_name: String,
    root_count: u32,
    children: BTreeMap<String, NodeBuilder>,
}

impl NodeBuilder {
    fn new(root: &Path) -> Self {
        let name = root
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or_else(|| root.to_str().unwrap_or(""))
            .to_string();
        Self {
            root_path: root.to_path_buf(),
            root_name: name,
            root_count: 0,
            children: BTreeMap::new(),
        }
    }

    fn inc_root(&mut self) {
        self.root_count += 1;
    }

    fn insert(&mut self, segments: &[String]) {
        self.root_count += 1;
        let mut cursor = self;
        for seg in segments {
            let next_path = cursor.root_path.join(seg);
            let child = cursor
                .children
                .entry(seg.clone())
                .or_insert_with(|| NodeBuilder::new(&next_path));
            child.root_count += 1;
            cursor = child;
        }
    }

    fn finish(self) -> TreeNode {
        let children = self
            .children
            .into_iter()
            .map(|(_, v)| v.finish())
            .collect();
        TreeNode {
            name: self.root_name,
            path: self.root_path.to_string_lossy().to_string(),
            asset_count: self.root_count,
            children,
        }
    }
}
