//! InPage (`.inp`) import — text extraction from the closed InPage format.
//!
//! InPage is the incumbent Urdu DTP application (1994–). Its file format is
//! proprietary and undocumented, so this is a port of a reverse-engineered
//! extractor (Kamal Abdali's InpToUni, C, public on GitHub) that we verified
//! byte-for-byte against its own sample document. What is known:
//!
//! * The container is an OLE2 / Compound File (magic `D0 CF 11 E0 A1 B1 1A E1`).
//!   The text stream is not read via the OLE directory; instead the file is
//!   scanned raw after stripping the 512-byte FAT sectors that interrupt it
//!   (the `separator` pattern below is exactly one such FAT sector).
//! * Pre-3.0 documents store text as **records** (one per paragraph): a 4-byte
//!   header whose first two bytes are the little-endian length, followed by the
//!   bytes, ending in `0x0D`. Records follow a `0D 00 00 00 00 00` marker.
//! * Inside a record, plain bytes pass through as Latin-1, and `0x04` escapes a
//!   one-byte code for an Urdu/Arabic-script character, mapped through a
//!   256-entry table into the U+06xx block (with a handful of punctuation
//!   specials).
//! * InPage 3.0+ switched to Unicode internally. We have no sample of that
//!   format; `extract_text` falls back to scanning for UTF-16LE runs of
//!   Arabic-script text, which is best-effort and flagged in the result.
//!
//! Formatting, frames, page geometry and images are NOT recovered — the format
//! for those is unknown. Output is plain paragraphs, which the frontend then
//! paginates into a Qalam document.

use serde::Serialize;

/// Result of importing an InPage file.
#[derive(Serialize, Debug, Clone)]
pub struct InpageDoc {
    /// Paragraphs in document order.
    pub paragraphs: Vec<String>,
    /// True when the pre-3.0 record format was found and decoded (reliable).
    /// False when we fell back to the UTF-16 heuristic for newer files.
    pub legacy_format: bool,
}

const OLE_MAGIC: [u8; 8] = [0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1, 0x1A, 0xE1];

/// Marker that precedes a run of text records.
const RECORD_MARKER: [u8; 6] = [0x0D, 0x00, 0x00, 0x00, 0x00, 0x00];
/// After a `00 00 xx xx` header, this sequence means "end of stream".
const SKIP_TAIL: [u8; 5] = [0x00, 0xFF, 0xFF, 0xFF, 0xFF];

