(function () {
  if (document.getElementById("lot-fab")) return;

  const fab = document.createElement("div");
  fab.id = "lot-fab";
  fab.innerHTML = `
    <div id="lot-btn" title="Log to Outreach Tracker">🔗</div>
    <div id="lot-panel" style="display:none">
      <div id="lot-header">🔗 LinkedIn Tracker</div>
      <div id="lot-body">
        <div class="lot-row"><label>Name</label><input id="lot-name" placeholder="Auto-detected..." /></div>
        <div class="lot-row">
          <label>Companies <span style="font-size:9px;color:#94a3b8;text-transform:none">(auto-detected, editable)</span></label>
          <input id="lot-company" placeholder="Company name..." />
        </div>
        <div class="lot-row"><label>Role</label><select id="lot-role"><option value="">Loading...</option></select></div>
        <div class="lot-row"><label>Status</label>
          <select id="lot-status">
            <option>Contacted</option><option>Connection Sent</option><option>Connected</option>
            <option>Message Sent</option><option>Replied</option><option>JD Shared</option>
            <option>Not Interested</option><option>Moved to Interview</option>
            <option>Meeting Set</option><option>No Response</option><option>Closed</option>
          </select>
        </div>
        <div class="lot-row"><label>Notes</label><input id="lot-notes" placeholder="Quick note..." /></div>
        <div id="lot-actions">
          <button id="lot-save">Save Lead</button>
          <button id="lot-close">✕</button>
        </div>
        <div id="lot-toast" style="display:none">✓ Saved!</div>
      </div>
    </div>
  `;

  const style = document.createElement("style");
  style.textContent = `
    #lot-fab { position:fixed; bottom:80px; right:24px; z-index:99999; font-family:-apple-system,sans-serif; }
    #lot-btn { width:48px; height:48px; background:#0a66c2; border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:22px; cursor:pointer; box-shadow:0 4px 12px rgba(0,0,0,0.25); user-select:none; transition:transform 0.15s; }
    #lot-btn:hover { transform:scale(1.1); }
    #lot-panel { position:absolute; bottom:58px; right:0; width:290px; background:white; border-radius:12px; box-shadow:0 8px 30px rgba(0,0,0,0.18); overflow:hidden; }
    #lot-header { background:#0a66c2; color:white; padding:10px 14px; font-size:13px; font-weight:700; }
    #lot-body { padding:12px 14px; }
    .lot-row { margin-bottom:9px; }
    .lot-row label { font-size:10px; font-weight:700; color:#94a3b8; text-transform:uppercase; display:block; margin-bottom:3px; }
    .lot-row input, .lot-row select { width:100%; border:1px solid #e2e8f0; border-radius:7px; padding:6px 9px; font-size:12px; outline:none; box-sizing:border-box; }
    .lot-row input:focus, .lot-row select:focus { border-color:#0a66c2; }
    #lot-actions { display:flex; gap:8px; margin-top:10px; }
    #lot-save { flex:1; background:#0a66c2; color:white; border:none; border-radius:7px; padding:8px; font-size:12px; font-weight:700; cursor:pointer; }
    #lot-close { background:#f1f5f9; border:none; border-radius:7px; padding:8px 10px; font-size:12px; cursor:pointer; color:#475569; }
    #lot-toast { margin-top:8px; background:#dcfce7; color:#15803d; border-radius:6px; padding:6px; font-size:12px; font-weight:600; text-align:center; }
    @keyframes lot-pulse { 0%{box-shadow:0 0 0 0 rgba(10,102,194,0.7)} 70%{box-shadow:0 0 0 10px rgba(10,102,194,0)} 100%{box-shadow:0 0 0 0 rgba(10,102,194,0)} }
  `;
  document.head.appendChild(style);
  document.body.appendChild(fab);

  function detectName() {
    if (window.location.href.includes("/in/")) {
      const h1 = document.querySelector("h1");
      if (h1) return h1.innerText.trim();
    }
    return document.querySelector(".msg-entity-lockup__entity-title")?.innerText?.trim() || "";
  }

  function detectCompanies() {
    const companies = [];
    const seen = new Set();
    
    function addCompany(name) {
      const clean = name?.trim();
      if (clean && clean.length > 1 && clean.length < 60 && !seen.has(clean.toLowerCase())) {
        seen.add(clean.toLowerCase());
        companies.push(clean);
      }
    }

    // Method 1: Check headline for "Title at Company" pattern
    const headline = document.querySelector(".text-body-medium")?.innerText?.trim() || "";
    const atMatch = headline.match(/(?:at|@)\s+([^|·]+)/i);
    if (atMatch) addCompany(atMatch[1]);

    // Method 2: Look for company logo images in experience section
    const expSection = document.getElementById("experience")?.closest("section");
    if (expSection) {
      expSection.querySelectorAll('img[alt]').forEach(img => {
        if (img.alt && !img.alt.toLowerCase().includes("profile")) {
          const alt = img.alt.replace(/logo/gi, "").trim();
          addCompany(alt);
        }
      });
    }

    // Method 3: Look for company page links
    const companyLinks = document.querySelectorAll('a[href*="/company/"]');
    companyLinks.forEach(link => {
      const text = link.innerText?.trim();
      if (text && !text.includes("\n")) {
        addCompany(text);
      }
    });

    // Method 4: Parse Experience section for company names
    if (expSection && companies.length < 3) {
      const allText = expSection.innerText;
      const lines = allText.split("\n").map(l => l.trim()).filter(l => l.length > 1);
      
      const skipPatterns = [
        /^(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/i,
        /^\d{4}/,
        /^(present|experience|skills|show all)/i,
        /^(full-time|part-time|remote|hybrid|contract|freelance|internship)/i,
        /^(manager|senior|sr\.|jr\.|lead|head|director|vp|ceo|cto|engineer|developer|analyst|specialist|consultant|intern|associate|executive|coordinator|assistant)/i,
        /·/,
        /\d+\s*(yr|mo|year|month)/i,
        /^(india|singapore|usa|uk|remote|hybrid|location)/i,
      ];
      
      for (const line of lines) {
        if (companies.length >= 5) break;
        const shouldSkip = skipPatterns.some(p => p.test(line));
        if (!shouldSkip && line.length > 2 && line.length < 50) {
          addCompany(line);
        }
      }
    }

    return companies.slice(0, 5).join(", ");
  }

  function loadRolesAndDefaults() {
    chrome.storage.local.get(["roles","lastRole","lastStatus"], d => {
      const roles = d.roles || [];
      const sel = document.getElementById("lot-role");
      sel.innerHTML = roles.length
        ? roles.map(r => `<option value="${r.id}">${r.title}</option>`).join("") + `<option value="__add">+ Add in popup</option>`
        : `<option value="">No roles — add in popup</option>`;
      if (d.lastRole) sel.value = d.lastRole;
      const ss = document.getElementById("lot-status");
      if (d.lastStatus && ss.value !== "Replied") ss.value = d.lastStatus;
    });
  }

  document.getElementById("lot-btn").addEventListener("click", () => {
    const panel = document.getElementById("lot-panel");
    const isOpen = panel.style.display !== "none";
    panel.style.display = isOpen ? "none" : "block";
    if (!isOpen) {
      document.getElementById("lot-name").value = detectName();
      document.getElementById("lot-company").value = detectCompanies();
      document.getElementById("lot-notes").value = "";
      document.getElementById("lot-toast").style.display = "none";
      loadRolesAndDefaults();
    }
  });

  document.getElementById("lot-close").addEventListener("click", () => {
    document.getElementById("lot-panel").style.display = "none";
  });

  document.getElementById("lot-save").addEventListener("click", () => {
    const roleEl = document.getElementById("lot-role");
    const statusEl = document.getElementById("lot-status");
    if (!roleEl.value || roleEl.value === "__add") return;

    const newStatus = statusEl.value;
    const lead = {
      id: Date.now(),
      name: document.getElementById("lot-name").value.trim() || detectName(),
      url: window.location.href.split("?")[0],
      company: document.getElementById("lot-company").value.trim(),
      roleId: roleEl.value,
      roleName: roleEl.options[roleEl.selectedIndex]?.text || "",
      status: newStatus,
      notes: document.getElementById("lot-notes").value.trim(),
      date: new Date().toLocaleDateString(),
      updatedAt: new Date().toISOString(),
      statusChangedAt: new Date().toISOString(),
      addedBy: "extension",
    };

    chrome.storage.local.get(["leads"], d => {
      let leads = d.leads || [];
      // Match by name + role (handles profile vs messaging URL difference)
      const idx = leads.findIndex(l => 
        (l.url === lead.url || l.name.toLowerCase() === lead.name.toLowerCase()) && 
        l.roleId === lead.roleId
      );
      if (idx >= 0) {
        leads[idx] = { ...leads[idx], ...lead, id: leads[idx].id, date: leads[idx].date };
      } else {
        leads = [lead, ...leads];
      }
      chrome.storage.local.set({ leads, lastRole: roleEl.value, lastStatus: newStatus }, () => {
        const toast = document.getElementById("lot-toast");
        toast.style.display = "block";
        toast.textContent = idx >= 0 ? "✓ Updated!" : "✓ Saved!";
        setTimeout(() => { toast.style.display="none"; document.getElementById("lot-panel").style.display="none"; }, 1500);
      });
    });
  });

  // Detect replies - only count as reply if THEY sent a message (not just accepted connection)
  function checkForReply() {
    // Get all messages in the conversation
    const allMessages = document.querySelectorAll(".msg-s-event-listitem, .msg-s-message-list__event");
    if (allMessages.length < 2) return false; // Need at least 2 messages (yours + theirs)
    
    // Check if there are any INBOUND messages (from them, not from you)
    let hasInboundMessage = false;
    
    allMessages.forEach(msg => {
      // Check for outbound indicators (your messages)
      const isOutbound = msg.classList.contains("msg-s-event-listitem--outbound") ||
                         msg.querySelector(".msg-s-message-group__meta--own") ||
                         msg.querySelector('[class*="outbound"]');
      
      if (!isOutbound) {
        // This might be their message - verify it has actual message content
        const hasMessageContent = msg.querySelector(".msg-s-event__content") ||
                                  msg.querySelector(".msg-s-event-listitem__body") ||
                                  msg.innerText?.length > 10;
        
        // Exclude system messages like "You are now connected"
        const text = msg.innerText?.toLowerCase() || "";
        const isSystemMessage = text.includes("you are now connected") ||
                                text.includes("accepted your") ||
                                text.includes("invitation") ||
                                text.includes("sent a connection request");
        
        if (hasMessageContent && !isSystemMessage) {
          hasInboundMessage = true;
        }
      }
    });
    
    return hasInboundMessage;
  }

  function getPersonName() {
    const msgHeader = document.querySelector(".msg-overlay-bubble-header__title, .msg-thread__link-to-profile");
    if (msgHeader) return msgHeader.innerText?.trim();
    
    const convHeader = document.querySelector(".msg-entity-lockup__entity-title");
    if (convHeader) return convHeader.innerText?.trim();
    
    return detectName();
  }

  function autoUpdateStatus(newStatus) {
    const name = getPersonName();
    if (!name) return;

    chrome.storage.local.get(["leads"], d => {
      let leads = d.leads || [];
      
      const idx = leads.findIndex(l => l.name.toLowerCase() === name.toLowerCase());
      
      if (idx >= 0) {
        const statusOrder = ["Contacted", "Connection Sent", "Connected", "Message Sent", "Replied", "JD Shared", "Not Interested", "Moved to Interview", "Meeting Set", "No Response", "Closed"];
        const currentIdx = statusOrder.indexOf(leads[idx].status);
        const newIdx = statusOrder.indexOf(newStatus);
        
        if (newIdx > currentIdx || newStatus === "Replied") {
          leads[idx].status = newStatus;
          leads[idx].updatedAt = new Date().toISOString();
          leads[idx].statusChangedAt = new Date().toISOString();
          
          chrome.storage.local.set({ leads }, () => {
            console.log(`✓ Auto-updated ${name} to ${newStatus}`);
            pulseButton();
          });
        }
      }
    });
  }

  function pulseButton() {
    const btn = document.getElementById("lot-btn");
    if (btn) {
      btn.style.animation = "lot-pulse 1s ease-in-out 3";
      setTimeout(() => btn.style.animation = "", 3500);
    }
  }

  let lastReplyState = false;
  new MutationObserver(() => {
    const hasReply = checkForReply();
    if (hasReply && !lastReplyState) {
      autoUpdateStatus("Replied");
      const ss = document.getElementById("lot-status");
      if (ss) ss.value = "Replied";
    }
    lastReplyState = hasReply;
  }).observe(document.body, { childList: true, subtree: true });
})();