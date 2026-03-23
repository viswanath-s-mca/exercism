/**
 * Exercism Student Tracker — app.js
 * Fetches public Exercism profile data for a list of student handles.
 * Uses the Exercism public API (no auth required).
 */

const App = (() => {

  /* ──────────────────────────────
     STATE
  ────────────────────────────── */
  let results = [];

  /* ──────────────────────────────
     HELPERS
  ────────────────────────────── */

  /**
   * Extract the Exercism handle from a URL or plain username.
   * Returns null if the input is not recognisable.
   */
  function extractHandle(raw) {
    const s = raw.trim();
    if (!s) return null;
    const match = s.match(/exercism\.org\/profiles\/([a-zA-Z0-9_-]+)/i);
    if (match) return match[1];
    if (/^[a-zA-Z0-9_-]+$/.test(s)) return s;
    return null;
  }

  /** Derive initials from a display name or handle. */
  function initials(name) {
    return (name || '?')
      .split(/[\s_-]+/)
      .map(w => w[0] || '')
      .join('')
      .slice(0, 2)
      .toUpperCase();
  }

  /** Update the progress UI. */
  function setProgress(done, total, lastHandle) {
    const pct = Math.round((done / total) * 100);
    document.getElementById('progBar').style.width = pct + '%';
    document.getElementById('progLabel').textContent =
      `Fetching ${done} of ${total} profiles…`;
    document.getElementById('progCount').textContent = pct + '%';
    document.getElementById('progSub').textContent =
      lastHandle ? `Last fetched: ${lastHandle}` : 'Starting workers…';
  }

  /** Show or hide an element by display property. */
  function show(id, display = 'block') {
    document.getElementById(id).style.display = display;
  }
  function hide(id) {
    document.getElementById(id).style.display = 'none';
  }

  /* ──────────────────────────────
     TRACK CONFIG
  ────────────────────────────── */

  // Popular Exercism track slugs with display names
  const TRACKS = [
    { slug: '',           label: 'All tracks'  },
    { slug: 'python',     label: 'Python'       },
    { slug: 'javascript', label: 'JavaScript'   },
    { slug: 'typescript', label: 'TypeScript'   },
    { slug: 'java',       label: 'Java'         },
    { slug: 'cpp',        label: 'C++'          },
    { slug: 'c',          label: 'C'            },
    { slug: 'csharp',     label: 'C#'           },
  ];

  /** Populate the track <select> on page load */
  function populateTrackSelect() {
    const sel = document.getElementById('trackSelect');
    sel.innerHTML = TRACKS.map(t =>
      `<option value="${t.slug}">${t.label}</option>`
    ).join('');
  }

  /* ──────────────────────────────
     API
  ────────────────────────────── */

  /**
   * Fetch one student — either all solutions or track-specific.
   * When a track slug is given, uses the track solutions endpoint.
   */
  async function fetchStudent(handle, trackSlug) {
    try {
      // Build URL: track-specific or all-solutions
      const url = trackSlug
        ? `https://exercism.org/api/v2/profiles/${handle}/solutions?track_slug=${trackSlug}`
        : `https://exercism.org/api/v2/profiles/${handle}/solutions`;

      const res = await fetch(url, { headers: { Accept: 'application/json' } });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const data     = await res.json();
      const solutions = data.results ?? data.solutions ?? [];
      const meta      = data.meta ?? {};

      // Unique tracks across all solutions
      const trackSet = new Set(
        solutions.map(s => s.track?.slug || s.track_slug || '').filter(Boolean)
      );

      const totalSolutions = meta.total_count ?? solutions.length;

      // Count solutions for the selected track specifically
      const trackSolutions = trackSlug
        ? totalSolutions   // already filtered by API
        : null;

      // Exercises list for the selected track
      const exerciseNames = trackSlug
        ? solutions.map(s => s.exercise?.slug || s.exercise_slug || '').filter(Boolean)
        : [];

      const firstUser = solutions[0]?.user ?? {};

      return {
        handle,
        name:             firstUser.handle || handle,
        avatar_url:       firstUser.avatar_url || '',
        num_solutions:    totalSolutions,
        track_solutions:  trackSolutions,
        tracks_count:     trackSet.size,
        exercises:        exerciseNames,
        status:           'ok',
        error:            null,
      };
    } catch (err) {
      return {
        handle,
        name:            handle,
        avatar_url:      '',
        num_solutions:   0,
        track_solutions: null,
        tracks_count:    0,
        exercises:       [],
        status:          'error',
        error:           err.message,
      };
    }
  }

  /**
   * Fetch all handles in parallel with a concurrency limit.
   * @param {string[]} handles
   * @param {number}   concurrency
   * @param {function} onProgress - called after each completed fetch
   */
  async function fetchAll(handles, concurrency, trackSlug, onProgress) {
    const queue  = [...handles];
    const output = [];

    async function worker() {
      while (queue.length) {
        const handle = queue.shift();
        const result = await fetchStudent(handle, trackSlug);
        output.push(result);
        onProgress(output.length, handles.length, handle);
      }
    }

    const workers = Array.from(
      { length: Math.min(concurrency, handles.length) },
      () => worker()
    );
    await Promise.all(workers);
    return output;
  }

  /* ──────────────────────────────
     STATS
  ────────────────────────────── */

  function updateStats() {
    const trackSlug = document.getElementById('trackSelect').value;
    const ok  = results.filter(r => r.status === 'ok');
    const err = results.filter(r => r.status === 'error');

    // Use track-specific count when a track is selected
    const getCount = r => trackSlug ? (r.track_solutions ?? 0) : r.num_solutions;

    const avg = ok.length
      ? Math.round(ok.reduce((a, b) => a + getCount(b), 0) / ok.length)
      : 0;
    const top = ok.reduce(
      (best, r) => getCount(r) > getCount(best ?? { track_solutions: -1, num_solutions: -1 }) ? r : best,
      null
    );

    const trackLabel = trackSlug
      ? TRACKS.find(t => t.slug === trackSlug)?.label || trackSlug
      : '';

    document.getElementById('sTot').textContent  = results.length;
    document.getElementById('sOk').textContent   = ok.length;
    document.getElementById('sErr').textContent  = err.length;
    document.getElementById('sAvg').textContent  = avg;
    document.getElementById('sTop').textContent  = top
      ? `${top.handle} (${getCount(top)})`
      : '—';

    // Update the "active track" badge
    const badge = document.getElementById('trackBadge');
    if (trackSlug) {
      badge.textContent = `Filtered: ${trackLabel}`;
      badge.style.display = 'inline-flex';
    } else {
      badge.style.display = 'none';
    }
  }

  /* ──────────────────────────────
     TABLE RENDER
  ────────────────────────────── */

  function renderTable() {
    const search     = document.getElementById('search').value.trim().toLowerCase();
    const sort       = document.getElementById('sort').value;
    const filter     = document.getElementById('filter').value;
    const trackSlug  = document.getElementById('trackSelect').value;

    // When a track is selected, show count for that track; else total
    const getCount = r => trackSlug ? (r.track_solutions ?? 0) : r.num_solutions;

    let data = [...results];

    if (filter === 'ok')    data = data.filter(r => r.status === 'ok');
    if (filter === 'error') data = data.filter(r => r.status === 'error');

    if (search) {
      data = data.filter(r =>
        r.handle.toLowerCase().includes(search) ||
        (r.name || '').toLowerCase().includes(search)
      );
    }

    const sortFns = {
      solutions_desc: (a, b) => getCount(b) - getCount(a),
      solutions_asc:  (a, b) => getCount(a) - getCount(b),
      name_asc:       (a, b) => (a.name || a.handle).localeCompare(b.name || b.handle),
      tracks_desc:    (a, b) => b.tracks_count - a.tracks_count,
    };
    data.sort(sortFns[sort] || sortFns.solutions_desc);

    document.getElementById('rowCount').textContent =
      `${data.length} of ${results.length} students`;

    // Update column header based on track selection
    const solHeader = document.getElementById('solHeader');
    if (trackSlug) {
      const label = TRACKS.find(t => t.slug === trackSlug)?.label || trackSlug;
      solHeader.textContent = `${label} solutions`;
    } else {
      solHeader.textContent = 'Solutions';
    }

    // Show/hide exercises column
    const showExercises = !!trackSlug;
    document.getElementById('exHeader').style.display = showExercises ? '' : 'none';

    const tbody = document.getElementById('tbody');

    if (!data.length) {
      tbody.innerHTML = `<tr><td colspan="7" class="empty-state">No students match your filters.</td></tr>`;
      return;
    }

    const maxCount = Math.max(...data.map(getCount));

    tbody.innerHTML = data.map((r, i) => {
      const ini = initials(r.name || r.handle);
      const avatarHtml = r.avatar_url
        ? `<img src="${r.avatar_url}" alt="${ini}" onerror="this.style.display='none';this.nextSibling.style.display='flex'" /><span style="display:none">${ini}</span>`
        : ini;

      const badgeCls = r.status === 'ok' ? 'badge-ok' : 'badge-error';
      const badgeTxt = r.status === 'ok' ? '✓ ok' : '✗ error';
      const errRow   = r.error ? `<div class="err-msg">${r.error}</div>` : '';

      const count     = getCount(r);
      const isTop     = count > 0 && count === maxCount;

      // Mini progress bar showing relative completion
      const pct = maxCount > 0 ? Math.round((count / maxCount) * 100) : 0;
      const barHtml = `
        <div style="display:flex;align-items:center;gap:8px">
          <span style="min-width:28px;text-align:right">${count}</span>
          <div style="flex:1;height:3px;background:var(--border);border-radius:2px;min-width:50px">
            <div style="width:${pct}%;height:100%;background:${isTop ? 'var(--accent)' : 'var(--blue)'};border-radius:2px"></div>
          </div>
        </div>`;

      // Exercises pill list (only when track is selected)
      const exCell = showExercises
        ? `<td style="display:table-cell">
            <div class="exercise-pills">
              ${r.exercises.slice(0, 8).map(ex =>
                `<span class="ex-pill">${escapeHtml(ex)}</span>`
              ).join('')}
              ${r.exercises.length > 8
                ? `<span class="ex-pill ex-pill-more">+${r.exercises.length - 8}</span>`
                : ''}
              ${r.exercises.length === 0 && r.status === 'ok'
                ? `<span style="font-size:11px;color:var(--text-muted)">none yet</span>`
                : ''}
            </div>
          </td>`
        : `<td style="display:none"></td>`;

      return `
        <tr>
          <td><span class="rank-num">${i + 1}</span></td>
          <td>
            <div class="student-cell">
              <div class="avatar">${avatarHtml}</div>
              <div>
                <div class="student-name">${escapeHtml(r.name || r.handle)}</div>
                ${r.name && r.name !== r.handle
                  ? `<div class="student-handle">${escapeHtml(r.handle)}</div>`
                  : ''}
              </div>
            </div>
          </td>
          <td class="num-cell ${isTop ? 'highlight' : ''}">${barHtml}</td>
          <td class="num-cell">${r.tracks_count}</td>
          ${exCell}
          <td><span class="badge ${badgeCls}">${badgeTxt}</span>${errRow}</td>
          <td>
            <a class="profile-link"
               href="https://exercism.org/profiles/${r.handle}${trackSlug ? '/exercises?track_slug=' + trackSlug : ''}"
               target="_blank" rel="noopener noreferrer">↗ view</a>
          </td>
        </tr>`;
    }).join('');
  }

  /** Minimal HTML escape to prevent XSS from user-supplied data. */
  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /* ──────────────────────────────
     EXPORT
  ────────────────────────────── */

  function exportCSV() {
    if (!results.length) return;
    const trackSlug  = document.getElementById('trackSelect').value;
    const trackLabel = TRACKS.find(t => t.slug === trackSlug)?.label || 'All tracks';

    const headers = trackSlug
      ? ['Rank','Handle','Display Name','Total Solutions',`${trackLabel} Solutions`,'Exercises Completed','Tracks','Status','Error','Profile URL']
      : ['Rank','Handle','Display Name','Total Solutions','Tracks','Status','Error','Profile URL'];

    const sorted = [...results].sort((a, b) =>
      (trackSlug ? (b.track_solutions ?? 0) - (a.track_solutions ?? 0) : b.num_solutions - a.num_solutions)
    );

    const rows = sorted.map((r, i) => {
      const base = [
        i + 1, r.handle, r.name || '', r.num_solutions,
      ];
      if (trackSlug) {
        base.push(r.track_solutions ?? 0);
        base.push(r.exercises.join('; '));
      }
      base.push(r.tracks_count, r.status, r.error || '',
        `https://exercism.org/profiles/${r.handle}`);
      return base;
    });

    const csvContent = [headers, ...rows]
      .map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
      .join('\n');

    const suffix = trackSlug ? `_${trackSlug}` : '';
    const blob   = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url    = URL.createObjectURL(blob);
    const a      = document.createElement('a');
    a.href       = url;
    a.download   = `exercism_students${suffix}_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  /* ──────────────────────────────
     MAIN FETCH FLOW
  ────────────────────────────── */

  async function startFetch() {
    const raw       = document.getElementById('input').value;
    const trackSlug = document.getElementById('trackSelect').value;
    const lines     = raw.split('\n').map(l => l.trim()).filter(Boolean);
    const handles   = [...new Set(lines.map(extractHandle).filter(Boolean))];

    if (!handles.length) {
      alert('No valid Exercism handles or URLs found.\nPaste one handle or profile URL per line.');
      return;
    }

    results = [];

    document.getElementById('fetchBtn').disabled = true;
    document.getElementById('csvBtn').disabled   = true;
    hide('statsSection');
    hide('tablePanel');
    document.getElementById('progBar').style.width = '0%';

    const trackLabel = TRACKS.find(t => t.slug === trackSlug)?.label || 'all tracks';
    document.getElementById('progSub').textContent =
      trackSlug ? `Fetching ${trackLabel} solutions…` : 'Fetching all solutions…';

    show('progressPanel');

    results = await fetchAll(handles, 5, trackSlug, (done, total, lastHandle) => {
      setProgress(done, total, lastHandle);
    });

    document.getElementById('progLabel').textContent = `Done — ${results.length} profiles fetched.`;
    document.getElementById('fetchBtn').disabled = false;
    document.getElementById('csvBtn').disabled   = false;

    updateStats();
    renderTable();

    show('statsSection', 'grid');
    show('tablePanel');
  }

  // Init: populate track dropdown on load
  document.addEventListener('DOMContentLoaded', populateTrackSelect);

  /* ──────────────────────────────
     CSV PARSING
  ────────────────────────────── */

  /**
   * Parse raw CSV text into an array of row arrays.
   * Handles quoted fields, commas inside quotes, and CRLF/LF line endings.
   */
  function parseCSV(text) {
    const rows = [];
    const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');

    for (const line of lines) {
      if (!line.trim()) continue;
      const row = [];
      let inQuote = false;
      let cell = '';

      for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (ch === '"') {
          if (inQuote && line[i + 1] === '"') { cell += '"'; i++; }
          else { inQuote = !inQuote; }
        } else if (ch === ',' && !inQuote) {
          row.push(cell.trim());
          cell = '';
        } else {
          cell += ch;
        }
      }
      row.push(cell.trim());
      rows.push(row);
    }
    return rows;
  }

  /**
   * Given parsed CSV rows (header row first), auto-detect which columns
   * contain Exercism URLs or handles and extract all unique handles.
   */
  function extractHandlesFromCSV(rows) {
    if (rows.length < 2) return { handles: [], detectedColumns: [] };

    const headers = rows[0];
    const dataRows = rows.slice(1);

    // Score each column by how many cells look like Exercism data
    const colScores = headers.map((_, colIdx) => {
      let score = 0;
      for (const row of dataRows) {
        const cell = (row[colIdx] || '').trim();
        if (!cell) continue;
        if (cell.includes('exercism.org/profiles/')) score += 3;
        else if (/^[a-zA-Z0-9_-]{3,39}$/.test(cell)) score += 1;
      }
      return score;
    });

    const maxScore = Math.max(...colScores);
    if (maxScore === 0) return { handles: [], detectedColumns: [] };

    // Use all columns that score at least 50% of the max
    const threshold = maxScore * 0.5;
    const goodCols = colScores
      .map((s, i) => ({ score: s, idx: i, name: headers[i] }))
      .filter(c => c.score >= threshold);

    const handles = new Set();
    for (const row of dataRows) {
      for (const col of goodCols) {
        const h = extractHandle(row[col.idx] || '');
        if (h) handles.add(h);
      }
    }

    return {
      handles: [...handles],
      detectedColumns: goodCols.map(c => c.name || `Column ${c.idx + 1}`),
    };
  }

  /**
   * Process a File object: read it, parse CSV, extract handles,
   * populate the textarea, and update the upload zone UI.
   */
  function processCSVFile(file) {
    if (!file) return;

    const zone   = document.getElementById('uploadZone');
    const status = document.getElementById('uploadStatus');

    // Reset state classes
    zone.classList.remove('upload-success', 'upload-error');
    status.textContent = 'Reading file…';

    const reader = new FileReader();

    reader.onload = (e) => {
      try {
        const text = e.target.result;
        const rows = parseCSV(text);

        if (rows.length < 2) {
          throw new Error('CSV appears empty or has only a header row.');
        }

        const { handles, detectedColumns } = extractHandlesFromCSV(rows);

        if (!handles.length) {
          throw new Error('No Exercism URLs or handles found in any column.');
        }

        // Populate textarea
        document.getElementById('input').value = handles.join('\n');

        // Success UI
        zone.classList.add('upload-success');
        const colNames = detectedColumns.join(', ');
        status.textContent =
          `✓ ${handles.length} handles loaded from "${file.name}" — column(s): ${colNames}`;

      } catch (err) {
        zone.classList.add('upload-error');
        status.textContent = `✗ ${err.message}`;
      }
    };

    reader.onerror = () => {
      zone.classList.add('upload-error');
      status.textContent = '✗ Could not read the file.';
    };

    reader.readAsText(file);
  }

  /* ──────────────────────────────
     DRAG & DROP HANDLERS
  ────────────────────────────── */

  function onDragOver(e) {
    e.preventDefault();
    document.getElementById('uploadZone').classList.add('drag-over');
  }

  function onDragLeave(e) {
    document.getElementById('uploadZone').classList.remove('drag-over');
  }

  function onDrop(e) {
    e.preventDefault();
    const zone = document.getElementById('uploadZone');
    zone.classList.remove('drag-over');
    const file = e.dataTransfer.files[0];
    if (file) processCSVFile(file);
  }

  function onFileSelected(e) {
    const file = e.target.files[0];
    if (file) processCSVFile(file);
    // Reset input so same file can be re-selected
    e.target.value = '';
  }

  /* ──────────────────────────────
     UTILITIES
  ────────────────────────────── */

  function loadSample() {
    document.getElementById('input').value = [
      'https://exercism.org/profiles/exercism',
      'iHiD',
      'kytrinyx',
      'ErikSchierboom',
      'coderabbit',
    ].join('\n');
  }

  function clearAll() {
    document.getElementById('input').value = '';
    results = [];
    hide('statsSection');
    hide('tablePanel');
    hide('progressPanel');
    document.getElementById('csvBtn').disabled = true;
    document.getElementById('tbody').innerHTML =
      `<tr><td colspan="6" class="empty-state">No data yet. Paste handles above and click fetch.</td></tr>`;
  }

  /* ──────────────────────────────
     PUBLIC API
  ────────────────────────────── */
  return { startFetch, loadSample, clearAll, exportCSV, renderTable,
           onDragOver, onDragLeave, onDrop, onFileSelected };

})();