/// Low byte of the U+06xx code point for each escaped InPage character code.
/// Copied verbatim from the reference implementation (`unicodebyte[]`).
#[rustfmt::skip]
const UNICODE_LOW: [u8; 256] = [
    /* 00 */ 0x00,0x01,0x02,0x03,0x04,0x05,0x06,0x07,
    /* 08 */ 0x55,0x09,0x0a,0x0b,0x0c,0x0d,0x0e,0x0f,
    /* 10 */ 0x10,0x11,0x12,0x13,0x14,0x15,0x16,0x17,
    /* 18 */ 0x18,0x19,0x1a,0x1b,0x1c,0x1d,0x1e,0x1f,
    /* 20 */ 0x20,0x21,0x22,0x23,0x24,0x25,0x26,0x27,
    /* 28 */ 0x28,0x29,0x2a,0x2b,0x2c,0x2d,0x2e,0x2f,
    /* 30 */ 0x30,0x31,0x32,0x33,0x34,0x35,0x36,0x37,
    /* 38 */ 0x38,0x39,0x3a,0x3b,0x3c,0x3d,0x3e,0x3f,
    /* 40 */ 0x40,0x41,0x42,0x43,0x44,0x45,0x46,0x47,
    /* 48 */ 0x48,0x49,0x4a,0x4b,0x4c,0x4d,0x4e,0x4f,
    /* 50 */ 0x50,0x51,0x52,0x53,0x54,0x55,0x56,0x57,
    /* 58 */ 0x58,0x59,0x5a,0x5b,0x5c,0x5d,0x5e,0x5f,
    /* 60 */ 0x60,0x61,0x62,0x63,0x64,0x65,0x66,0x67,
    /* 68 */ 0x68,0x69,0x6a,0x41,0x6c,0x6d,0x6e,0x6f,
    /* 70 */ 0x70,0x71,0x72,0x73,0x74,0x75,0x76,0x77,
    /* 78 */ 0x78,0x79,0x7a,0x7b,0x7c,0x7d,0x7e,0x7f,
    /* 80 */ 0x80,0x27,0x28,0x7e,0x2a,0x79,0x2b,0x2c,
    /* 88 */ 0x86,0x2d,0x2e,0x2f,0x88,0x30,0x31,0x91,
    /* 90 */ 0x32,0x98,0x33,0x34,0x35,0x36,0x37,0x38,
    /* 98 */ 0x39,0x3a,0x41,0x42,0xa9,0xaf,0x44,0x45,
    /* a0 */ 0x46,0xba,0x48,0x26,0xcc,0xd2,0xc1,0xbe,
    /* a8 */ 0x4d,0x40,0x50,0x4e,0x4f,0x51,0x11,0xaf,
    /* b0 */ 0x56,0xe1,0xb2,0x53,0x52,0x4c,0x24,0xa3,
    /* b8 */ 0x4a,0xc3,0xba,0xbb,0xbc,0x70,0x57,0x54,
    /* c0 */ 0xc0,0xc1,0xc2,0xc3,0xc4,0xc5,0xc6,0x4b,
    /* c8 */ 0x22,0x23,0x25,0xcb,0x1f,0x1f,0x1f,0x14,
    /* d0 */ 0x60,0x61,0x62,0x63,0x64,0x65,0x66,0x67,
    /* d8 */ 0x68,0x69,0xda,0xdb,0xdc,0xdd,0x6a,0xdf,
    /* e0 */ 0xe0,0xe1,0xe2,0xe3,0xe4,0xe5,0x13,0x12,
    /* e8 */ 0x6d,0xe9,0x1b,0xeb,0xec,0x0c,0x1f,0xef,
    /* f0 */ 0xc7,0x0d,0x0e,0xd4,0x19,0x40,0xf6,0x01,
    /* f8 */ 0x10,0x6b,0xfa,0xfb,0xfc,0xfd,0xfe,0xff,
];

/// Whether `bytes` looks like an InPage / OLE2 container.
pub fn is_inpage(bytes: &[u8]) -> bool {
    bytes.len() >= 8 && bytes[..8] == OLE_MAGIC
}

/// The 512-byte FAT-sector pattern the reference strips before scanning.
fn separator() -> [u8; 0x200] {
    let mut s = [0u8; 0x200];
    for i in 1..0x15usize {
        s[4 * i - 4] = i as u8;
    }
    s[0x50] = 0xFE;
    for b in s.iter_mut().skip(0x51) {
        *b = 0xFF;
    }
    s
}

/// Remove every occurrence of `pat` from `buf` (non-overlapping, left to right).
fn strip_pattern(buf: &[u8], pat: &[u8]) -> Vec<u8> {
    let mut out = Vec::with_capacity(buf.len());
    let mut i = 0;
    while i < buf.len() {
        if buf.len() - i >= pat.len() && &buf[i..i + pat.len()] == pat {
            i += pat.len();
        } else {
            out.push(buf[i]);
            i += 1;
        }
    }
    out
}

fn find(hay: &[u8], from: usize, needle: &[u8]) -> Option<usize> {
    if needle.is_empty() || from >= hay.len() {
        return None;
    }
    hay[from..]
        .windows(needle.len())
        .position(|w| w == needle)
        .map(|p| p + from)
}

