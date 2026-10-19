//! Fixed-key, cross-process conditional storage. No frontend-supplied paths.
use std::{
    fs::{self, File, OpenOptions},
    io::{Read, Write},
    path::{Path, PathBuf},
};

pub const MAX_BYTES: u64 = 32 * 1024 * 1024; // accommodates the bounded UTF-16 repository record
pub struct Storage {
    root: PathBuf,
}
impl Storage {
    pub fn new(root: PathBuf) -> Self {
        Self { root }
    }
    fn path(&self, key: &str) -> Result<PathBuf, String> {
        match key {
            "longitude.configuration" => Ok(self.root.join("configuration.json")),
            "longitude.v1" => Ok(self.root.join("legacy-v1.json")),
            _ => Err("Unsupported configuration key".into()),
        }
    }
    fn lock(&self) -> Result<File, String> {
        fs::create_dir_all(&self.root).map_err(err)?;
        let f = OpenOptions::new()
            .read(true)
            .write(true)
            .create(true)
            .truncate(false)
            .open(self.root.join("configuration.lock"))
            .map_err(err)?;
        f.try_lock()
            .map_err(|e| format!("Configuration storage is busy or unavailable: {e}"))?;
        Ok(f)
    }
    pub fn read(&self, key: &str) -> Result<Option<String>, String> {
        let path = self.path(key)?;
        let _lock = self.lock()?;
        read_bounded(&path)
    }
    pub fn cas(&self, key: &str, expected: Option<&str>, next: &str) -> Result<bool, String> {
        if key != "longitude.configuration" {
            return Err("Only current configuration is writable".into());
        }
        if next.len() as u64 > MAX_BYTES {
            return Err("Configuration exceeds storage limit".into());
        }
        let path = self.path(key)?;
        let _lock = self.lock()?;
        if read_bounded(&path)?.as_deref() != expected {
            return Ok(false);
        }
        atomic_write(&path, next.as_bytes())?;
        Ok(true)
    }
}
fn err(e: impl std::fmt::Display) -> String {
    e.to_string()
}
fn read_bounded(path: &Path) -> Result<Option<String>, String> {
    let f = match File::open(path) {
        Ok(f) => f,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(e) => return Err(err(e)),
    };
    if f.metadata().map_err(err)?.len() > MAX_BYTES {
        return Err("Saved file exceeds storage limit; unchanged".into());
    }
    let mut s = String::new();
    f.take(MAX_BYTES + 1).read_to_string(&mut s).map_err(err)?;
    if s.len() as u64 > MAX_BYTES {
        return Err("Saved file exceeds storage limit; unchanged".into());
    }
    Ok(Some(s))
}
fn atomic_write(path: &Path, bytes: &[u8]) -> Result<(), String> {
    let root = path.parent().ok_or("Missing configuration directory")?;
    let mut pending = tempfile::NamedTempFile::new_in(root).map_err(err)?;
    pending.write_all(bytes).map_err(err)?;
    pending.as_file().sync_all().map_err(err)?;
    pending.persist(path).map_err(err)?;
    // POSIX directory metadata sync complements the flushed file. Windows atomic
    // replacement uses tempfile's platform implementation; no hard-coded paths.
    #[cfg(unix)]
    File::open(root).and_then(|f| f.sync_all()).map_err(err)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn restart_and_conditional_replacement() {
        let dir = tempfile::tempdir().unwrap();
        let a = Storage::new(dir.path().into());
        assert_eq!(a.read("longitude.configuration").unwrap(), None);
        assert!(a.cas("longitude.configuration", None, "first").unwrap());
        let b = Storage::new(dir.path().into());
        assert_eq!(
            b.read("longitude.configuration").unwrap().as_deref(),
            Some("first")
        );
        assert!(!b.cas("longitude.configuration", None, "stale").unwrap());
        assert!(b
            .cas("longitude.configuration", Some("first"), "second")
            .unwrap());
        assert_eq!(
            a.read("longitude.configuration").unwrap().as_deref(),
            Some("second")
        );
    }
    #[test]
    fn path_and_legacy_restrictions() {
        let dir = tempfile::tempdir().unwrap();
        let s = Storage::new(dir.path().into());
        for key in ["../other", "C:\\secret", "", "configuration.json"] {
            assert!(s.read(key).is_err());
            assert!(s.cas(key, None, "x").is_err());
        }
        assert!(s.cas("longitude.v1", None, "x").is_err());
    }
    #[test]
    fn interrupted_prepared_file_does_not_replace_head() {
        let dir = tempfile::tempdir().unwrap();
        let s = Storage::new(dir.path().into());
        s.cas("longitude.configuration", None, "good").unwrap();
        {
            let mut temp = tempfile::NamedTempFile::new_in(dir.path()).unwrap();
            temp.write_all(b"partial").unwrap();
            temp.as_file().sync_all().unwrap();
        }
        assert_eq!(
            s.read("longitude.configuration").unwrap().as_deref(),
            Some("good")
        );
    }
    #[test]
    fn failed_replace_keeps_original() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("directory");
        fs::create_dir(&path).unwrap();
        assert!(atomic_write(&path, b"new").is_err());
        assert!(path.is_dir());
    }
    #[test]
    fn concurrent_writers_cannot_both_win() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path().to_path_buf();
        let threads: Vec<_> = (0..8)
            .map(|i| {
                let root = root.clone();
                std::thread::spawn(move || {
                    Storage::new(root)
                        .cas("longitude.configuration", None, &i.to_string())
                        .unwrap_or(false)
                })
            })
            .collect();
        assert_eq!(
            threads
                .into_iter()
                .filter_map(|t| t.join().ok())
                .filter(|ok| *ok)
                .count(),
            1
        );
    }
    #[test]
    fn malformed_data_is_returned_intact_for_shared_recovery() {
        let dir = tempfile::tempdir().unwrap();
        fs::write(dir.path().join("configuration.json"), "{broken").unwrap();
        assert_eq!(
            Storage::new(dir.path().into())
                .read("longitude.configuration")
                .unwrap()
                .as_deref(),
            Some("{broken")
        );
    }
    #[test]
    fn held_lock_fails_visibly_instead_of_blocking_the_ui() {
        let dir = tempfile::tempdir().unwrap();
        let s = Storage::new(dir.path().into());
        let _held = s.lock().unwrap();
        assert!(s
            .read("longitude.configuration")
            .unwrap_err()
            .contains("busy"));
        assert!(s
            .cas("longitude.configuration", None, "new")
            .unwrap_err()
            .contains("busy"));
    }
}
