use std::fs::File;
use std::io::{Read, Seek, SeekFrom};
use std::path::Path;

use xxhash_rust::xxh3::Xxh3;

use crate::error::Result;

const CHUNK: usize = 64 * 1024;
const HEAD_BYTES: u64 = 256 * 1024;
const TAIL_BYTES: u64 = 256 * 1024;

/// Content identity hash: file size + first 256KB + last 256KB (if large enough).
/// Avoids scanning multi-gigabyte files while still collision-resistant for music files.
pub fn hash_file(path: &Path) -> Result<String> {
    let mut file = File::open(path)?;
    let size = file.metadata()?.len();

    let mut hasher = Xxh3::new();
    hasher.update(&size.to_le_bytes());

    hash_limited(&mut file, &mut hasher, HEAD_BYTES)?;

    if size > HEAD_BYTES + TAIL_BYTES {
        file.seek(SeekFrom::End(-(TAIL_BYTES as i64)))?;
        hash_limited(&mut file, &mut hasher, TAIL_BYTES)?;
    }

    Ok(format!("{:x}", hasher.digest128()))
}

fn hash_limited(file: &mut File, hasher: &mut Xxh3, max: u64) -> std::io::Result<()> {
    let mut buf = vec![0u8; CHUNK];
    let mut remaining = max;
    while remaining > 0 {
        let want = std::cmp::min(buf.len() as u64, remaining) as usize;
        let n = file.read(&mut buf[..want])?;
        if n == 0 {
            break;
        }
        hasher.update(&buf[..n]);
        remaining -= n as u64;
    }
    Ok(())
}
