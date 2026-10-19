//! Portable snapshot authority. The shared TypeScript reducer computes actions;
//! this service validates and serializes conditional transactions, never timezones.
use crate::storage::Storage;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

#[derive(Clone, Serialize, Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Snapshot {
    pub revision: u64,
    pub state: Value,
    pub origin: String,
    pub request_id: String,
    pub warning: Option<String>,
}
#[derive(Serialize)]
pub struct Reply {
    pub accepted: bool,
    pub snapshot: Snapshot,
}
pub struct Authority {
    pub snapshot: Option<Snapshot>,
    pub storage: Storage,
    pub writable: bool,
    pub disk_expected: Option<String>,
}
impl Authority {
    pub fn initialize(&mut self, state: Value, writable: bool) -> Result<Snapshot, String> {
        if let Some(s) = &self.snapshot {
            return Ok(s.clone());
        }
        validate(&state)?;
        self.writable = writable;
        self.disk_expected = self.storage.read("longitude.configuration")?;
        let snapshot = Snapshot {
            revision: 1,
            state,
            origin: "host".into(),
            request_id: "initialize".into(),
            warning: None,
        };
        self.snapshot = Some(snapshot.clone());
        Ok(snapshot)
    }
    pub fn apply(
        &mut self,
        revision: u64,
        state: Value,
        origin: String,
        request_id: String,
    ) -> Result<Reply, String> {
        let current = self
            .snapshot
            .as_ref()
            .ok_or("Desktop state is still loading")?
            .clone();
        if current.revision != revision {
            return Ok(Reply {
                accepted: false,
                snapshot: current.clone(),
            });
        }
        if origin.len() > 128 || request_id.len() > 128 {
            return Err("Invalid transaction identifier".into());
        }
        validate(&state)?;
        if durable(&current.state) != durable(&state) {
            if !self.writable {
                return Err(
                    "Saving is disabled to preserve unreadable or future configuration".into(),
                );
            }
            self.persist(&state)?;
        }
        let next = Snapshot {
            revision: current
                .revision
                .checked_add(1)
                .filter(|v| *v < 9_007_199_254_740_991)
                .ok_or("State revision exhausted")?,
            state,
            origin,
            request_id,
            warning: None,
        };
        self.snapshot = Some(next.clone());
        Ok(Reply {
            accepted: true,
            snapshot: next,
        })
    }
    fn persist(&mut self, state: &Value) -> Result<(), String> {
        let original = self.storage.read("longitude.configuration")?;
        if original != self.disk_expected {
            return Err(
                "Saved settings changed outside this application; restart before saving".into(),
            );
        }
        let mut record: Value = serde_json::from_str(
            original
                .as_deref()
                .ok_or("Configuration has not been hydrated")?,
        )
        .map_err(|e| e.to_string())?;
        if record["format"] != 1 {
            return Err("Unsupported storage format; unchanged".into());
        }
        let head = record["current"]
            .as_str()
            .ok_or("Invalid saved head")?
            .to_owned();
        let envelope: Value = serde_json::from_str(&head).map_err(|e| e.to_string())?;
        if envelope["version"] != 1 {
            return Err("Unsupported schema; unchanged".into());
        }
        let revision = envelope["revision"]
            .as_u64()
            .filter(|v| *v < 9_007_199_254_740_990)
            .ok_or("Saved revision exhausted")?;
        let data = serde_json::to_string(
            &json!({"version":1,"revision":revision+1,"data":durable(state)}),
        )
        .map_err(|e| e.to_string())?;
        if data.len() > 2 * 1024 * 1024 {
            return Err("Configuration exceeds schema limit".into());
        }
        record["previous"] = Value::String(head);
        record["current"] = Value::String(data);
        let next = serde_json::to_string(&record).map_err(|e| e.to_string())?;
        if next.chars().map(|c| c.len_utf16()).sum::<usize>() > 8 * 1024 * 1024 {
            return Err("Recovery record exceeds schema limit; unchanged".into());
        }
        if !self
            .storage
            .cas("longitude.configuration", original.as_deref(), &next)?
        {
            return Err("Configuration changed in another process; restart before saving".into());
        }
        self.disk_expected = Some(next);
        Ok(())
    }
}
pub fn durable(state: &Value) -> Value {
    let mut data = serde_json::Map::new();
    for key in [
        "groups",
        "activeGroupId",
        "settings",
        "meeting",
        "onboarded",
        "coach",
    ] {
        data.insert(key.into(), state[key].clone());
    }
    Value::Object(data)
}
fn bounded_text(v: &Value, max: usize) -> bool {
    v.as_str()
        .is_some_and(|s| !s.trim().is_empty() && s.encode_utf16().count() <= max)
}
fn integer(v: &Value, low: i64, high: i64) -> bool {
    v.as_f64()
        .is_some_and(|n| n.is_finite() && n.fract() == 0.0 && n >= low as f64 && n <= high as f64)
}
fn hours(v: &Value, work: bool) -> bool {
    if !integer(&v["start"], 0, 1439) || !integer(&v["end"], 0, 1440) {
        return false;
    }
    if !work {
        return true;
    }
    let Some(days) = v["days"].as_array() else {
        return false;
    };
    let mut seen = std::collections::HashSet::new();
    if days.len() > 7
        || days
            .iter()
            .any(|d| !integer(d, 0, 6) || !seen.insert(d.to_string()))
    {
        return false;
    }
    if let Some(intervals) = v.get("intervals") {
        let Some(rows) = intervals.as_array() else {
            return false;
        };
        !rows.is_empty()
            && rows.len() <= 8
            && rows
                .iter()
                .all(|i| hours(i, false) && i["start"] != i["end"])
    } else {
        v["start"] != v["end"]
    }
}
pub fn validate(state: &Value) -> Result<(), String> {
    let check = || -> Option<()> {
        if serde_json::to_vec(state).ok()?.len() > 2 * 1024 * 1024 {
            return None;
        }
        let groups = state["groups"].as_array()?;
        if groups.is_empty() || groups.len() > 32 {
            return None;
        }
        let mut ids = std::collections::HashSet::new();
        let mut location_ids = std::collections::HashSet::new();
        for g in groups {
            if !bounded_text(&g["id"], 128)
                || !ids.insert(g["id"].as_str()?)
                || !bounded_text(&g["name"], 200)
            {
                return None;
            }
            let rows = g["locations"].as_array()?;
            if rows.len() > 32 {
                return None;
            }
            for l in rows {
                if !bounded_text(&l["id"], 128)
                    || !location_ids.insert(l["id"].as_str()?)
                    || !bounded_text(&l["name"], 200)
                    || !bounded_text(&l["country"], 200)
                    || !bounded_text(&l["zone"], 200)
                    || !hours(&l["work"], true)
                    || !hours(&l["sleep"], false)
                {
                    return None;
                }
                if !l["favorite"].is_boolean()
                    || !l["lat"]
                        .as_f64()
                        .is_some_and(|n| (-90.0..=90.0).contains(&n))
                    || !l["lon"]
                        .as_f64()
                        .is_some_and(|n| (-180.0..=180.0).contains(&n))
                {
                    return None;
                }
                if l.get("note")
                    .is_some_and(|v| !v.as_str().is_some_and(|s| s.encode_utf16().count() <= 200))
                {
                    return None;
                }
            }
            if !(g["referenceId"].is_null() && rows.is_empty()
                || rows.iter().any(|l| l["id"] == g["referenceId"]))
            {
                return None;
            }
        }
        if !groups.iter().any(|g| g["id"] == state["activeGroupId"]) {
            return None;
        }
        let s = &state["settings"];
        for key in [
            "hour12",
            "showTimeline",
            "widgetPinned",
            "trayIcon",
            "launchAtSignIn",
        ] {
            s[key].as_bool()?;
        }
        if ![json!(1), json!(5)].contains(&s["step"])
            || !["system", "dark", "light"].contains(&s["theme"].as_str()?)
            || !["windows", "macos"].contains(&s["chrome"].as_str()?)
            || !["system", "on", "off"].contains(&s["reducedMotion"].as_str()?)
            || !["hide", "quit"].contains(&s["closeBehavior"].as_str()?)
            || !bounded_text(&s["globalShortcut"], 100)
            || !hours(&s["defaultWork"], true)
            || !s["widgetOpacity"]
                .as_f64()
                .is_some_and(|n| (0.6..=1.0).contains(&n))
        {
            return None;
        }
        state["onboarded"].as_bool()?;
        state["coach"].as_bool()?;
        if !bounded_text(&state["meeting"]["title"], 500)
            || !integer(&state["meeting"]["durationMin"], 1, 1440)
        {
            return None;
        }
        state["meeting"]["weekly"].as_bool()?;
        if !state["selected"].is_null()
            && !integer(&state["selected"], -62135596800000, 253402300799999)
        {
            return None;
        }
        if !["clock", "planner", "settings"].contains(&state["view"].as_str()?)
            || state["mode"] != "full"
        {
            return None;
        }
        Some(())
    };
    check().ok_or_else(|| "Invalid desktop state; transaction rejected".into())
}

