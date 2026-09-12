//! Nastaliq / Arabic-script text shaping.
//!
//! This is the genuinely hard part of an Urdu DTP app — turning a string of
//! Unicode code points into correctly joined, ligated, positioned glyphs in the
//! Nastaliq calligraphic style. We lean on `rustybuzz` (a pure-Rust port of
//! HarfBuzz) which carries the same complex-shaping logic HarfBuzz uses for
//! fonts like Noto Nastaliq Urdu and Gulzar — including bari-ye handling.
//!
//! The frontend sends us text + a loaded font (bytes) + size; we return per-glyph
//! positioning the canvas can draw precisely. This keeps typesetting fidelity in
//! Rust where we control it, instead of relying on the browser's line breaker.

use serde::Serialize;

/// One positioned glyph, ready for the renderer to place on a page.
#[derive(Serialize, Clone, Debug)]
pub struct ShapedGlyph {
    /// Glyph index within the font (for canvas/SVG glyph rendering).
    pub glyph_id: u32,
    /// Cluster = byte offset in the source string this glyph maps back to.
    /// Critical for cursor placement / selection in an RTL editor.
    pub cluster: u32,
    /// Horizontal advance in pixels at the requested font size.
    pub x_advance: f32,
    /// Vertical advance (0 for horizontal Urdu text, but kept for completeness).
    pub y_advance: f32,
    /// Per-glyph offset from the pen position, in pixels.
    pub x_offset: f32,
    pub y_offset: f32,
}

/// Result of shaping a single run of text.
#[derive(Serialize, Clone, Debug)]
pub struct ShapedRun {
    pub glyphs: Vec<ShapedGlyph>,
    /// Total width of the run in pixels — used by the line breaker / justifier.
    pub total_advance: f32,
    /// Whether shaping detected right-to-left direction.
    pub rtl: bool,
}

/// A laid-out, positioned glyph with its vector outline as an SVG path.
/// This is what the print-grade canvas/SVG renderer consumes directly: it has the
/// final pen position and the exact glyph contours, so rendering is true vector
/// typesetting (no reliance on the browser's own shaping).
#[derive(Serialize, Clone, Debug)]
pub struct RenderGlyph {
    pub glyph_id: u32,
    pub cluster: u32,
    /// Pen X (right edge for RTL) in page px, before applying x_offset.
    pub pen_x: f32,
    /// Baseline Y in page px.
    pub pen_y: f32,
    pub x_offset: f32,
    pub y_offset: f32,
    /// SVG path data ("M..L..Q..Z") in page px, already positioned & y-flipped
    /// so it draws correctly in screen coordinates (y-down). Empty for blanks.
    pub path: String,
}

/// A single laid-out line of glyphs.
#[derive(Serialize, Clone, Debug)]
pub struct RenderLine {
    pub glyphs: Vec<RenderGlyph>,
    pub width: f32,
    pub baseline_y: f32,
}

/// Full layout of a text frame: lines of positioned vector glyphs.
#[derive(Serialize, Clone, Debug)]
pub struct RenderLayout {
    pub lines: Vec<RenderLine>,
    /// Total height consumed (px) — lets the UI detect overflow for frame linking.
    pub used_height: f32,
    pub rtl: bool,
}

/// Collects ttf-parser outline callbacks into an SVG path string, scaling font
/// units to px and flipping Y (font space is y-up; screen is y-down).
struct SvgOutline {
    path: String,
    scale: f32,
    /// Pen origin in screen px that the glyph is drawn relative to.
    ox: f32,
    oy: f32,
}

