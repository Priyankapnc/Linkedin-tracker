// =============================================================
// 🔧 CONFIGURATION — Replace with YOUR URLs from the setup guide
// =============================================================
const SHEET_CSV_URL = 'YOUR_PUBLISHED_CSV_URL_HERE';
// e.g. 'https://docs.google.com/spreadsheets/d/e/2PACX-.../pub?gid=0&single=true&output=csv'

const APPS_SCRIPT_URL = 'YOUR_APPS_SCRIPT_URL_HERE';
// e.g. 'https://script.google.com/macros/s/AKfycbx.../exec'

// =============================================================
// Constants & State
// =============================================================
const STATUSES = ["Contacted","Connection Sent","Connected","Connected - No Response","Message Sent","Replied","JD Shared","Shared for Screening","Not Interested","Moved to Interview","Meeting Set","No Response","Closed"];
const S_CLASS = ["s0","s1","s2","s2b","s3","s4","s4b","s4c","s5b","s5c","s5","s6","s7"];
const FOLLOWUP_DAYS = 3;

let leads = [], roles = [], dismissed = new Set();
let filterStatus = "All", filterRole = "", search = "";

const isExt = typeof chrome !== "undefined" && chrome.storage;
const isGHPages = location.hostname.includes("github.io");
const isReadOnly = isGHPages;

// =============================================================
// Data Loading
// =============================================================
async function load() {
  // GitHub Pages → always read from Google Sheets
  if (isGHPages) {
    return loadFromSheet();
  }
  // Extension → read from chrome.storage (local-first)
  if (isExt) {
    return new Promise(r => chrome.storage.local.get(["leads", "roles", "dismissed"], r));
  }
  return { leads: [], roles: [], dismissed: [] };
}

async function loadFromSheet() {
  try {
    const res = await fetch(SHEET_CSV_URL + '&_t=' + Date.now()); // cache bust
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const csv = await res.text();
    const parsed = parseCSV(csv);
    // Extract unique roles from the data
    const roleSet = new Set();
    parsed.forEach(l => { if (l.role) roleSet.add(l.role); });
    const sheetRoles = [...roleSet].map((t, i) => ({ id: 'r' + i, title: t }));
    // Map role titles to IDs
    const leadsWithRoleIds = parsed.map(l => {
      const r = sheetRoles.find(sr => sr.title === l.role);
      return { ...l, roleId: r ? r.id : '' };
    });
    return { leads: leadsWithRoleIds, roles: sheetRoles, dismissed: [] };
  } catch (e) {
    console.error('Failed to load from Google Sheet:', e);
    return { leads: [], roles: [], dismissed: [] };
  }
}

function parseCSV(text) {
  const lines = text.split('\n').filter(l => l.trim());
  if (lines.length < 2) return [];
  const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, '').toLowerCase());
  return lines.slice(1).map(line => {
    const vals = [];
    let cur = '', inQ = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') { inQ = !inQ; continue; }
      if (ch === ',' && !inQ) { vals.push(cur.trim()); cur = ''; continue; }
      cur += ch;
    }
    vals.push(cur.trim());
    const obj = {};
    headers.forEach((h, i) => obj[h] = vals[i] || '');
    // Normalize field names from sheet to match extension format
    return {
      id: Number(obj.id) || Date.now() + Math.random(),
      name: obj.name || '',
      company: obj.company || '',
      role: obj.role || '',
      status: obj.status || 'Contacted',
      notes: obj.notes || '',
      date: obj.date || '',
      url: obj.url || '#'
    };
  });
}

// =============================================================
// Sync to Google Sheets (from extension only)
// =============================================================
async function syncToSheet() {
  if (!isExt || isReadOnly) return;
  if (!APPS_SCRIPT_URL || APPS_SCRIPT_URL.includes('YOUR_')) return;
  try {
    const payload = leads.map(l => ({
      id: l.id,
      name: l.name,
      company: l.company || '',
      role: roleName(l.roleId),
      status: l.status,
      notes: l.notes || '',
      date: l.date,
      url: l.url
    }));
    await fetch(APPS_SCRIPT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' }, // avoid CORS preflight
      body: JSON.stringify({ action: 'sync', leads: payload })
    });
    console.log('✓ Synced to Google Sheet');
  } catch (e) {
    console.warn('Sheet sync failed (will retry next save):', e.message);
  }
}

// Debounce sync so rapid edits don't spam the API
let syncTimer = null;
function debouncedSync() {
  clearTimeout(syncTimer);
  syncTimer = setTimeout(syncToSheet, 2000);
}

// =============================================================
// Save (local + cloud)
// =============================================================
async function save(obj) {
  if (isReadOnly) return;
  if (isExt) {
    await new Promise(r => chrome.storage.local.set(obj, r));
  }
  debouncedSync();
}

