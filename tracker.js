const STATUSES=["Contacted","Connection Sent","Connected","Connected - No Response","Message Sent","Replied","JD Shared","Shared for Screening","Not Interested","Moved to Interview","Meeting Set","No Response","Closed"];
const S_CLASS=["s0","s1","s2","s2b","s3","s4","s4b","s4c","s5b","s5c","s5","s6","s7"];
const FOLLOWUP_DAYS=3;
const FOLLOWUP_STATUSES = ["Connected", "JD Shared", "Message Sent"];

let leads=[],roles=[],dismissed=new Set();
let filterStatus="All",filterRole="",search="",filterDays="all",customDateFrom=null,customDateTo=null;

const isExt=typeof chrome!=="undefined"&&chrome.storage;
const params=new URLSearchParams(location.search);
const sharedData=params.get("data");
const isReadOnly=!!sharedData;

async function load(){
  if(isReadOnly){
    try{return JSON.parse(decodeURIComponent(atob(sharedData)));}catch{return{};}
  }
  if(isExt)return new Promise(r=>chrome.storage.local.get(["leads","roles","dismissed"],r));
  return{
    leads:JSON.parse(localStorage.getItem("leads")||"[]"),
    roles:JSON.parse(localStorage.getItem("roles")||"[]"),
    dismissed:JSON.parse(localStorage.getItem("dismissed")||"[]")
  };
}

async function save(obj){
  if(isReadOnly)return;
  if(isExt)return new Promise(r=>chrome.storage.local.set(obj,r));
  Object.entries(obj).forEach(([k,v])=>localStorage.setItem(k,JSON.stringify(v)));
}

function parseDate(d){
  if(!d)return null;
  // Handle various date formats
  if(d instanceof Date) return d;
  // Try ISO format first
  let date = new Date(d);
  if(!isNaN(date)) return date;
  // Try MM/DD/YYYY format
  const parts = d.split('/');
  if(parts.length === 3){
    date = new Date(parts[2], parts[0]-1, parts[1]);
    if(!isNaN(date)) return date;
  }
  return null;
}

function daysSince(d){
  const t=parseDate(d);
  if(!t||isNaN(t))return 0;
  return Math.floor((Date.now()-t.getTime())/86400000);
}

function isInDateRange(dateStr){
  if(filterDays==="all" && !customDateFrom && !customDateTo) return true;
  
  const date = parseDate(dateStr);
  if(!date) return true;
  
  const now = new Date();
  now.setHours(23,59,59,999);
  
  if(customDateFrom && customDateTo){
    const from = new Date(customDateFrom);
    from.setHours(0,0,0,0);
    const to = new Date(customDateTo);
    to.setHours(23,59,59,999);
    return date >= from && date <= to;
  }
  
  if(filterDays !== "all" && filterDays !== "custom"){
    const days = parseInt(filterDays);
    const cutoff = new Date(now);
    cutoff.setDate(cutoff.getDate() - days);
    cutoff.setHours(0,0,0,0);
    return date >= cutoff;
  }
  
  return true;
}

function getFilteredLeads(){
  return leads.filter(l=>{
    const mS = filterStatus==="All" || l.status===filterStatus;
    const mR = !filterRole || l.roleId===filterRole;
    const mQ = !search || l.name.toLowerCase().includes(search) || (l.company||"").toLowerCase().includes(search);
    const mD = isInDateRange(l.date);
    return mS && mR && mQ && mD;
  });
}

function getReminders(){
  return leads.filter(l => 
    FOLLOWUP_STATUSES.includes(l.status) && 
    !dismissed.has(String(l.id)) && 
    daysSince(l.statusChangedAt || l.date) >= FOLLOWUP_DAYS
  )
    .map(l=>({...l,daysSince:daysSince(l.statusChangedAt||l.date)}))
    .sort((a,b)=>b.daysSince-a.daysSince);
}

function initials(n){return n.split(" ").slice(0,2).map(w=>w[0]||"").join("").toUpperCase();}