impl ttf_parser::OutlineBuilder for SvgOutline {
    fn move_to(&mut self, x: f32, y: f32) {
        self.path
            .push_str(&format!("M{:.2} {:.2}", self.ox + x * self.scale, self.oy - y * self.scale));
    }
    fn line_to(&mut self, x: f32, y: f32) {
        self.path
            .push_str(&format!("L{:.2} {:.2}", self.ox + x * self.scale, self.oy - y * self.scale));
    }
    fn quad_to(&mut self, x1: f32, y1: f32, x: f32, y: f32) {
        self.path.push_str(&format!(
            "Q{:.2} {:.2} {:.2} {:.2}",
            self.ox + x1 * self.scale,
            self.oy - y1 * self.scale,
            self.ox + x * self.scale,
            self.oy - y * self.scale
        ));
    }
    fn curve_to(&mut self, x1: f32, y1: f32, x2: f32, y2: f32, x: f32, y: f32) {
        self.path.push_str(&format!(
            "C{:.2} {:.2} {:.2} {:.2} {:.2} {:.2}",
            self.ox + x1 * self.scale,
            self.oy - y1 * self.scale,
            self.ox + x2 * self.scale,
            self.oy - y2 * self.scale,
            self.ox + x * self.scale,
            self.oy - y * self.scale
        ));
    }
    fn close(&mut self) {
        self.path.push('Z');
    }
}

// ── Kashida (کشیدہ) justification ───────────────────────────────────────────
//
// Latin text justifies by stretching the SPACES between words. Arabic-script
// text justifies by elongating the connecting strokes WITHIN words — the
// kashida. Space-justification applied to Urdu produces the rivers of white
// space that make browser-rendered Urdu look visibly wrong to a typesetter,
// which is why this is the defining feature of real Nastaliq typesetting.
//
// We elongate by inserting U+0640 ARABIC TATWEEL at valid positions and letting
// the shaper do the rest: rustybuzz joins the tatweel into the surrounding
// letters, so the stroke genuinely lengthens rather than a separate glyph being
// drawn. Not every gap is a legal kashida site, and not every legal site is
// equally good, so candidates are ranked by typographic priority.

/// A position where a tatweel may be inserted, with a priority (higher = better).
#[derive(Clone, Copy, Debug)]
struct KashidaSite {
    /// Byte index in the line string at which to insert the tatweel.
    byte_idx: usize,
    priority: u8,
}

/// Letters that never connect to the FOLLOWING letter (right-joining only).
/// A kashida cannot be placed after these — the stroke would not join.
fn is_non_connecting(c: char) -> bool {
    matches!(
        c,
        'ا' | 'آ' | 'أ' | 'إ' | 'ٱ' | 'د' | 'ذ' | 'ڈ' | 'ر' | 'ز' | 'ژ' | 'ڑ'
            | 'و' | 'ؤ' | 'ے' | 'ۓ' | 'ء'
    )
}

/// Whether `c` is an Arabic-script letter that can bear a connection at all.
fn is_arabic_letter(c: char) -> bool {
    matches!(c as u32, 0x0620..=0x064A | 0x066E..=0x06D3 | 0x06FA..=0x06FF | 0x0750..=0x077F)
}

/// Combining marks (harakat) — skipped when looking for the real letter.
fn is_mark(c: char) -> bool {
    matches!(c as u32, 0x064B..=0x065F | 0x0670 | 0x06D6..=0x06ED)
}

/// Priority of a kashida placed between `prev` and `next`.
///
/// Ordering follows classical Arabic/Urdu typesetting practice: elongate before
/// a final letter first, then after specific letters that carry a long stroke
/// well, and avoid stretching immediately after the first letter of a word.
fn site_priority(prev: char, next: char, is_word_final_next: bool) -> Option<u8> {
    if !is_arabic_letter(prev) || is_non_connecting(prev) {
        return None; // prev cannot connect forward — illegal site
    }
    if !is_arabic_letter(next) {
        return None;
    }
    // Before the final letter of a word is the classic, most natural stretch.
    if is_word_final_next {
        return Some(5);
    }
    // After these the kashida sits particularly well (long flat stroke).
    if matches!(prev, 'ک' | 'گ' | 'ل' | 'ط' | 'ظ' | 'ب' | 'ت' | 'ث' | 'ن' | 'ی' | 'س' | 'ش') {
        return Some(4);
    }
    // Generic legal connection.
    Some(2)
}

