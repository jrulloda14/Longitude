use serde::{Deserialize, Serialize};
#[derive(Clone, Copy, Debug, Serialize, Deserialize, PartialEq)]
pub struct Rect {
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
}
/// Restore into an actual work area, including negative-coordinate displays.
/// Dimensions are physical; caller converts logical minimums using target scale.
pub fn fit(saved: Rect, monitors: &[Rect], minimum: (u32, u32)) -> Option<Rect> {
    let monitor = monitors.iter().max_by_key(|m| intersection(saved, **m))?;
    let width = saved.width.max(minimum.0).min(monitor.width);
    let height = saved.height.max(minimum.1).min(monitor.height);
    Some(Rect {
        x: (saved.x as i64).clamp(
            monitor.x as i64,
            monitor.x as i64 + monitor.width as i64 - width as i64,
        ) as i32,
        y: (saved.y as i64).clamp(
            monitor.y as i64,
            monitor.y as i64 + monitor.height as i64 - height as i64,
        ) as i32,
        width,
        height,
    })
}
fn intersection(a: Rect, b: Rect) -> u64 {
    let width = ((a.x as i64 + a.width as i64).min(b.x as i64 + b.width as i64)
        - (a.x as i64).max(b.x as i64))
    .max(0);
    let height = ((a.y as i64 + a.height as i64).min(b.y as i64 + b.height as i64)
        - (a.y as i64).max(b.y as i64))
    .max(0);
    (width * height) as u64
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn negative_display_is_preserved() {
        let m = Rect {
            x: -1920,
            y: -100,
            width: 1920,
            height: 1080,
        };
        let r = Rect {
            x: -1000,
            y: 10,
            width: 850,
            height: 560,
        };
        assert_eq!(fit(r, &[m], (380, 480)), Some(r));
    }
    #[test]
    fn removed_display_and_oversized_window_are_clamped() {
        let m = Rect {
            x: 0,
            y: 0,
            width: 1920,
            height: 1040,
        };
        let r = fit(
            Rect {
                x: 4000,
                y: -500,
                width: 4000,
                height: 3000,
            },
            &[m],
            (380, 480),
        )
        .unwrap();
        assert_eq!(r, m);
    }
    #[test]
    fn tiny_window_gets_minimum() {
        assert_eq!(
            fit(
                Rect {
                    x: 0,
                    y: 0,
                    width: 1,
                    height: 1
                },
                &[Rect {
                    x: 0,
                    y: 0,
                    width: 1000,
                    height: 900
                }],
                (380, 480)
            )
            .unwrap()
            .width,
            380
        );
    }
    #[test]
    fn absent_displays_do_not_panic() {
        assert!(fit(
            Rect {
                x: 0,
                y: 0,
                width: 1,
                height: 1
            },
            &[],
            (1, 1)
        )
        .is_none());
    }
    #[test]
    fn fractional_scale_minimums() {
        for scale in [1.0, 1.25, 1.5, 2.0] {
            let minimum = ((380.0 * scale) as u32, (480.0 * scale) as u32);
            let r = fit(
                Rect {
                    x: 9999,
                    y: 9999,
                    width: 100,
                    height: 100,
                },
                &[Rect {
                    x: -200,
                    y: -100,
                    width: 3840,
                    height: 2160,
                }],
                minimum,
            )
            .unwrap();
            assert_eq!((r.width, r.height), minimum);
            assert!(r.x + r.width as i32 <= 3640);
        }
    }
}
