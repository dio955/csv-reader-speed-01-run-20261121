// A fast single-pass reader for broken CSV, answering exactly as the reference
// reader does: {columns, rows, errors} for an input {text, header}.
//
// The text is scanned once, left to right, over UTF-16 code units. Fields are
// cut out of the text with slice() between delimiter positions; a list of
// segments is built only for the rare field that drops a stray CR. A field
// that opens with a quote first looks for its closing quote (a quote not
// doubled) with indexOf; when there is none, the quote is a literal character
// and the field is read again as unquoted.

export function run(input) {
  const text = input.text;
  const header = input.header;
  const n = text.length;
  let i = 0;
  if (n > 0 && text.charCodeAt(0) === 0xfeff) i = 1; // a leading BOM is dropped

  const rows = [];
  const errors = [];
  let columns = header ? [] : null;
  let width = -1; // field count of the first record, once one is seen
  let records = 0; // records emitted so far, the header record included
  let line = 1; // physical line the scan is on
  let recLine = 1; // physical line the record being read started on

  // The row an error of the record being read belongs to: null for the header.
  function errRow() {
    return header ? (records === 0 ? null : records - 1) : records;
  }

  // Reads one unquoted field from i: its value, and how it ended
  // (1 = comma, 2 = line break, 3 = end of text). A lone CR is dropped with a
  // stray_cr error and the field goes on; a quote is a literal character.
  function unquotedField() {
    const start = i;
    let parts = null;
    let seg = i;
    for (;;) {
      while (i < n) {
        const c = text.charCodeAt(i);
        if (c === 44 || c === 10 || c === 13) break;
        i++;
      }
      if (i >= n) {
        if (parts === null) return { value: text.slice(start, i), term: 3 };
        parts.push(text.slice(seg, i));
        return { value: parts.join(''), term: 3 };
      }
      const c = text.charCodeAt(i);
      if (c === 44) {
        i++;
        if (parts === null) return { value: text.slice(start, i - 1), term: 1 };
        parts.push(text.slice(seg, i - 1));
        return { value: parts.join(''), term: 1 };
      }
      if (c === 10) {
        i++;
        if (parts === null) return { value: text.slice(start, i - 1), term: 2 };
        parts.push(text.slice(seg, i - 1));
        return { value: parts.join(''), term: 2 };
      }
      // c === 13: a CR ends the record only when an LF follows it.
      if (text.charCodeAt(i + 1) === 10) {
        i += 2;
        if (parts === null) return { value: text.slice(start, i - 2), term: 2 };
        parts.push(text.slice(seg, i - 2));
        return { value: parts.join(''), term: 2 };
      }
      errors.push({ code: 'stray_cr', line: recLine, row: errRow() });
      if (parts === null) parts = [];
      parts.push(text.slice(seg, i));
      i++;
      seg = i;
    }
  }

  // The value of a quoted field's content, text[a..b): doubled quotes become
  // one quote, and each CRLF or lone CR becomes an LF. The line breaks inside
  // are counted onto the scan's line as a side effect.
  function quotedContent(a, b) {
    let breaks = 0;
    let dirty = false;
    for (let k = a; k < b; k++) {
      const c = text.charCodeAt(k);
      if (c === 34 || c === 13) dirty = true;
      if (c === 10) breaks++;
      else if (c === 13) {
        breaks++;
        if (text.charCodeAt(k + 1) === 10) k++;
      }
    }
    line += breaks;
    if (!dirty) return text.slice(a, b);
    const parts = [];
    let s = a;
    for (let k = a; k < b; k++) {
      const c = text.charCodeAt(k);
      if (c === 34) {
        parts.push(text.slice(s, k), '"');
        k++;
        s = k + 1;
      } else if (c === 13) {
        parts.push(text.slice(s, k), '\n');
        if (text.charCodeAt(k + 1) === 10) k++;
        s = k + 1;
      }
    }
    parts.push(text.slice(s, b));
    return parts.join('');
  }

  for (;;) {
    const rec = [];
    let anyTouched = false;
    let term = 3;
    for (;;) {
      let value;
      let touched;
      if (i < n && text.charCodeAt(i) === 34) {
        // A field that opens with a quote: find its closing quote.
        let j = i + 1;
        let close = -1;
        for (;;) {
          j = text.indexOf('"', j);
          if (j === -1) break;
          if (text.charCodeAt(j + 1) === 34) {
            j += 2;
            continue;
          }
          close = j;
          break;
        }
        if (close === -1) {
          errors.push({ code: 'unterminated_quote', line: recLine, row: errRow() });
          const r = unquotedField();
          value = r.value;
          touched = value.length > 0;
          term = r.term;
        } else {
          const content = quotedContent(i + 1, close);
          i = close + 1;
          // What follows the closing quote, up to the next comma or line
          // break, is appended as it stands; that is quote_junk when any of
          // it is there, reported when the field ends.
          const r = unquotedField();
          value = r.value.length > 0 ? content + r.value : content;
          touched = true;
          term = r.term;
          if (r.value.length > 0) {
            errors.push({ code: 'quote_junk', line: recLine, row: errRow() });
          }
        }
      } else {
        const r = unquotedField();
        value = r.value;
        touched = value.length > 0;
        term = r.term;
      }
      rec.push(value);
      if (touched) anyTouched = true;
      if (term !== 1) break;
    }

    // A line left with no characters is no record: nothing was delimited and
    // the one field read was never touched.
    if (rec.length > 1 || anyTouched) {
      if (width === -1) {
        width = rec.length;
        if (header) columns = rec;
        else rows.push(rec);
      } else if (rec.length < width) {
        errors.push({ code: 'short_row', line: recLine, row: errRow(), fields: rec.length });
        while (rec.length < width) rec.push('');
        rows.push(rec);
      } else if (rec.length > width) {
        const extra = rec.splice(width);
        errors.push({ code: 'long_row', line: recLine, row: errRow(), extra });
        rows.push(rec);
      } else {
        rows.push(rec);
      }
      records++;
    }
    if (term === 3) break;
    line++;
    recLine = line;
  }

  return { columns, rows, errors };
}
