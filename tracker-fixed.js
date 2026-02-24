const STATUSES=["Contacted","Connection Sent","Connected","Connected - No Response","Message Sent","Replied","JD Shared","Shared for Screening","Not Interested","Moved to Interview","Meeting Set","No Response","Closed"];
const S_CLASS=["s0","s1","s2","s2b","s3","s4","s4b","s4c","s5b","s5c","s5","s6","s7"];
const FOLLOWUP_DAYS=3;
let leads=[],roles=[],dismissed=new Set(),filterStatus="All",filterRole="",search="";
const isExt=typeof chrome!=="undefined"&&chrome.storage;
const params=new URLSearchParams(location.search);
const sharedData=params.get("data");
const isReadOnly=!!sharedData;

async function load(){
  if(isReadOnly){
    try{
      return JSON.parse(decodeURIComponent(escape(atob(sharedData))));
    }catch{return{};}
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

function daysSince(d){const t=new Date(d);if(isNaN(t))return 0;return Math.floor((Date.now()-t)/86400000);}

function getReminders(){
  return leads.filter(l=>l.status==="Connected"&&!dismissed.has(String(l.id))&&daysSince(l.statusChangedAt||l.date)>=FOLLOWUP_DAYS)
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
        <div class="reminder-meta">${r.company||"—"} · <span class="role-tag">${roleName(r.roleId)}</span></div>
      </div>
      <div class="reminder-days">+${r.daysSince}d no message</div>
      <div class="reminder-actions">
        <button class="btn-followup" data-url="${r.url}">💬 Message</button>
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
document.getElementById("remindersHeader").addEventListener("click",()=>{
  remOpen=!remOpen;
  document.getElementById("remindersList").style.display=remOpen?"block":"none";
  document.getElementById("reminderChevron").className="chevron"+(remOpen?" open":"");
  document.getElementById("remindersHeader").className="reminders-header"+(remOpen?"":" collapsed");
});

function generateShareUrl(){
  // Strip heavy/unnecessary fields to keep URL short
  const minimal={
    leads:leads.map(({name,company,url,status,notes,date,roleId})=>({name,company,url,status,notes,date,roleId})),
    roles
  };
  const enc=btoa(unescape(encodeURIComponent(JSON.stringify(minimal))));
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
  const t=leads.length;
  const rep=leads.filter(l=>["Replied","JD Shared","Shared for Screening","Meeting Set","Moved to Interview"].includes(l.status)).length;
  const meet=leads.filter(l=>["Meeting Set","Moved to Interview","Shared for Screening"].includes(l.status)).length;
  document.getElementById("sTotal").textContent=t;
  document.getElementById("sReplied").textContent=rep;
  document.getElementById("sMeetings").textContent=meet;
  document.getElementById("sRate").textContent=t?Math.round(rep/t*100)+"%":"0%";
}

function roleName(id){return roles.find(r=>r.id===id)?.title||id||"—";}

function sClass(s){
  const idx = STATUSES.indexOf(s);
  return S_CLASS[idx]||"s0";
}

function isOverdue(l){
  return l.status==="Connected"&&daysSince(l.statusChangedAt||l.date)>=FOLLOWUP_DAYS&&!dismissed.has(String(l.id));
}

function renderRoleFilter(){
  const sel=document.getElementById("roleFilter");
  sel.innerHTML=`<option value="">All Roles</option>`+roles.map(r=>`<option value="${r.id}">${r.title}</option>`).join("");
  sel.value=filterRole;
  sel.onchange=e=>{filterRole=e.target.value;render()};
}

function renderStatusFilters(){
  const wrap=document.getElementById("statusFilters"),counts={};
  leads.forEach(l=>counts[l.status]=(counts[l.status]||0)+1);
  wrap.innerHTML=["All",...STATUSES].map(s=>{
    const c=s==="All"?leads.length:(counts[s]||0);
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
  
  const filtered=leads.filter(l=>{
    const mS=filterStatus==="All"||l.status===filterStatus;
    const mR=!filterRole||l.roleId===filterRole;
    const mQ=!search||l.name.toLowerCase().includes(search)||(l.company||"").toLowerCase().includes(search);
    return mS&&mR&&mQ;
  });
  
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

function exportCSV(){
  const rows=[["Name","Company","Role","LinkedIn URL","Status","Notes","Date"]];
  leads.forEach(l=>rows.push([l.name,l.company||"",roleName(l.roleId),l.url,l.status,l.notes||"",l.date]));
  const csv=rows.map(r=>r.map(v=>`"${v}"`).join(",")).join("\n");
  const a=document.createElement("a");
  a.href=URL.createObjectURL(new Blob([csv],{type:"text/csv"}));
  a.download="linkedin-outreach.csv";
  a.click();
}

document.getElementById("exportBtn").addEventListener("click",exportCSV);
document.getElementById("exportBtn2").addEventListener("click",exportCSV);
document.getElementById("search").addEventListener("input",e=>{search=e.target.value.toLowerCase();render();});

document.getElementById("copyBtn")?.addEventListener("click",()=>{
  navigator.clipboard.writeText(generateShareUrl()).then(()=>{
    const btn=document.getElementById("copyBtn");
    btn.textContent="✓ Copied!";
    btn.classList.add("copied");
    setTimeout(()=>{btn.textContent="📋 Copy Link";btn.classList.remove("copied");},2500);
  });
});

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