function renderReminders(){
  if(isReadOnly)return;
  const rem=getReminders();
  const wrap=document.getElementById("remindersWrap");
  const list=document.getElementById("remindersList");
  if(!rem.length){wrap.style.display="none";return;}
  wrap.style.display="block";
  document.getElementById("reminderCount").textContent=rem.length;
  list.innerHTML=rem.map(r=>`
    <div class="reminder-item">
      <div class="reminder-avatar">${initials(r.name)}</div>
      <div class="reminder-info">
        <div class="reminder-name">${r.name}</div>
        <div class="reminder-meta">${r.company||"—"} · <span class="role-tag">${roleName(r.roleId)}</span> · <span style="color:#ea580c;font-weight:600">${r.status}</span></div>
      </div>
      <div class="reminder-days">+${r.daysSince}d no response</div>
      <div class="reminder-actions">
        <button class="btn-followup" data-url="${r.url}">💬 Follow Up</button>
        <button class="btn-dismiss" data-id="${r.id}">Dismiss</button>
      </div>
    </div>
  `).join("");
  list.querySelectorAll(".btn-followup").forEach(b=>b.addEventListener("click",()=>window.open(b.dataset.url,"_blank")));
  list.querySelectorAll(".btn-dismiss").forEach(b=>b.addEventListener("click",async()=>{
    dismissed.add(b.dataset.id);
    await save({dismissed:[...dismissed]});
    renderReminders();
  }));
}

let remOpen=true;
document.getElementById("remindersHeader")?.addEventListener("click",()=>{
  remOpen=!remOpen;
  document.getElementById("remindersList").style.display=remOpen?"block":"none";
  document.getElementById("reminderChevron").className="chevron"+(remOpen?" open":"");
  document.getElementById("remindersHeader").className="reminders-header"+(remOpen?"":" collapsed");
});

function generateShareUrl(){
  const enc=btoa(encodeURIComponent(JSON.stringify({leads,roles})));
  return`${location.origin}${location.pathname}?data=${enc}`;
}

function updateShareUrl(){
  const url = generateShareUrl();
  const shareUrlEl = document.getElementById("shareUrl");
  if(url.length > 100) {
    shareUrlEl.textContent = url.substring(0, 50) + "... (" + leads.length + " leads)";
    shareUrlEl.title = "Click Copy to copy full link";
  } else {
    shareUrlEl.textContent = url;
  }
}

function updateStats(){
  const filtered = getFilteredLeads();
  const t = filtered.length;
  const rep = filtered.filter(l=>["Replied","JD Shared","Shared for Screening","Meeting Set","Moved to Interview"].includes(l.status)).length;
  const meet = filtered.filter(l=>["Meeting Set","Moved to Interview","Shared for Screening"].includes(l.status)).length;
  document.getElementById("sTotal").textContent = t;
  document.getElementById("sReplied").textContent = rep;
  document.getElementById("sMeetings").textContent = meet;
  document.getElementById("sRate").textContent = t ? Math.round(rep/t*100)+"%" : "0%";
}

function roleName(id){return roles.find(r=>r.id===id)?.title||id||"—";}

function sClass(s){
  const idx = STATUSES.indexOf(s);
  return S_CLASS[idx]||"s0";
}

function isOverdue(l){
  return FOLLOWUP_STATUSES.includes(l.status) && 
         daysSince(l.statusChangedAt || l.date) >= FOLLOWUP_DAYS && 
         !dismissed.has(String(l.id));
}

function renderRoleFilter(){
  const sel=document.getElementById("roleFilter");
  sel.innerHTML=`<option value="">All Roles</option>`+roles.map(r=>`<option value="${r.id}">${r.title}</option>`).join("");
  sel.value=filterRole;
  sel.onchange=e=>{filterRole=e.target.value;render()};
}

function renderStatusFilters(){
  const wrap=document.getElementById("statusFilters");
  const filtered = getFilteredLeads();
  const counts={};
  
  // Count based on filtered leads (by date and role)
  const dateRoleFiltered = leads.filter(l=>{
    const mR = !filterRole || l.roleId===filterRole;
    const mD = isInDateRange(l.date);
    return mR && mD;
  });
  
  dateRoleFiltered.forEach(l=>counts[l.status]=(counts[l.status]||0)+1);
  
  wrap.innerHTML=["All",...STATUSES].map(s=>{
    const c = s==="All" ? dateRoleFiltered.length : (counts[s]||0);
    if(s!=="All" && c===0) return "";
    return`<button class="pill${filterStatus===s?" active":""}" data-s="${s}">${s} (${c})</button>`;
  }).join("");
  
  wrap.querySelectorAll(".pill").forEach(b=>b.addEventListener("click",()=>{
    filterStatus=b.dataset.s;
    render();
  }));
}