/// Decode one text record's bytes (excluding its trailing 0x0D) into a string.
fn decode_record(rec: &[u8]) -> String {
    let mut out = String::with_capacity(rec.len());
    let mut i = 0;
    while i < rec.len() {
        let ch = rec[i];
        if (0x08 < ch && ch < 0x0E) || (0x1F < ch && ch < 0xFF) {
            // Plain byte: Latin-1 passthrough (ASCII punctuation, digits, Latin).
            out.push(ch as char);
        } else if ch == 0x04 {
            // Escaped script character.
            if i + 1 >= rec.len() {
                break;
            }
            i += 1;
            let c = rec[i];
            let cp: u32 = match c {
                0x09 | 0x0A | 0x0B | 0x0C | 0x0D | 0x20 => c as u32,
                0x3A => 0x005E,
                0xCB => 0xFDF2, // ﷲ
                0xDA => 0x0021,
                0xDB => 0x007D,
                0xDC => 0x007B,
                0xDD => 0x0024,
                0xDF => 0x002F,
                0xE0 => 0x2026, // …
                0xE1 => 0x0029,
                0xE2 => 0x0028,
                0xE3 => 0x002A,
                0xE4 => 0x002B,
                0xE9 => 0x003A,
                0xEB => 0x00D7,
                0xEC => 0x003D,
                0xEF => 0x00F7,
                0xF5 => 0x2212,
                0xF6 => 0xFDFA, // ﷺ
                0xFA => 0x005D,
                0xFB => 0x005B,
                0xFC => 0x002E,
                0xFD => 0x2018,
                0xFE => 0x2019,
                _ => 0x0600 + UNICODE_LOW[c as usize] as u32,
            };
            if let Some(chr) = char::from_u32(cp) {
                out.push(chr);
            }
        }
        // Any other byte (control codes, 0xFF) is formatting we don't decode.
        i += 1;
    }
    out
}

/// Extract paragraphs from a pre-3.0 InPage file. Empty when no records found.
fn extract_legacy(raw: &[u8]) -> Vec<String> {
    let buf = strip_pattern(raw, &separator());
    let mut paragraphs = Vec::new();
    let mut pos = 0usize;

    'outer: loop {
        // Find the next record marker.
        let Some(m) = find(&buf, pos, &RECORD_MARKER) else { break };
        pos = m + RECORD_MARKER.len();

        loop {
            if pos + 4 > buf.len() {
                break 'outer;
            }
            let (c0, c1, c2, c3) = (buf[pos], buf[pos + 1], buf[pos + 2], buf[pos + 3]);
            pos += 4;

            if c0 == 0x00 && c1 == 0x00 {
                // Skip header. If followed by 00 FF FF FF FF the stream is over;
                // otherwise resync on the next marker.
                if pos + SKIP_TAIL.len() <= buf.len() && buf[pos..pos + SKIP_TAIL.len()] == SKIP_TAIL {
                    break 'outer;
                }
                continue 'outer;
            }
            if c0 == 0xFF && c1 == 0xFF && c2 == 0xFF && c3 == 0xFF {
                break 'outer; // document end
            }

            let reclen = c0 as usize + 256 * c1 as usize;
            // The reference ignores a malformed record and re-emits stale data;
            // we resync instead so a bad header can't corrupt the output.
            if reclen == 0 || pos + reclen > buf.len() || buf[pos + reclen - 1] != 0x0D {
                continue 'outer;
            }
            paragraphs.push(decode_record(&buf[pos..pos + reclen - 1]));
            pos += reclen;
        }
    }
    paragraphs
}

fn is_arabic_script(c: char) -> bool {
    matches!(c as u32, 0x0600..=0x06FF | 0x0750..=0x077F | 0x08A0..=0x08FF | 0xFB50..=0xFDFF | 0xFE70..=0xFEFF)
}