/// Find every legal kashida insertion point in `line`, best first.
fn kashida_sites(line: &str) -> Vec<KashidaSite> {
    let chars: Vec<(usize, char)> = line.char_indices().collect();
    let mut sites = Vec::new();

    for i in 0..chars.len() {
        let (_, prev) = chars[i];
        if is_mark(prev) {
            continue;
        }
        // Find the next non-mark character.
        let mut j = i + 1;
        while j < chars.len() && is_mark(chars[j].1) {
            j += 1;
        }
        if j >= chars.len() {
            break;
        }
        let (next_idx, next) = chars[j];

        // Is `next` the last letter of its word?
        let mut k = j + 1;
        while k < chars.len() && is_mark(chars[k].1) {
            k += 1;
        }
        let is_word_final = k >= chars.len() || !is_arabic_letter(chars[k].1);

        if let Some(priority) = site_priority(prev, next, is_word_final) {
            sites.push(KashidaSite { byte_idx: next_idx, priority });
        }
    }

    // Best sites first; ties broken by position so elongation spreads along the
    // line instead of clustering at one end.
    sites.sort_by(|a, b| b.priority.cmp(&a.priority).then(a.byte_idx.cmp(&b.byte_idx)));
    sites
}

/// Insert `n` tatweels at each of the first `sites_used` sites of `line`.
fn apply_kashida(line: &str, sites: &[KashidaSite], per_site: &[usize]) -> String {
    let mut inserts: Vec<(usize, usize)> = sites
        .iter()
        .zip(per_site.iter())
        .filter(|(_, &n)| n > 0)
        .map(|(s, &n)| (s.byte_idx, n))
        .collect();
    // Descending byte order so earlier offsets stay valid as we splice.
    inserts.sort_by(|a, b| b.0.cmp(&a.0));

    let mut out = line.to_string();
    for (idx, n) in inserts {
        let tatweels: String = std::iter::repeat('ـ').take(n).collect();
        out.insert_str(idx, &tatweels);
    }
    out
}

/// Justify `line` to `target_width` by inserting kashidas, returning the new
/// string.
///
/// ── Why this measures instead of calculating ────────────────────────────────
/// The obvious implementation — measure one tatweel, divide the deficit by it —
/// is wrong for this script. A tatweel is not a spacer glyph: it changes which
/// contextual form the neighbouring letters take, so its effect on width is a
/// property of the *font and the surrounding letters*, not a constant. Measured
/// on the bundled faces at 32px, inserting one tatweel into the same line gives:
///
///   Noto Naskh Arabic   +6.7px      Amiri   +5.9px
///   Gulzar (Nastaliq)  +22.3px      Noto Nastaliq Urdu   +0.0px
///
/// Noto Nastaliq Urdu — Harfsaz's DEFAULT font — ignores tatweel entirely: its
/// isolated tatweel has zero advance and the face substitutes the same
/// contextual forms regardless. So we grow the elongation stepwise and measure
/// the real shaped width each round, stopping when we reach the target or when
/// a round produces no gain (which is how the Noto Nastaliq case exits cleanly,
/// leaving the line ragged rather than silently corrupting it with invisible
/// tatweels).
fn justify_with_kashida(
    line: &str,
    face: &rustybuzz::Face,
    scale: f32,
    target_width: f32,
) -> String {
    let natural = measure(line, face, scale);
    if target_width - natural <= 0.5 {
        return line.to_string(); // already at/over the measure
    }

    let sites = kashida_sites(line);
    if sites.is_empty() {
        return line.to_string();
    }

    // Cap per-site elongation so one joint never becomes a caricature.
    const MAX_PER_SITE: usize = 4;

    let mut per_site = vec![0usize; sites.len()];
    let mut best = line.to_string();
    let mut best_width = natural;

    // Round-robin across sites (best-priority first), re-measuring each step.
    'outer: for _round in 0..MAX_PER_SITE {
        for i in 0..sites.len() {
            per_site[i] += 1;
            let candidate = apply_kashida(line, &sites, &per_site);
            let w = measure(&candidate, face, scale);

            if w > target_width + 0.5 {
                // Overshoot — this tatweel is one too many; keep the previous best.
                per_site[i] -= 1;
                break 'outer;
            }
            if w <= best_width + 0.01 {
                // No gain: this font ignores tatweel (or this site does nothing).
                // Undo and stop — further insertions would add invisible
                // characters to the text without ever reaching the measure.
                per_site[i] -= 1;
                break 'outer;
            }

            best = candidate;
            best_width = w;
            if target_width - best_width <= 0.5 {
                break 'outer; // close enough
            }
        }
    }

    best
}