async function updateNote(id, newNote) {
  leads = leads.map(l => l.id === id ? {...l, notes: newNote, updatedAt: new Date().toISOString()} : l);
  await save({leads});
}

function render(){
  updateStats();
  renderStatusFilters();
  renderRoleFilter();
  renderReminders();
  if(!isReadOnly)updateShareUrl();
  
  const filtered = getFilteredLeads();
  
  const tbody=document.getElementById("tbody");
  if(!filtered.length){
    tbody.innerHTML=`<tr><td colspan="7" class="empty">${!leads.length?"No leads yet — use the 🔗 button on LinkedIn!":"No leads match your filters."}</td></tr>`;
    return;
  }
  
  tbody.innerHTML=filtered.map(l=>`
    <tr class="${isOverdue(l)?"overdue":""}">
      <td>
        <a class="ll" href="${l.url}" target="_blank">${l.name}</a>
        ${isOverdue(l)?`<span class="overdue-tag">⏰ Follow up</span>`:""}
      </td>
      <td style="color:#64748b">${l.company||"—"}</td>
      <td><span class="role-tag">${roleName(l.roleId)}</span></td>
      <td>
        <select class="ss ${sClass(l.status)}" data-id="${l.id}" ${isReadOnly?"disabled":""}>
          ${STATUSES.map(s=>`<option${s===l.status?" selected":""}>${s}</option>`).join("")}
        </select>
      </td>
      <td class="notes-cell">
        ${isReadOnly 
          ? `<span style="color:#64748b">${l.notes||"—"}</span>`
          : `<input type="text" class="notes-input" data-id="${l.id}" value="${(l.notes||"").replace(/"/g, '&quot;')}" placeholder="Add note..." />`
        }
      </td>
      <td style="color:#94a3b8;font-size:12px">${l.date}</td>
      <td>${!isReadOnly?`<button class="del-btn" data-id="${l.id}">✕</button>`:""}</td>
    </tr>
  `).join("");
  
  if(!isReadOnly){
    tbody.querySelectorAll(".ss").forEach(sel=>sel.addEventListener("change",async e=>{
      const id=Number(e.target.dataset.id);
      leads=leads.map(l=>l.id===id?{...l,status:e.target.value,statusChangedAt:new Date().toISOString()}:l);
      await save({leads});
      render();
    }));
    
    tbody.querySelectorAll(".notes-input").forEach(input=>{
      input.addEventListener("change", async e=>{
        const id=Number(e.target.dataset.id);
        await updateNote(id, e.target.value.trim());
      });
      input.addEventListener("keydown", e=>{
        if(e.key === "Enter") e.target.blur();
      });
    });
    
    tbody.querySelectorAll(".del-btn").forEach(btn=>btn.addEventListener("click",async()=>{
      if(!confirm("Remove this lead?"))return;
      leads=leads.filter(l=>l.id!==Number(btn.dataset.id));
      await save({leads});
      render();
    }));
  }
}

// ============ INSIGHTS ============

function renderInsights(){
  const now = new Date();
  
  // Stats
  const thisWeekStart = new Date(now);
  thisWeekStart.setDate(now.getDate() - now.getDay());
  thisWeekStart.setHours(0,0,0,0);
  
  const last30Days = new Date(now);
  last30Days.setDate(now.getDate() - 30);
  
  const thisWeekLeads = leads.filter(l => {
    const d = parseDate(l.date);
    return d && d >= thisWeekStart;
  });
  
  const last30Leads = leads.filter(l => {
    const d = parseDate(l.date);
    return d && d >= last30Days;
  });
  
  const avgDaily = last30Leads.length > 0 ? (last30Leads.length / 30).toFixed(1) : 0;
  const responded = leads.filter(l=>["Replied","JD Shared","Shared for Screening","Meeting Set","Moved to Interview"].includes(l.status)).length;
  const responseRate = leads.length ? Math.round(responded/leads.length*100) : 0;
  
  document.getElementById("insTotal").textContent = leads.length;
  document.getElementById("insThisWeek").textContent = thisWeekLeads.length;
  document.getElementById("insAvgDaily").textContent = avgDaily;
  document.getElementById("insResponseRate").textContent = responseRate + "%";
  
  // Daily Chart (last 14 days)
  renderDailyChart();
  
  // Weekly Chart
  renderWeeklyChart();
  
  // Role Breakdown
  renderRoleBreakdown();
  
  // Top Companies
  renderTopCompanies();
  
  // Role select for companies by role
  const roleSelect = document.getElementById("insightRoleSelect");
  roleSelect.innerHTML = `<option value="">Select a role...</option>` + 
    roles.map(r => `<option value="${r.id}">${r.title}</option>`).join("");
  roleSelect.onchange = () => renderCompaniesByRole(roleSelect.value);
}

function renderDailyChart(){
  const container = document.getElementById("dailyChart");
  const days = [];
  const now = new Date();
  
  for(let i = 13; i >= 0; i--){
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    d.setHours(0,0,0,0);
    const dayEnd = new Date(d);
    dayEnd.setHours(23,59,59,999);
    
    const count = leads.filter(l => {
      const ld = parseDate(l.date);
      return ld && ld >= d && ld <= dayEnd;
    }).length;
    
    days.push({
      label: d.toLocaleDateString('en-US', { weekday: 'short', day: 'numeric' }),
      count
    });
  }
  
  const maxCount = Math.max(...days.map(d => d.count), 1);
  
  container.innerHTML = days.map(d => `
    <div class="chart-bar-group">
      <div class="chart-value">${d.count || ''}</div>
      <div class="chart-bar" style="height:${(d.count/maxCount)*140}px"></div>
      <div class="chart-label">${d.label}</div>
    </div>
  `).join("");
}

function renderWeeklyChart(){
  const container = document.getElementById("weeklyChart");
  const weeks = [];
  const now = new Date();
  
  for(let i = 7; i >= 0; i--){
    const weekEnd = new Date(now);
    weekEnd.setDate(now.getDate() - (i * 7));
    weekEnd.setHours(23,59,59,999);
    
    const weekStart = new Date(weekEnd);
    weekStart.setDate(weekEnd.getDate() - 6);
    weekStart.setHours(0,0,0,0);
    
    const count = leads.filter(l => {
      const ld = parseDate(l.date);
      return ld && ld >= weekStart && ld <= weekEnd;
    }).length;
    
    const label = weekStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    weeks.push({ label, count });
  }
  
  const maxCount = Math.max(...weeks.map(w => w.count), 1);
  
  container.innerHTML = weeks.map(w => `
    <div class="chart-bar-group">
      <div class="chart-value">${w.count || ''}</div>
      <div class="chart-bar" style="height:${(w.count/maxCount)*140}px"></div>
      <div class="chart-label">${w.label}</div>
    </div>
  `).join("");
}

function renderRoleBreakdown(){
  const container = document.getElementById("roleBreakdown");
  const roleCounts = {};
  
  leads.forEach(l => {
    const name = roleName(l.roleId);
    roleCounts[name] = (roleCounts[name] || 0) + 1;
  });
  
  const sorted = Object.entries(roleCounts).sort((a,b) => b[1] - a[1]).slice(0, 6);
  const maxCount = sorted.length ? sorted[0][1] : 1;
  
  if(!sorted.length){
    container.innerHTML = '<div style="color:#94a3b8;font-size:13px;text-align:center;padding:20px;">No data yet</div>';
    return;
  }
  
  container.innerHTML = sorted.map(([name, count]) => `
    <div class="role-row">
      <div class="role-label" title="${name}">${name}</div>
      <div class="role-bar-bg">
        <div class="role-bar" style="width:${(count/maxCount)*100}%">
          <span>${count}</span>
        </div>
      </div>
    </div>
  `).join("");
}

function renderTopCompanies(){
  const container = document.getElementById("topCompanies");
  const companyCounts = {};
  
  leads.forEach(l => {
    if(l.company){
      // Split by comma and count each company
      const companies = l.company.split(',').map(c => c.trim()).filter(c => c.length > 1);
      companies.forEach(c => {
        companyCounts[c] = (companyCounts[c] || 0) + 1;
      });
    }
  });
  
  const sorted = Object.entries(companyCounts).sort((a,b) => b[1] - a[1]).slice(0, 10);
  
  if(!sorted.length){
    container.innerHTML = '<div style="color:#94a3b8;font-size:13px;text-align:center;padding:20px;">No company data yet</div>';
    return;
  }
  
  container.innerHTML = sorted.map(([name, count]) => `
    <div class="company-item">
      <div class="company-name">${name}</div>
      <div class="company-count">${count} leads</div>
    </div>
  `).join("");
}

function renderCompaniesByRole(roleId){
  const container = document.getElementById("companiesByRole");
  
  if(!roleId){
    container.innerHTML = '<div style="color:#94a3b8;font-size:13px;text-align:center;padding:20px;">Select a role to see top companies</div>';
    return;
  }
  
  const roleLeads = leads.filter(l => l.roleId === roleId);
  const companyCounts = {};
  
  roleLeads.forEach(l => {
    if(l.company){
      const companies = l.company.split(',').map(c => c.trim()).filter(c => c.length > 1);
      companies.forEach(c => {
        companyCounts[c] = (companyCounts[c] || 0) + 1;
      });
    }
  });
  
  const sorted = Object.entries(companyCounts).sort((a,b) => b[1] - a[1]).slice(0, 10);
  
  if(!sorted.length){
    container.innerHTML = '<div style="color:#94a3b8;font-size:13px;text-align:center;padding:20px;">No companies for this role yet</div>';
    return;
  }
  
  container.innerHTML = sorted.map(([name, count]) => `
    <div class="company-item">
      <div class="company-name">${name}</div>
      <div class="company-count">${count} leads</div>
    </div>
  `).join("");
}

// ============ EVENT LISTENERS ============

function exportCSV(){
  const filtered = getFilteredLeads();
  const rows=[["Name","Company","Role","LinkedIn URL","Status","Notes","Date"]];
  filtered.forEach(l=>rows.push([l.name,l.company||"",roleName(l.roleId),l.url,l.status,l.notes||"",l.date]));
  const csv=rows.map(r=>r.map(v=>`"${(v||'').replace(/"/g,'""')}"`).join(",")).join("\n");
  const a=document.createElement("a");
  a.href=URL.createObjectURL(new Blob([csv],{type:"text/csv"}));
  a.download="linkedin-outreach.csv";
  a.click();
}

