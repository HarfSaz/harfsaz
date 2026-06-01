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

        let flush = |line_str: &str,
                     baseline: f32|
         -> Result<Option<RenderLine>, String> {
            if line_str.trim().is_empty() {
                return Ok(None);
            }
            Ok(Some(shape_line(
                line_str,
                &face,
                &parser_face,
                scale,
                frame_width,
                pad,
                baseline,
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
                if let Some(l) = flush(&current, baseline)? {
                    lines.push(l);
                    baseline += line_height;
                }
                current = word.to_string();
            } else {
                current = candidate;
            }
        }
        if let Some(l) = flush(&current, baseline)? {
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
    let start_x = if rtl {
        (frame_width - pad - line_width).max(pad)
    } else {
        pad
    };

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