#[cfg(test)]
mod tests {
    use super::*;
    fn fixture() -> Value {
        serde_json::from_str(include_str!("../tests/fixtures/shared-state.json")).unwrap()
    }
    fn setup() -> (tempfile::TempDir, Authority) {
        let dir = tempfile::tempdir().unwrap();
        let storage = Storage::new(dir.path().into());
        let state = fixture();
        let envelope =
            serde_json::to_string(&json!({"version":1,"revision":1,"data":durable(&state)}))
                .unwrap();
        storage.cas("longitude.configuration",None,&json!({"format":1,"current":envelope,"previous":null,"recovery":"original recovery"}).to_string()).unwrap();
        let mut a = Authority {
            snapshot: None,
            storage,
            writable: false,
            disk_expected: None,
        };
        a.initialize(state, true).unwrap();
        (dir, a)
    }
    #[test]
    fn accepts_shared_typescript_fixture() {
        validate(&fixture()).unwrap();
    }
    #[test]
    fn stale_transaction_cannot_overwrite_current() {
        let (_d, mut a) = setup();
        let mut next = fixture();
        next["selected"] = json!(1000);
        assert!(a.apply(1, next, "a".into(), "1".into()).unwrap().accepted);
        let reply = a.apply(1, fixture(), "b".into(), "1".into()).unwrap();
        assert!(!reply.accepted);
        assert_eq!(reply.snapshot.state["selected"], 1000);
    }
    #[test]
    fn selection_and_view_never_write_disk() {
        let (_d, mut a) = setup();
        let before = a.storage.read("longitude.configuration").unwrap();
        let mut next = fixture();
        next["selected"] = json!(1234);
        next["view"] = json!("planner");
        a.apply(1, next, "a".into(), "1".into()).unwrap();
        assert_eq!(before, a.storage.read("longitude.configuration").unwrap());
    }
    #[test]
    fn durable_commit_preserves_recovery_and_backup() {
        let (_d, mut a) = setup();
        let before: Value = serde_json::from_str(a.disk_expected.as_ref().unwrap()).unwrap();
        let mut next = fixture();
        next["settings"]["theme"] = json!("light");
        a.apply(1, next, "a".into(), "1".into()).unwrap();
        let after: Value = serde_json::from_str(a.disk_expected.as_ref().unwrap()).unwrap();
        assert_eq!(after["recovery"], before["recovery"]);
        assert_eq!(after["previous"], before["current"]);
        let envelope: Value = serde_json::from_str(after["current"].as_str().unwrap()).unwrap();
        assert_eq!(envelope["revision"], 2);
        assert_eq!(envelope["data"]["settings"]["theme"], "light");
        assert!(envelope["data"].get("selected").is_none());
    }
    #[test]
    fn external_edit_is_never_silently_overwritten() {
        let (_d, mut a) = setup();
        a.storage
            .cas(
                "longitude.configuration",
                a.disk_expected.as_deref(),
                "{externally changed",
            )
            .unwrap();
        let mut next = fixture();
        next["settings"]["theme"] = json!("light");
        assert!(a.apply(1, next, "a".into(), "1".into()).is_err());
        assert_eq!(a.snapshot.unwrap().revision, 1);
        assert_eq!(
            a.storage.read("longitude.configuration").unwrap().unwrap(),
            "{externally changed"
        );
    }
    #[test]
    fn readonly_future_data_allows_session_actions_but_no_durable_edits() {
        let (_d, mut a) = setup();
        a.writable = false;
        let mut next = fixture();
        next["selected"] = json!(1234);
        a.apply(1, next.clone(), "a".into(), "1".into()).unwrap();
        next["settings"]["theme"] = json!("light");
        assert!(a.apply(2, next, "a".into(), "2".into()).is_err());
        assert_eq!(a.snapshot.unwrap().revision, 2);
    }
    #[test]
    fn duplicate_ids_invalid_refs_and_intervals_rejected() {
        for case in 0..5 {
            let mut state = fixture();
            match case {
                0 => state["groups"][1]["id"] = state["groups"][0]["id"].clone(),
                1 => state["groups"][0]["referenceId"] = json!("missing"),
                2 => state["settings"]["defaultWork"]["days"] = json!([1, 1]),
                3 => state["settings"]["widgetOpacity"] = json!(2),
                _ => state["selected"] = json!(1.5),
            }
            assert!(validate(&state).is_err());
        }
    }
    #[test]
    fn failed_storage_never_advances_canonical_revision() {
        let (dir, mut a) = setup();
        std::fs::remove_file(dir.path().join("configuration.json")).unwrap();
        std::fs::create_dir(dir.path().join("configuration.json")).unwrap();
        let mut next = fixture();
        next["settings"]["theme"] = json!("light");
        assert!(a.apply(1, next, "a".into(), "1".into()).is_err());
        assert_eq!(a.snapshot.unwrap().revision, 1);
    }
    #[test]
    fn latest_session_state_is_shared_with_late_subscribers() {
        let (_d, mut a) = setup();
        let mut next = fixture();
        next["selected"] = json!(1234);
        a.apply(1, next, "a".into(), "1".into()).unwrap();
        assert_eq!(
            a.initialize(fixture(), true).unwrap().state["selected"],
            1234
        );
    }
}