/// Best-effort fallback for Unicode-era (3.0+) files: harvest UTF-16LE runs of
/// Arabic-script text. Paragraph boundaries come from CR/LF code units.
fn extract_utf16_runs(raw: &[u8]) -> Vec<String> {
    let mut paragraphs = Vec::new();
    // Try both byte alignments — the text stream need not start on an even offset.
    for start in [0usize, 1] {
        let mut cur = String::new();
        let mut arabic_in_cur = 0usize;
        let flush = |cur: &mut String, arabic: &mut usize, out: &mut Vec<String>| {
            let t = cur.trim();
            if *arabic >= 4 && t.chars().count() >= 8 {
                out.push(t.to_string());
            }
            cur.clear();
            *arabic = 0;
        };
        let mut i = start;
        while i + 1 < raw.len() {
            let u = u16::from_le_bytes([raw[i], raw[i + 1]]);
            i += 2;
            match char::from_u32(u as u32) {
                Some(c) if c == '\r' || c == '\n' => flush(&mut cur, &mut arabic_in_cur, &mut paragraphs),
                Some(c) if is_arabic_script(c) => {
                    cur.push(c);
                    arabic_in_cur += 1;
                }
                Some(c) if c == ' ' || c == '\t' || (c.is_ascii_graphic()) || ('\u{00A0}'..='\u{2044}').contains(&c) => cur.push(c),
                _ => flush(&mut cur, &mut arabic_in_cur, &mut paragraphs),
            }
        }
        flush(&mut cur, &mut arabic_in_cur, &mut paragraphs);
        if !paragraphs.is_empty() {
            break;
        }
    }
    paragraphs
}

/// Extract the text of an InPage file.
pub fn extract_text(bytes: &[u8]) -> Result<InpageDoc, String> {
    if !is_inpage(bytes) {
        return Err("This is not an InPage document (missing OLE2 container signature).".into());
    }
    let legacy = extract_legacy(bytes);
    if !legacy.is_empty() {
        return Ok(InpageDoc { paragraphs: legacy, legacy_format: true });
    }
    let modern = extract_utf16_runs(bytes);
    if modern.is_empty() {
        return Err(
            "No text could be recovered from this InPage file. Files saved by InPage 3.0 or \
             later use a format we can only read heuristically — try File ▸ Export as Unicode \
             text in InPage, then paste."
                .into(),
        );
    }
    Ok(InpageDoc { paragraphs: modern, legacy_format: false })
}

#[cfg(test)]
mod tests {
    use super::*;

    /// The reference sample (story.inp + its verified story.txt) is not ours to
    /// redistribute, so tests read it from `QALAM_INP_FIXTURE_DIR` and skip
    /// when the variable is unset.
    fn fixture() -> Option<(Vec<u8>, String)> {
        let dir = std::env::var("QALAM_INP_FIXTURE_DIR").ok()?;
        let inp = std::fs::read(format!("{dir}/story.inp")).ok()?;
        let txt = std::fs::read(format!("{dir}/story.txt")).ok()?;
        // story.txt is UTF-16LE with a BOM and CRLF line ends.
        let units: Vec<u16> = txt.chunks_exact(2).map(|c| u16::from_le_bytes([c[0], c[1]])).collect();
        let s = String::from_utf16_lossy(&units);
        Some((inp, s.trim_start_matches('\u{FEFF}').replace("\r\n", "\n")))
    }

    #[test]
    fn matches_reference_output_exactly() {
        let Some((inp, expected)) = fixture() else {
            eprintln!("skipped: QALAM_INP_FIXTURE_DIR not set");
            return;
        };
        let doc = extract_text(&inp).expect("extracts");
        assert!(doc.legacy_format);
        let mut ours = doc.paragraphs.join("\n");
        ours.push('\n'); // the reference terminates every record with a newline
        assert_eq!(ours, expected, "decoded text differs from the verified reference output");
    }

    #[test]
    fn rejects_non_ole_input() {
        assert!(extract_text(b"%PDF-1.4 not inpage").is_err());
    }

    #[test]
    fn decodes_escaped_urdu_letters() {
        // 0x04 0x27 -> U+0627 (ا) per the table (0x27 maps to 0x27).
        assert_eq!(decode_record(&[0x04, 0x27, 0x20, 0x04, 0x28]), "ا \u{0628}");
    }

    #[test]
    fn separator_is_a_fat_sector_shape() {
        let s = separator();
        assert_eq!(s[0], 1);
        assert_eq!(s[4], 2);
        assert_eq!(s[0x50], 0xFE);
        assert_eq!(s[0x1FF], 0xFF);
        assert_eq!(s[1], 0);
    }
}