/// Shape and lay out `text` into a frame of `frame_width` px with simple greedy
/// word wrapping, returning positioned vector glyphs ready to paint.
///
/// RTL-aware: lines start at the right edge and advance leftward. Line height is
/// derived from the font size (Nastaliq needs generous leading).
pub fn layout_text(
    text: &str,
    font_bytes: &[u8],
    font_size: f32,
    frame_width: f32,
    align: &str,
) -> Result<RenderLayout, String> {
    let face = rustybuzz::Face::from_slice(font_bytes, 0)
        .ok_or_else(|| "Failed to parse font (not a valid ttf/otf)".to_string())?;
    let parser_face = ttf_parser::Face::parse(font_bytes, 0)
        .map_err(|e| format!("ttf-parser could not read font: {e}"))?;

    let units_per_em = face.units_per_em() as f32;
    if units_per_em <= 0.0 {
        return Err("Font reported invalid units-per-em".into());
    }
    let scale = font_size / units_per_em;
    let line_height = font_size * 2.1; // generous leading for Nastaliq
    let pad = 10.0_f32; // inner padding matching the editor frame

    // Nastaliq glyphs ascend far above the baseline. Use the font's real ascender
    // so the first line isn't clipped at the top of the frame. Fall back to a
    // generous multiple of the font size if the metric is missing/zero.
    let ascender_px = {
        let a = parser_face.ascender() as f32 * scale;
        if a > 0.0 { a } else { font_size * 1.2 }
    };

    let rtl_default = true;
    let mut lines: Vec<RenderLine> = Vec::new();
    let mut baseline = pad + ascender_px; // first baseline sits below the ascent

    // Greedy word-wrap on each source line (respect explicit newlines).
    for source_line in text.split('\n') {
        let words: Vec<&str> = source_line.split(' ').collect();
        let mut current = String::new();

        // `justify_last` is false for the final line of a paragraph: stretching
        // it to the full measure is the classic justification bug (a two-word
        // last line spread across the whole column).
        let flush = |line_str: &str,
                     baseline: f32,
                     justify_this: bool|
         -> Result<Option<RenderLine>, String> {
            if line_str.trim().is_empty() {
                return Ok(None);
            }
            let content_width = frame_width - pad * 2.0;
            let owned;
            let to_shape = if justify_this && align == "justify" {
                owned = justify_with_kashida(line_str, &face, scale, content_width);
                owned.as_str()
            } else {
                line_str
            };
            Ok(Some(shape_line(
                to_shape,
                &face,
                &parser_face,
                scale,
                frame_width,
                pad,
                baseline,
                align,
            )?))
        };

        for word in words {
            let candidate = if current.is_empty() {
                word.to_string()
            } else {
                format!("{current} {word}")
            };
            let w = measure(&candidate, &face, scale);
            if w > frame_width - pad * 2.0 && !current.is_empty() {
                // A line that wrapped is a full measure line — justify it.
                if let Some(l) = flush(&current, baseline, true)? {
                    lines.push(l);
                    baseline += line_height;
                }
                current = word.to_string();
            } else {
                current = candidate;
            }
        }
        // Last line of the paragraph: never justified.
        if let Some(l) = flush(&current, baseline, false)? {
            lines.push(l);
            baseline += line_height;
        } else if source_line.is_empty() {
            baseline += line_height; // blank line
        }
    }

    let used_height = baseline - font_size + pad;
    Ok(RenderLayout {
        lines,
        used_height,
        rtl: rtl_default,
    })
}