// =============================================================
// Helpers
// =============================================================
function daysSince(d) {
  const t = new Date(d);
  if (isNaN(t)) return 0;
  return Math.floor((Date.now() - t) / 86400000);
}
function roleName(id) { return roles.find(r => r.id === id)?.title || id || "—"; }
function sClass(s) { return S_CLASS[STATUSES.indexOf(s)] || "s0"; }
function initials(n) { return n.split(" ").slice(0, 2).map(w => w[0] || "").join("").toUpperCase(); }
function isOverdue(l) {
  return l.status === "Connected" && daysSince(l.statusChangedAt || l.date) >= FOLLOWUP_DAYS && !dismissed.has(String(l.id));
}

// =============================================================
// Reminders
// =============================================================
function getReminders() {
  return leads
    .filter(l => l.status === "Connected" && !dismissed.has(String(l.id)) && daysSince(l.statusChangedAt || l.date) >= FOLLOWUP_DAYS)
    .map(l => ({ ...l, daysSince: daysSince(l.statusChangedAt || l.date) }))
    .sort((a, b) => b.daysSince - a.daysSince);
}

function renderReminders() {
  if (isReadOnly) return;
  const rem = getReminders();
  const wrap = document.getElementById("remindersWrap");
  const list = document.getElementById("remindersList");
  if (!rem.length) { wrap.style.display = "none"; return; }
  wrap.style.display = "block";
  document.getElementById("reminderCount").textContent = rem.length;
  list.innerHTML = rem.map(r => `
    <div class="reminder-item">
      <div class="reminder-avatar">${initials(r.name)}</div>
      <div class="reminder-info">
        <div class="reminder-name">${r.name}</div>
        <div class="reminder-meta">${r.company || "—"} · <span class="role-tag">${roleName(r.roleId)}</span></div>
      </div>
      <div class="reminder-days">+${r.daysSince}d no message</div>
      <div class="reminder-actions">
        <button class="btn-followup" data-url="${r.url}">💬 Message</button>
        <button class="btn-dismiss" data-id="${r.id}">Dismiss</button>
      </div>
    </div>
  `).join("");
  list.querySelectorAll(".btn-followup").forEach(b => b.addEventListener("click", () => window.open(b.dataset.url, "_blank")));
  list.querySelectorAll(".btn-dismiss").forEach(b => b.addEventListener("click", async () => {
    dismissed.add(b.dataset.id);
    await save({ dismissed: [...dismissed] });
    renderReminders();
  }));
}

let remOpen = true;
document.getElementById("remindersHeader").addEventListener("click", () => {
  remOpen = !remOpen;
  document.getElementById("remindersList").style.display = remOpen ? "block" : "none";
  document.getElementById("reminderChevron").className = "chevron" + (remOpen ? " open" : "");
  document.getElementById("remindersHeader").className = "reminders-header" + (remOpen ? "" : " collapsed");
});

// =============================================================
// Share URL (simplified — just the GitHub Pages link)
// =============================================================
function updateShareUrl() {
  const shareUrlEl = document.getElementById("shareUrl");
  if (!shareUrlEl) return;
  const ghPagesUrl = 'https://priyankapnc.github.io/Linkedin-tracker/';
  shareUrlEl.textContent = ghPagesUrl;
  shareUrlEl.title = ghPagesUrl;
}

// =============================================================
// Stats
// =============================================================
function updateStats() {
  const t = leads.length;
  const rep = leads.filter(l => ["Replied", "JD Shared", "Shared for Screening", "Meeting Set", "Moved to Interview"].includes(l.status)).length;
  const meet = leads.filter(l => ["Meeting Set", "Moved to Interview", "Shared for Screening"].includes(l.status)).length;
  document.getElementById("sTotal").textContent = t;
  document.getElementById("sReplied").textContent = rep;
  document.getElementById("sMeetings").textContent = meet;
  document.getElementById("sRate").textContent = t ? Math.round(rep / t * 100) + "%" : "0%";
}

// =============================================================
// Filters
// =============================================================
function renderRoleFilter() {
  const sel = document.getElementById("roleFilter");
  sel.innerHTML = `<option value="">All Roles</option>` + roles.map(r => `<option value="${r.id}">${r.title}</option>`).join("");
  sel.value = filterRole;
  sel.onchange = e => { filterRole = e.target.value; render(); };
}

function renderStatusFilters() {
  const wrap = document.getElementById("statusFilters"), counts = {};
  leads.forEach(l => counts[l.status] = (counts[l.status] || 0) + 1);
  wrap.innerHTML = ["All", ...STATUSES].map(s => {
    const c = s === "All" ? leads.length : (counts[s] || 0);
    if (s !== "All" && c === 0) return "";
    return `<button class="pill${filterStatus === s ? " active" : ""}" data-s="${s}">${s} (${c})</button>`;
  }).join("");
  wrap.querySelectorAll(".pill").forEach(b => b.addEventListener("click", () => {
    filterStatus = b.dataset.s;
    render();
  }));
}