// Tab switching
document.querySelectorAll(".tab-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
    document.querySelectorAll(".tab-content").forEach(c => c.classList.remove("active"));
    btn.classList.add("active");
    const tabId = btn.dataset.tab + "Tab";
    document.getElementById(tabId).classList.add("active");
    
    if(btn.dataset.tab === "insights"){
      renderInsights();
    }
  });
});

// Date presets
document.querySelectorAll(".date-preset").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".date-preset").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    
    const days = btn.dataset.days;
    const customRange = document.getElementById("customDateRange");
    
    if(days === "custom"){
      customRange.style.display = "flex";
      filterDays = "custom";
    } else {
      customRange.style.display = "none";
      filterDays = days;
      customDateFrom = null;
      customDateTo = null;
      render();
    }
  });
});

// Custom date range
document.getElementById("applyDateRange")?.addEventListener("click", () => {
  customDateFrom = document.getElementById("dateFrom").value;
  customDateTo = document.getElementById("dateTo").value;
  if(customDateFrom && customDateTo){
    render();
  }
});

document.getElementById("clearDateRange")?.addEventListener("click", () => {
  document.getElementById("dateFrom").value = "";
  document.getElementById("dateTo").value = "";
  customDateFrom = null;
  customDateTo = null;
  filterDays = "all";
  document.querySelectorAll(".date-preset").forEach(b => b.classList.remove("active"));
  document.querySelector('.date-preset[data-days="all"]').classList.add("active");
  document.getElementById("customDateRange").style.display = "none";
  render();
});

document.getElementById("exportBtn")?.addEventListener("click",exportCSV);
document.getElementById("exportBtn2")?.addEventListener("click",exportCSV);
document.getElementById("search")?.addEventListener("input",e=>{search=e.target.value.toLowerCase();render();});

document.getElementById("copyBtn")?.addEventListener("click",()=>{
  navigator.clipboard.writeText(generateShareUrl()).then(()=>{
    const btn=document.getElementById("copyBtn");
    btn.textContent="✓ Copied!";
    btn.classList.add("copied");
    setTimeout(()=>{btn.textContent="📋 Copy Link";btn.classList.remove("copied");},2500);
  });
});

// ============ INIT ============

(async()=>{
  if(isReadOnly){
    document.getElementById("readonlyBar").style.display="flex";
    document.getElementById("readBadge").style.display="inline";
    document.getElementById("shareBanner").style.display="none";
    document.getElementById("actionsHead").style.display="none";
  }
  const d=await load();
  leads=d.leads||[];
  roles=d.roles||[];
  dismissed=new Set((d.dismissed||[]).map(String));
  render();
})();