/// Measure the shaped width of a string in px.
fn measure(text: &str, face: &rustybuzz::Face, scale: f32) -> f32 {
    let mut buffer = rustybuzz::UnicodeBuffer::new();
    buffer.push_str(text);
    buffer.guess_segment_properties();
    let shaped = rustybuzz::shape(face, &[], buffer);
    shaped
        .glyph_positions()
        .iter()
        .map(|p| p.x_advance as f32 * scale)
        .sum()
}

/// Shape one line and emit positioned vector glyphs. RTL lines are pinned to the
/// right edge of the frame and advance leftward.
fn shape_line(
    text: &str,
    face: &rustybuzz::Face,
    parser_face: &ttf_parser::Face,
    scale: f32,
    frame_width: f32,
    pad: f32,
    baseline: f32,
    align: &str,
) -> Result<RenderLine, String> {
    let mut buffer = rustybuzz::UnicodeBuffer::new();
    buffer.push_str(text);
    buffer.guess_segment_properties();
    let rtl = buffer.direction() == rustybuzz::Direction::RightToLeft;
    let shaped = rustybuzz::shape(face, &[], buffer);

    let infos = shaped.glyph_infos();
    let positions = shaped.glyph_positions();
    let line_width: f32 = positions.iter().map(|p| p.x_advance as f32 * scale).sum();

    // rustybuzz returns glyphs in VISUAL order (already reordered for RTL), so we
    // use the canonical pen model: a cursor that starts at the line's left edge
    // and INCREASES by each glyph's advance. Each glyph (including zero-advance
    // marks/dots) is drawn at cursor + x_offset, which positions marks correctly
    // relative to their base. (The earlier right-to-left decrementing pen broke
    // Nastaliq mark placement.) For RTL we right-justify the whole run.
    let content_width = frame_width - pad * 2.0;
    let start_x = match align {
        "center" => pad + (content_width - line_width) / 2.0,
        // A justified line has already been stretched to the measure by the
        // kashida pass, so it starts at the same edge as its natural direction.
        "left" => pad,
        "right" => (frame_width - pad - line_width).max(pad),
        _ => {
            if rtl {
                (frame_width - pad - line_width).max(pad)
            } else {
                pad
            }
        }
    };
    let start_x = start_x.max(pad);

    let mut cursor = start_x;
    let mut glyphs = Vec::with_capacity(infos.len());
    for (info, pos) in infos.iter().zip(positions.iter()) {
        let x_advance = pos.x_advance as f32 * scale;
        let x_offset = pos.x_offset as f32 * scale;
        let y_offset = pos.y_offset as f32 * scale;

        let glyph_origin_x = cursor + x_offset;

        let mut builder = SvgOutline {
            path: String::new(),
            scale,
            ox: glyph_origin_x,
            oy: baseline - y_offset,
        };
        let gid = ttf_parser::GlyphId(info.glyph_id as u16);
        let _ = parser_face.outline_glyph(gid, &mut builder);

        glyphs.push(RenderGlyph {
            glyph_id: info.glyph_id,
            cluster: info.cluster,
            pen_x: glyph_origin_x,
            pen_y: baseline,
            x_offset,
            y_offset,
            path: builder.path,
        });

        cursor += x_advance;
    }

    Ok(RenderLine {
        glyphs,
        width: line_width,
        baseline_y: baseline,
    })
}

