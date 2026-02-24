function randCode() {
  const words = ["HUNT","HIRE","TEAM","GROW","LINK","REACH","JOBS","FIND"];
  return words[Math.floor(Math.random()*words.length)] + "-" + Math.floor(1000+Math.random()*9000);
}
function get(keys) { return new Promise(r => chrome.storage.local.get(keys, r)); }
function set(obj) { return new Promise(r => chrome.storage.local.set(obj, r)); }

function showToast(id, msg) {
  const t = document.getElementById(id);
  t.style.display="block"; t.textContent=msg;
  setTimeout(() => t.style.display="none", 2500);
}

async function renderRoles() {
  const d = await get(["roles"]);
  const roles = d.roles || [];
  const list = document.getElementById("roleList");
  list.innerHTML = roles.length
    ? roles.map(r => `<div class="role-item"><span>${r.title}</span><button class="role-del" data-id="${r.id}">✕</button></div>`).join("")
    : `<div style="font-size:11px;color:#94a3b8;padding:4px 0">No roles yet. Add one below.</div>`;
  list.querySelectorAll(".role-del").forEach(btn => {
    btn.addEventListener("click", async () => {
      const d2 = await get(["roles"]);
      const updated = (d2.roles||[]).filter(r => r.id !== btn.dataset.id);
      await set({ roles: updated });
      renderRoles();
    });
  });
}

async function updateStats() {
  const d = await get(["leads"]);
  const leads = d.leads || [];
  const total = leads.length;
  const replied = leads.filter(l => ["Replied","Meeting Set"].includes(l.status)).length;
  document.getElementById("sTotal").textContent = total;
  document.getElementById("sReplied").textContent = replied;
  document.getElementById("sRate").textContent = total ? Math.round(replied/total*100)+"%" : "0%";
}

async function renderTeam() {
  const d = await get(["teamCode"]);
  if (d.teamCode) {
    document.getElementById("teamSetup").style.display = "none";
    document.getElementById("teamInfo").style.display = "block";
    document.getElementById("teamCode").textContent = d.teamCode;
  } else {
    document.getElementById("teamSetup").style.display = "block";
    document.getElementById("teamInfo").style.display = "none";
  }
}

document.getElementById("openTracker").addEventListener("click", () => {
  chrome.tabs.create({ url: chrome.runtime.getURL("tracker.html") });
});
document.getElementById("createTeam").addEventListener("click", async () => {
  const code = randCode();
  await set({ teamCode: code });
  renderTeam();
  showToast("teamToast", `✓ Team created! Code: ${code}`);
});
document.getElementById("joinTeam").addEventListener("click", async () => {
  const code = document.getElementById("joinCode").value.trim().toUpperCase();
  if (!code) return;
  await set({ teamCode: code });
  renderTeam();
  showToast("teamToast", `✓ Joined team ${code}`);
});
document.getElementById("leaveTeam").addEventListener("click", async () => {
  await set({ teamCode: null });
  renderTeam();
});
document.getElementById("addRole").addEventListener("click", async () => {
  const val = document.getElementById("newRole").value.trim();
  if (!val) return;
  const d = await get(["roles"]);
  const roles = d.roles || [];
  roles.push({ id: Date.now().toString(), title: val });
  await set({ roles });
  document.getElementById("newRole").value = "";
  renderRoles();
});

renderTeam(); renderRoles(); updateStats();