// =============================================================
// Table Render
// =============================================================
async function updateNote(id, newNote) {
  leads = leads.map(l => l.id === id ? { ...l, notes: newNote, updatedAt: new Date().toISOString() } : l);
  await save({ leads });
}

function render() {
  updateStats();
  renderStatusFilters();
  renderRoleFilter();
  renderReminders();
  if (!isReadOnly) updateShareUrl();

  const filtered = leads.filter(l => {
    const mS = filterStatus === "All" || l.status === filterStatus;
    const mR = !filterRole || l.roleId === filterRole;
    const mQ = !search || l.name.toLowerCase().includes(search) || (l.company || "").toLowerCase().includes(search);
    return mS && mR && mQ;
  });

  const tbody = document.getElementById("tbody");
  if (!filtered.length) {
    tbody.innerHTML = `<tr><td colspan="7" class="empty">${
      !leads.length
        ? (isReadOnly ? "No leads to display yet." : "No leads yet — use the 🔗 button on LinkedIn!")
        : "No leads match your filters."
    }</td></tr>`;
    return;
  }

  tbody.innerHTML = filtered.map(l => `
    <tr class="${isOverdue(l) ? "overdue" : ""}">
      <td>
        <a class="ll" href="${l.url}" target="_blank">${l.name}</a>
        ${isOverdue(l) ? `<span class="overdue-tag">⏰ Follow up</span>` : ""}
      </td>
      <td style="color:#64748b">${l.company || "—"}</td>
      <td><span class="role-tag">${roleName(l.roleId)}</span></td>
      <td>
        <select class="ss ${sClass(l.status)}" data-id="${l.id}" ${isReadOnly ? "disabled" : ""}>
          ${STATUSES.map(s => `<option${s === l.status ? " selected" : ""}>${s}</option>`).join("")}
        </select>
      </td>
      <td class="notes-cell">
        ${isReadOnly
          ? `<span style="color:#64748b">${l.notes || "—"}</span>`
          : `<input type="text" class="notes-input" data-id="${l.id}" value="${(l.notes || "").replace(/"/g, '&quot;')}" placeholder="Add note..." />`
        }
      </td>
      <td style="color:#94a3b8;font-size:12px">${l.date}</td>
      <td>${!isReadOnly ? `<button class="del-btn" data-id="${l.id}">✕</button>` : ""}</td>
    </tr>
  `).join("");

  if (!isReadOnly) {
    tbody.querySelectorAll(".ss").forEach(sel => sel.addEventListener("change", async e => {
      const id = Number(e.target.dataset.id);
      leads = leads.map(l => l.id === id ? { ...l, status: e.target.value, statusChangedAt: new Date().toISOString() } : l);
      await save({ leads });
      render();
    }));

    tbody.querySelectorAll(".notes-input").forEach(input => {
      input.addEventListener("change", async e => {
        const id = Number(e.target.dataset.id);
        await updateNote(id, e.target.value.trim());
      });
      input.addEventListener("keydown", e => { if (e.key === "Enter") e.target.blur(); });
    });

    tbody.querySelectorAll(".del-btn").forEach(btn => btn.addEventListener("click", async () => {
      if (!confirm("Remove this lead?")) return;
      leads = leads.filter(l => l.id !== Number(btn.dataset.id));
      await save({ leads });
      render();
    }));
  }
}

// =============================================================
// CSV Export
// =============================================================
function exportCSV() {
  const rows = [["Name", "Company", "Role", "LinkedIn URL", "Status", "Notes", "Date"]];
  leads.forEach(l => rows.push([l.name, l.company || "", roleName(l.roleId), l.url, l.status, l.notes || "", l.date]));
  const csv = rows.map(r => r.map(v => `"${v}"`).join(",")).join("\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
  a.download = "linkedin-outreach.csv";
  a.click();
}

document.getElementById("exportBtn").addEventListener("click", exportCSV);
document.getElementById("exportBtn2").addEventListener("click", exportCSV);
document.getElementById("search").addEventListener("input", e => { search = e.target.value.toLowerCase(); render(); });

document.getElementById("copyBtn")?.addEventListener("click", () => {
  const url = 'https://priyankapnc.github.io/Linkedin-tracker/';
  navigator.clipboard.writeText(url).then(() => {
    const btn = document.getElementById("copyBtn");
    btn.textContent = "✓ Copied!";
    btn.classList.add("copied");
    setTimeout(() => { btn.textContent = "📋 Copy Link"; btn.classList.remove("copied"); }, 2500);
  });
});

// =============================================================
// Init
// =============================================================
(async () => {
  if (isReadOnly) {
    document.getElementById("readonlyBar").style.display = "flex";
    document.getElementById("readBadge").style.display = "inline";
    document.getElementById("shareBanner").style.display = "none";
    document.getElementById("actionsHead").style.display = "none";
  }
  const d = await load();
  leads = d.leads || [];
  roles = d.roles || [];
  dismissed = new Set((d.dismissed || []).map(String));
  render();
})();