/// Shape `text` using the given font bytes at `font_size` px.
///
/// `font_bytes` is the raw .ttf/.otf (e.g. Noto Nastaliq Urdu) passed from the
/// frontend. We resolve the units-per-em from the font and scale advances to px.
pub fn shape_text(
    text: &str,
    font_bytes: &[u8],
    font_size: f32,
) -> Result<ShapedRun, String> {
    let face = rustybuzz::Face::from_slice(font_bytes, 0)
        .ok_or_else(|| "Failed to parse font (not a valid ttf/otf)".to_string())?;

    let units_per_em = face.units_per_em() as f32;
    if units_per_em <= 0.0 {
        return Err("Font reported invalid units-per-em".into());
    }
    let scale = font_size / units_per_em;

    let mut buffer = rustybuzz::UnicodeBuffer::new();
    buffer.push_str(text);
    // Let rustybuzz auto-detect script/direction from the content; Urdu resolves
    // to Arabic script + RTL automatically.
    buffer.guess_segment_properties();
    let rtl = buffer.direction() == rustybuzz::Direction::RightToLeft;

    let glyph_buffer = rustybuzz::shape(&face, &[], buffer);

    let infos = glyph_buffer.glyph_infos();
    let positions = glyph_buffer.glyph_positions();

    let mut glyphs = Vec::with_capacity(infos.len());
    let mut total_advance = 0.0_f32;

    for (info, pos) in infos.iter().zip(positions.iter()) {
        let x_advance = pos.x_advance as f32 * scale;
        let y_advance = pos.y_advance as f32 * scale;
        total_advance += x_advance;

        glyphs.push(ShapedGlyph {
            glyph_id: info.glyph_id,
            cluster: info.cluster,
            x_advance,
            y_advance,
            x_offset: pos.x_offset as f32 * scale,
            y_offset: pos.y_offset as f32 * scale,
        });
    }

    Ok(ShapedRun {
        glyphs,
        total_advance,
        rtl,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    // "یہ ایک اردو جملہ ہے جو انصاف کے ساتھ لکھا گیا"
    const URDU: &str = "یہ ایک اردو جملہ ہے جو انصاف کے ساتھ لکھا گیا";

    #[test]
    fn kashida_never_follows_a_non_connecting_letter() {
        // ا د ذ ر ز و ے never join to the LEFT, so a tatweel after one would
        // render as a detached floating stroke — the classic bug.
        for site in kashida_sites(URDU) {
            let before: char = URDU[..site.byte_idx].chars().next_back().unwrap();
            assert!(
                !is_non_connecting(before),
                "illegal kashida after non-connecting {:?} at byte {}",
                before, site.byte_idx
            );
        }
    }

    #[test]
    fn kashida_sites_are_valid_char_boundaries() {
        // Inserting at a non-boundary would panic on insert_str.
        for site in kashida_sites(URDU) {
            assert!(URDU.is_char_boundary(site.byte_idx));
        }
    }

    #[test]
    fn kashida_never_splits_across_a_space() {
        // A tatweel must stay inside a word; between words it is meaningless.
        for site in kashida_sites(URDU) {
            let before: char = URDU[..site.byte_idx].chars().next_back().unwrap();
            let after: char = URDU[site.byte_idx..].chars().next().unwrap();
            assert!(before != ' ' && after != ' ', "kashida adjacent to a space");
        }
    }

    #[test]
    fn latin_text_has_no_kashida_sites() {
        assert!(kashida_sites("hello world this is latin").is_empty());
    }

    #[test]
    fn sites_are_ordered_best_first() {
        let sites = kashida_sites(URDU);
        assert!(!sites.is_empty(), "expected kashida opportunities in Urdu text");
        for w in sites.windows(2) {
            assert!(w[0].priority >= w[1].priority, "sites not sorted by priority");
        }
    }

    #[test]
    fn justification_is_a_noop_when_line_already_fits() {
        let bytes = match std::fs::read("../public/fonts/NotoNastaliqUrdu-Regular.ttf") {
            Ok(b) => b,
            Err(_) => return,
        };
        let face = rustybuzz::Face::from_slice(&bytes, 0).expect("font parses");
        let scale = 32.0 / face.units_per_em() as f32;
        let line = "یہ ایک اردو جملہ";
        let natural = measure(line, &face, scale);
        // Target smaller than natural: must not shrink or corrupt the text.
        let out = justify_with_kashida(line, &face, scale, natural - 20.0);
        assert_eq!(out, line, "must not modify a line that already overflows");
    }



    /// Load a bundled font for tests, or None when the checkout lacks it.
    fn test_face(file: &str) -> Option<Vec<u8>> {
        std::fs::read(format!("../public/fonts/{file}")).ok()
    }

    #[test]
    fn justification_reaches_the_measure_when_the_font_supports_tatweel() {
        // Noto Naskh elongates properly (+~6.7px per tatweel at 32px).
        let Some(bytes) = test_face("NotoNaskhArabic-Regular.ttf") else { return };
        let face = rustybuzz::Face::from_slice(&bytes, 0).expect("font parses");
        let scale = 32.0 / face.units_per_em() as f32;

        let line = "یہ ایک اردو جملہ ہے جو انصاف";
        let natural = measure(line, &face, scale);
        let target = natural + 30.0;

        let out = justify_with_kashida(line, &face, scale, target);
        let got = measure(&out, &face, scale);

        assert!(out.contains('ـ'), "expected tatweels for a tatweel-capable font");
        assert!(got > natural, "justified line must grow: {natural} -> {got}");
        assert!(got <= target + 0.5, "must never overshoot the measure: {got} > {target}");
    }

    #[test]
    fn justification_degrades_gracefully_when_the_font_ignores_tatweel() {
        // Noto Nastaliq Urdu — Harfsaz's DEFAULT — gives tatweel zero advance.
        // The correct behaviour is to leave the line ALONE rather than stuff it
        // with invisible characters that never reach the measure.
        let Some(bytes) = test_face("NotoNastaliqUrdu-Regular.ttf") else { return };
        let face = rustybuzz::Face::from_slice(&bytes, 0).expect("font parses");
        let scale = 32.0 / face.units_per_em() as f32;

        let line = "یہ ایک اردو جملہ ہے جو انصاف";
        let out = justify_with_kashida(line, &face, scale, measure(line, &face, scale) + 40.0);

        assert_eq!(out, line, "must not insert tatweels that have no visual effect");
    }

    #[test]
    fn justification_never_overshoots() {
        for file in ["NotoNaskhArabic-Regular.ttf", "Amiri-Regular.ttf", "Gulzar-Regular.ttf"] {
            let Some(bytes) = test_face(file) else { continue };
            let face = rustybuzz::Face::from_slice(&bytes, 0).expect("font parses");
            let scale = 32.0 / face.units_per_em() as f32;
            let line = "یہ ایک اردو جملہ ہے جو انصاف";
            let natural = measure(line, &face, scale);

            // Sweep a range of targets; none may exceed the requested measure.
            for extra in [5.0_f32, 15.0, 40.0, 120.0] {
                let target = natural + extra;
                let out = justify_with_kashida(line, &face, scale, target);
                let got = measure(&out, &face, scale);
                assert!(
                    got <= target + 0.5,
                    "{file}: overshoot at +{extra}: {got} > {target}"
                );
            }
        }
    }

    #[test]
    fn justification_preserves_the_original_letters() {
        // Elongation must only ADD tatweels — never drop or reorder text.
        let Some(bytes) = test_face("NotoNaskhArabic-Regular.ttf") else { return };
        let face = rustybuzz::Face::from_slice(&bytes, 0).expect("font parses");
        let scale = 32.0 / face.units_per_em() as f32;
        let line = "یہ ایک اردو جملہ ہے جو انصاف";
        let out = justify_with_kashida(line, &face, scale, measure(line, &face, scale) + 30.0);

        let stripped: String = out.chars().filter(|&c| c != 'ـ').collect();
        assert_eq!(stripped, line, "justification altered the underlying text");
    }

}
