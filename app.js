/* ============================================
   NexusVault — App Logic
   Firebase Auth + Firestore + UI
   ============================================ */

// ── Firebase Config ──────────────────────────
const firebaseConfig = {
  apiKey: "AIzaSyB9wtPzz4vA3zAxe12VtdwpjNZdg_R00xY",
  authDomain: "nexusvaultofficial.firebaseapp.com",
  projectId: "nexusvaultofficial",
  storageBucket: "nexusvaultofficial.firebasestorage.app",
  messagingSenderId: "527838679966",
  appId: "1:527838679966:web:e119c2559fdd2bb0ea7c8f",
  measurementId: "G-ZV8YC08X4F"
};

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db   = firebase.firestore();

const ADMIN_EMAIL = "server@premiumserver.qzz.io";

// ── DOM References ───────────────────────────
const $  = (s) => document.querySelector(s);
const $$ = (s) => document.querySelectorAll(s);

const loadingScreen     = $("#loading-screen");
const toastContainer    = $("#toast-container");

const authSection       = $("#auth-section");
const loginForm         = $("#login-form");
const registerForm      = $("#register-form");
const forgotForm        = $("#forgot-form");
const verifyNotice      = $("#verify-email-notice");

const appSection        = $("#app-section");
const adminNav          = $("#admin-nav");
const adminBadge        = $("#admin-badge");
const verifiedBadge     = $("#verified-badge");
const userEmailDisplay  = $("#user-email-display");

// ── State ────────────────────────────────────
let currentUser     = null;
let isAdmin         = false;
let browseLevel     = "subjects"; // subjects | units | chapters | homeworks
let browseParentId  = null;
let browseTrail     = []; // [{label, level, parentId}]
let allSubjects     = [];
let allUnits        = [];
let allChapters     = [];

// Unsub functions for realtime listeners
let unsubHomework   = null;

// ── Toast ────────────────────────────────────
function toast(msg, type = "info") {
  const el = document.createElement("div");
  el.className = `toast ${type}`;
  el.textContent = msg;
  toastContainer.appendChild(el);
  setTimeout(() => el.remove(), 3400);
}

// ── Show / Hide Helpers ──────────────────────
function show(el) { el.classList.remove("hidden"); }
function hide(el) { el.classList.add("hidden"); }

function showAuthForm(form) {
  [loginForm, registerForm, forgotForm, verifyNotice].forEach(f => hide(f));
  show(form);
}

function showView(viewId) {
  $$(".view").forEach(v => v.classList.add("hidden"));
  const view = $(`#view-${viewId}`);
  if (view) {
    view.classList.remove("hidden");
    view.classList.remove("fadeIn");
    void view.offsetWidth; // reflow
    view.classList.add("fadeIn");
  }
  $$(".sidebar-link").forEach(l => l.classList.remove("active"));
  const link = $(`.sidebar-link[data-view="${viewId}"]`);
  if (link) link.classList.add("active");
}

// ══════════════════════════════════════════════
//  AUTH
// ══════════════════════════════════════════════

// Toggle between auth forms
$("#show-register").addEventListener("click", e => { e.preventDefault(); showAuthForm(registerForm); });
$("#show-login-from-reg").addEventListener("click", e => { e.preventDefault(); showAuthForm(loginForm); });
$("#show-forgot").addEventListener("click", e => { e.preventDefault(); showAuthForm(forgotForm); });
$("#show-login-from-forgot").addEventListener("click", e => { e.preventDefault(); showAuthForm(loginForm); });

// LOGIN
loginForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const email = $("#login-email").value.trim();
  const pass  = $("#login-password").value;
  try {
    await auth.signInWithEmailAndPassword(email, pass);
  } catch (err) {
    toast(err.message, "error");
  }
});

// REGISTER
registerForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const email = $("#reg-email").value.trim();
  const pass  = $("#reg-password").value;
  const pass2 = $("#reg-password2").value;
  if (pass !== pass2) { toast("Passwords don't match", "error"); return; }
  try {
    const cred = await auth.createUserWithEmailAndPassword(email, pass);
    await cred.user.sendEmailVerification();
    toast("Account created! Check your email for verification.", "success");
  } catch (err) {
    toast(err.message, "error");
  }
});

// FORGOT PASSWORD
forgotForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const email = $("#forgot-email").value.trim();
  try {
    await auth.sendPasswordResetEmail(email);
    toast("Reset link sent to your email!", "success");
    showAuthForm(loginForm);
  } catch (err) {
    toast(err.message, "error");
  }
});

// RESEND VERIFICATION
$("#resend-verify-btn").addEventListener("click", async () => {
  try {
    await currentUser.sendEmailVerification();
    toast("Verification email resent!", "success");
  } catch (err) {
    toast(err.message, "error");
  }
});

// CHECK VERIFICATION
$("#check-verify-btn").addEventListener("click", async () => {
  await currentUser.reload();
  if (currentUser.emailVerified) {
    toast("Email verified! Welcome!", "success");
    enterApp();
  } else {
    toast("Not verified yet. Please check your inbox.", "warning");
  }
});

// LOGOUT from verify screen
$("#verify-logout-btn").addEventListener("click", () => auth.signOut());

// LOGOUT from app
$("#logout-btn").addEventListener("click", () => auth.signOut());

// AUTH STATE CHANGE
auth.onAuthStateChanged(async (user) => {
  hide(loadingScreen);
  currentUser = user;

  if (!user) {
    // Not logged in
    isAdmin = false;
    hide(appSection);
    show(authSection);
    showAuthForm(loginForm);
    cleanupListeners();
    return;
  }

  isAdmin = user.email === ADMIN_EMAIL;

  // Check email verification (admin bypasses)
  if (!user.emailVerified && !isAdmin) {
    hide(appSection);
    show(authSection);
    showAuthForm(verifyNotice);
    return;
  }

  enterApp();
});

function enterApp() {
  hide(authSection);
  show(appSection);

  userEmailDisplay.textContent = currentUser.email;

  if (isAdmin) {
    show(adminBadge);
    show(adminNav);
  } else {
    hide(adminBadge);
    hide(adminNav);
  }

  if (currentUser.emailVerified) {
    show(verifiedBadge);
  } else {
    hide(verifiedBadge);
  }

  showView("home");
  loadStats();
  loadAllCaches();
}

// ══════════════════════════════════════════════
//  SIDEBAR NAV
// ══════════════════════════════════════════════

$$(".sidebar-link").forEach(link => {
  link.addEventListener("click", () => {
    const view = link.dataset.view;
    showView(view);

    // Close sidebar on mobile
    $("#sidebar").classList.remove("open");

    // Trigger load for admin views and browse
    if (view === "browse") { resetBrowse(); }
    if (view === "manage-subjects") { loadAdminSubjects(); }
    if (view === "manage-units") { loadAdminUnits(); }
    if (view === "manage-chapters") { loadAdminChapters(); }
    if (view === "manage-homework") { loadAdminHomework(); }
  });
});

// Sidebar mobile toggle
$("#sidebar-toggle").addEventListener("click", () => {
  $("#sidebar").classList.toggle("open");
});

// ══════════════════════════════════════════════
//  DATA CACHES
// ══════════════════════════════════════════════

async function loadAllCaches() {
  try {
    const [subSnap, unitSnap, chapSnap] = await Promise.all([
      db.collection("subjects").get(),
      db.collection("units").get(),
      db.collection("chapters").get()
    ]);
    allSubjects = subSnap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (a.name || "").localeCompare(b.name || ""));
    allUnits    = unitSnap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (a.name || "").localeCompare(b.name || ""));
    allChapters = chapSnap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (a.name || "").localeCompare(b.name || ""));
  } catch (err) {
    console.error("Cache load error:", err);
  }
}

// ══════════════════════════════════════════════
//  STATS (HOME VIEW)
// ══════════════════════════════════════════════

async function loadStats() {
  try {
    const [subSnap, unitSnap, chapSnap, hwSnap] = await Promise.all([
      db.collection("subjects").get(),
      db.collection("units").get(),
      db.collection("chapters").get(),
      db.collection("homeworks").get()
    ]);
    animateCount($("#stat-subjects"), subSnap.size);
    animateCount($("#stat-units"), unitSnap.size);
    animateCount($("#stat-chapters"), chapSnap.size);
    animateCount($("#stat-homeworks"), hwSnap.size);
  } catch (err) {
    console.error("Stats error:", err);
  }
}

function animateCount(el, target) {
  let current = 0;
  const step = Math.max(1, Math.ceil(target / 30));
  const interval = setInterval(() => {
    current += step;
    if (current >= target) { current = target; clearInterval(interval); }
    el.textContent = current;
  }, 30);
}

// ══════════════════════════════════════════════
//  BROWSE VIEW (Student)
// ══════════════════════════════════════════════

function resetBrowse() {
  browseLevel    = "subjects";
  browseParentId = null;
  browseTrail    = [];
  hide($("#homework-filters"));
  renderBreadcrumb();
  loadBrowseList();
}

function renderBreadcrumb() {
  const bc = $("#breadcrumb");
  bc.innerHTML = "";

  // Root
  const root = document.createElement("span");
  root.className = "breadcrumb-item" + (browseTrail.length === 0 ? " active" : "");
  root.textContent = "Subjects";
  root.addEventListener("click", () => {
    browseLevel    = "subjects";
    browseParentId = null;
    browseTrail    = [];
    hide($("#homework-filters"));
    renderBreadcrumb();
    loadBrowseList();
  });
  bc.appendChild(root);

  browseTrail.forEach((crumb, i) => {
    const sep = document.createElement("span");
    sep.className = "breadcrumb-sep";
    sep.textContent = " › ";
    bc.appendChild(sep);

    const item = document.createElement("span");
    item.className = "breadcrumb-item" + (i === browseTrail.length - 1 ? " active" : "");
    item.textContent = crumb.label;
    item.addEventListener("click", () => {
      browseLevel    = crumb.level;
      browseParentId = crumb.parentId;
      browseTrail    = browseTrail.slice(0, i + 1);
      if (crumb.level !== "homeworks") hide($("#homework-filters"));
      renderBreadcrumb();
      loadBrowseList();
    });
    bc.appendChild(item);
  });
}

async function loadBrowseList() {
  const list = $("#browse-list");
  list.innerHTML = "";

  cleanupListeners();

  try {
    if (browseLevel === "subjects") {
      const snap = await db.collection("subjects").get();
      if (snap.empty) { list.innerHTML = emptyHTML("No subjects yet"); return; }
      const docs = snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (a.name || "").localeCompare(b.name || ""));
      docs.forEach(item => {
        list.appendChild(browseItemEl(item.id, "📁", item.name, "Subject", () => {
          browseLevel    = "units";
          browseParentId = item.id;
          browseTrail.push({ label: item.name, level: "units", parentId: item.id });
          renderBreadcrumb();
          loadBrowseList();
        }));
      });
    } else if (browseLevel === "units") {
      const snap = await db.collection("units").where("subjectId", "==", browseParentId).get();
      if (snap.empty) { list.innerHTML = emptyHTML("No units in this subject"); return; }
      const docs = snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (a.name || "").localeCompare(b.name || ""));
      docs.forEach(item => {
        list.appendChild(browseItemEl(item.id, "📂", item.name, "Unit", () => {
          browseLevel    = "chapters";
          browseParentId = item.id;
          browseTrail.push({ label: item.name, level: "chapters", parentId: item.id });
          renderBreadcrumb();
          loadBrowseList();
        }));
      });
    } else if (browseLevel === "chapters") {
      const snap = await db.collection("chapters").where("unitId", "==", browseParentId).get();
      if (snap.empty) { list.innerHTML = emptyHTML("No chapters in this unit"); return; }
      const docs = snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (a.name || "").localeCompare(b.name || ""));
      docs.forEach(item => {
        list.appendChild(browseItemEl(item.id, "📑", item.name, "Chapter", () => {
          browseLevel    = "homeworks";
          browseParentId = item.id;
          browseTrail.push({ label: item.name, level: "homeworks", parentId: item.id });
          show($("#homework-filters"));
          renderBreadcrumb();
          loadBrowseList();
        }));
      });
    } else if (browseLevel === "homeworks") {
      loadHomeworkList(list);
    }
  } catch (err) {
    console.error("Browse error:", err);
    toast(err.message, "error");
    list.innerHTML = emptyHTML("Error loading data. Check console for details.");
  }
}

function loadHomeworkList(container) {
  const filterType = $("#filter-type").value;
  const filterTags = $("#filter-tags").value.trim().toLowerCase().split(",").map(t => t.trim()).filter(Boolean);

  let query = db.collection("homeworks").where("chapterId", "==", browseParentId);
  if (filterType) {
    query = query.where("type", "==", filterType);
  }

  unsubHomework = query.onSnapshot((snap) => {
    container.innerHTML = "";
    if (snap.empty) {
      container.innerHTML = emptyHTML("No homework found");
      return;
    }
    let docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));

    // Client-side tag filter
    if (filterTags.length > 0) {
      docs = docs.filter(hw => {
        if (!hw.tags || hw.tags.length === 0) return false;
        return filterTags.some(t => hw.tags.map(tag => tag.toLowerCase()).includes(t));
      });
    }

    if (docs.length === 0) {
      container.innerHTML = emptyHTML("No homework matches your filters");
      return;
    }

    docs.forEach(hw => {
      container.appendChild(homeworkCardEl(hw));
    });
  }, (err) => {
    console.error("Homework listener error:", err);
    container.innerHTML = emptyHTML("Error loading homework");
  });
}

// Apply / Clear filters
$("#apply-filters-btn").addEventListener("click", () => {
  const list = $("#browse-list");
  list.innerHTML = "";
  cleanupListeners();
  loadHomeworkList(list);
});

$("#clear-filters-btn").addEventListener("click", () => {
  $("#filter-type").value = "";
  $("#filter-tags").value = "";
  const list = $("#browse-list");
  list.innerHTML = "";
  cleanupListeners();
  loadHomeworkList(list);
});

function cleanupListeners() {
  if (unsubHomework) { unsubHomework(); unsubHomework = null; }
}

// ── Browse UI Elements ───────────────────────
function browseItemEl(id, icon, name, meta, onClick) {
  const el = document.createElement("div");
  el.className = "browse-item";
  el.innerHTML = `
    <span class="item-icon">${icon}</span>
    <div class="item-info">
      <div class="item-name">${esc(name)}</div>
      <div class="item-meta">${esc(meta)}</div>
    </div>
    <span class="item-arrow">›</span>
  `;
  el.addEventListener("click", onClick);
  return el;
}

function homeworkCardEl(hw) {
  const card = document.createElement("div");
  card.className = "homework-card";

  const tagsHTML = (hw.tags || []).map(t => `<span class="tag">${esc(t)}</span>`).join("");

  const linksHTML = (hw.files || []).map((link, i) => {
    const fileId = extractDriveId(link);
    const previewUrl  = fileId ? `https://drive.google.com/file/d/${fileId}/preview` : link;
    const downloadUrl = fileId ? `https://drive.google.com/uc?id=${fileId}&export=download` : link;
    return `
      <div class="homework-link-row">
        <span>📄 Page ${i + 1}</span>
        <div class="link-actions">
          <a href="${esc(previewUrl)}" target="_blank" class="link-preview">Preview</a>
          <a href="${esc(downloadUrl)}" target="_blank" class="link-download">Download</a>
        </div>
      </div>
      <div class="homework-iframe-container">
        <iframe src="${esc(previewUrl)}" allow="autoplay" allowfullscreen></iframe>
      </div>
    `;
  }).join("");

  card.innerHTML = `
    <div class="homework-card-header">
      <div class="homework-card-title">${esc(hw.name)}</div>
      <span class="homework-type-badge ${hw.type || 'exercise'}">${esc(hw.type || 'exercise')}</span>
    </div>
    ${hw.description ? `<div class="homework-desc">${esc(hw.description)}</div>` : ""}
    ${tagsHTML ? `<div class="homework-tags">${tagsHTML}</div>` : ""}
    <div class="homework-links">${linksHTML || '<div class="item-meta">No files attached</div>'}</div>
  `;
  return card;
}

function emptyHTML(msg) {
  return `<div class="empty-state"><div class="empty-icon">📭</div><p>${esc(msg)}</p></div>`;
}

// ══════════════════════════════════════════════
//  ADMIN: SUBJECTS
// ══════════════════════════════════════════════

async function loadAdminSubjects() {
  const list = $("#subjects-list");
  list.innerHTML = "";
  try {
    const snap = await db.collection("subjects").get();
    if (snap.empty) { list.innerHTML = emptyHTML("No subjects yet. Add one!"); return; }
    const docs = snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (a.name || "").localeCompare(b.name || ""));
    docs.forEach(item => {
      list.appendChild(adminItemEl(item.name, "", item.id, "subject"));
    });
  } catch (err) {
    toast("Error loading subjects", "error");
  }
}

$("#add-subject-btn").addEventListener("click", () => {
  $("#subject-modal-title").textContent = "Add Subject";
  $("#subject-form").reset();
  $("#subject-id").value = "";
  show($("#subject-modal"));
});

$("#subject-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const id   = $("#subject-id").value;
  const name = $("#subject-name").value.trim();
  if (!name) return;

  try {
    if (id) {
      await db.collection("subjects").doc(id).update({ name });
      toast("Subject updated!", "success");
    } else {
      await db.collection("subjects").add({ name });
      toast("Subject added!", "success");
    }
    hide($("#subject-modal"));
    loadAdminSubjects();
    loadAllCaches();
  } catch (err) {
    toast(err.message, "error");
  }
});

// ══════════════════════════════════════════════
//  ADMIN: UNITS
// ══════════════════════════════════════════════

async function loadAdminUnits() {
  const list = $("#units-list");
  list.innerHTML = "";
  try {
    const snap = await db.collection("units").get();
    if (snap.empty) { list.innerHTML = emptyHTML("No units yet. Add one!"); return; }
    const docs = snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (a.name || "").localeCompare(b.name || ""));
    docs.forEach(item => {
      const subj = allSubjects.find(s => s.id === item.subjectId);
      list.appendChild(adminItemEl(item.name, subj ? subj.name : "—", item.id, "unit"));
    });
  } catch (err) {
    toast("Error loading units", "error");
  }
}

$("#add-unit-btn").addEventListener("click", () => {
  $("#unit-modal-title").textContent = "Add Unit";
  $("#unit-form").reset();
  $("#unit-id").value = "";
  populateSelect($("#unit-subject-select"), allSubjects);
  show($("#unit-modal"));
});

$("#unit-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const id        = $("#unit-id").value;
  const subjectId = $("#unit-subject-select").value;
  const name      = $("#unit-name").value.trim();
  if (!name || !subjectId) return;

  try {
    if (id) {
      await db.collection("units").doc(id).update({ name, subjectId });
      toast("Unit updated!", "success");
    } else {
      await db.collection("units").add({ name, subjectId });
      toast("Unit added!", "success");
    }
    hide($("#unit-modal"));
    loadAdminUnits();
    loadAllCaches();
  } catch (err) {
    toast(err.message, "error");
  }
});

// ══════════════════════════════════════════════
//  ADMIN: CHAPTERS
// ══════════════════════════════════════════════

async function loadAdminChapters() {
  const list = $("#chapters-list");
  list.innerHTML = "";
  try {
    const snap = await db.collection("chapters").get();
    if (snap.empty) { list.innerHTML = emptyHTML("No chapters yet. Add one!"); return; }
    const docs = snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (a.name || "").localeCompare(b.name || ""));
    docs.forEach(item => {
      const unit = allUnits.find(u => u.id === item.unitId);
      list.appendChild(adminItemEl(item.name, unit ? unit.name : "—", item.id, "chapter"));
    });
  } catch (err) {
    toast("Error loading chapters", "error");
  }
}

$("#add-chapter-btn").addEventListener("click", () => {
  $("#chapter-modal-title").textContent = "Add Chapter";
  $("#chapter-form").reset();
  $("#chapter-id").value = "";
  populateSelect($("#chapter-subject-select"), allSubjects);
  $("#chapter-unit-select").innerHTML = '<option value="">Select a subject first</option>';
  show($("#chapter-modal"));
});

// Cascade: subject → units
$("#chapter-subject-select").addEventListener("change", () => {
  const subjectId = $("#chapter-subject-select").value;
  const filtered = allUnits.filter(u => u.subjectId === subjectId);
  populateSelect($("#chapter-unit-select"), filtered);
});

$("#chapter-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const id     = $("#chapter-id").value;
  const unitId = $("#chapter-unit-select").value;
  const name   = $("#chapter-name").value.trim();
  if (!name || !unitId) return;

  try {
    if (id) {
      await db.collection("chapters").doc(id).update({ name, unitId });
      toast("Chapter updated!", "success");
    } else {
      await db.collection("chapters").add({ name, unitId });
      toast("Chapter added!", "success");
    }
    hide($("#chapter-modal"));
    loadAdminChapters();
    loadAllCaches();
  } catch (err) {
    toast(err.message, "error");
  }
});

// ══════════════════════════════════════════════
//  ADMIN: HOMEWORK
// ══════════════════════════════════════════════

async function loadAdminHomework() {
  const list = $("#homeworks-admin-list");
  list.innerHTML = "";
  try {
    const snap = await db.collection("homeworks").get();
    if (snap.empty) { list.innerHTML = emptyHTML("No homework yet. Add one!"); return; }
    const docs = snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => {
      const ta = a.createdAt ? a.createdAt.toMillis() : 0;
      const tb = b.createdAt ? b.createdAt.toMillis() : 0;
      return tb - ta; // newest first
    });
    docs.forEach(item => {
      const chap = allChapters.find(c => c.id === item.chapterId);
      const meta = `${chap ? chap.name : "—"} · ${item.type || "exercise"} · ${(item.files || []).length} link(s)`;
      list.appendChild(adminItemEl(item.name, meta, item.id, "homework"));
    });
  } catch (err) {
    toast("Error loading homework", "error");
  }
}

$("#add-homework-btn").addEventListener("click", () => {
  $("#homework-modal-title").textContent = "Add Homework";
  $("#homework-form").reset();
  $("#homework-id").value = "";
  populateSelect($("#hw-subject-select"), allSubjects);
  $("#hw-unit-select").innerHTML = '<option value="">Select subject first</option>';
  $("#hw-chapter-select").innerHTML = '<option value="">Select unit first</option>';
  resetLinkInputs();
  show($("#homework-modal"));
});

// Cascading selects for homework modal
$("#hw-subject-select").addEventListener("change", () => {
  const subjectId = $("#hw-subject-select").value;
  const filtered = allUnits.filter(u => u.subjectId === subjectId);
  populateSelect($("#hw-unit-select"), filtered);
  $("#hw-chapter-select").innerHTML = '<option value="">Select unit first</option>';
});

$("#hw-unit-select").addEventListener("change", () => {
  const unitId = $("#hw-unit-select").value;
  const filtered = allChapters.filter(c => c.unitId === unitId);
  populateSelect($("#hw-chapter-select"), filtered);
});

// Multiple link inputs
$("#add-link-btn").addEventListener("click", () => addLinkInput());

function addLinkInput(value = "") {
  const container = $("#hw-links-container");
  const row = document.createElement("div");
  row.className = "link-input-row";
  row.innerHTML = `
    <input type="url" class="hw-link-input" placeholder="https://drive.google.com/file/d/…" value="${esc(value)}" />
    <button type="button" class="btn btn-ghost btn-icon-sm remove-link-btn" title="Remove">✕</button>
  `;
  row.querySelector(".remove-link-btn").addEventListener("click", () => {
    if (container.children.length > 1) row.remove();
  });
  container.appendChild(row);
}

function resetLinkInputs() {
  const container = $("#hw-links-container");
  container.innerHTML = "";
  addLinkInput();
}

function getLinkValues() {
  return Array.from($$(".hw-link-input")).map(inp => inp.value.trim()).filter(Boolean);
}

// Remove link button for existing first row
document.addEventListener("click", (e) => {
  if (e.target.classList.contains("remove-link-btn")) {
    const container = $("#hw-links-container");
    if (container.children.length > 1) {
      e.target.closest(".link-input-row").remove();
    }
  }
});

// Homework form submit
$("#homework-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const id        = $("#homework-id").value;
  const chapterId = $("#hw-chapter-select").value;
  const name      = $("#hw-name").value.trim();
  const type      = $("#hw-type").value;
  const desc      = $("#hw-description").value.trim();
  const tags      = $("#hw-tags").value.split(",").map(t => t.trim()).filter(Boolean);
  const files     = getLinkValues();

  if (!name || !chapterId) {
    toast("Please fill in all required fields", "warning");
    return;
  }

  const data = {
    name,
    chapterId,
    type,
    description: desc,
    tags,
    files,
    createdBy: currentUser.email,
    createdAt: firebase.firestore.FieldValue.serverTimestamp()
  };

  try {
    if (id) {
      await db.collection("homeworks").doc(id).update(data);
      toast("Homework updated!", "success");
    } else {
      await db.collection("homeworks").add(data);
      toast("Homework added!", "success");
    }
    hide($("#homework-modal"));
    loadAdminHomework();
  } catch (err) {
    toast(err.message, "error");
  }
});

// ══════════════════════════════════════════════
//  ADMIN: EDIT / DELETE SHARED
// ══════════════════════════════════════════════

function adminItemEl(name, meta, docId, type) {
  const el = document.createElement("div");
  el.className = "admin-item";
  el.innerHTML = `
    <div class="admin-item-info">
      <div class="admin-item-name">${esc(name)}</div>
      ${meta ? `<div class="admin-item-meta">${esc(meta)}</div>` : ""}
    </div>
    <div class="admin-item-actions">
      <button class="btn btn-secondary btn-sm admin-edit-btn" data-id="${docId}" data-type="${type}">Edit</button>
      <button class="btn btn-danger btn-sm admin-delete-btn" data-id="${docId}" data-type="${type}">Delete</button>
    </div>
  `;
  el.querySelector(".admin-edit-btn").addEventListener("click", () => editItem(docId, type));
  el.querySelector(".admin-delete-btn").addEventListener("click", () => deleteItem(docId, type));
  return el;
}

async function editItem(docId, type) {
  try {
    if (type === "subject") {
      const doc = await db.collection("subjects").doc(docId).get();
      const d = doc.data();
      $("#subject-modal-title").textContent = "Edit Subject";
      $("#subject-id").value = docId;
      $("#subject-name").value = d.name;
      show($("#subject-modal"));

    } else if (type === "unit") {
      const doc = await db.collection("units").doc(docId).get();
      const d = doc.data();
      $("#unit-modal-title").textContent = "Edit Unit";
      $("#unit-id").value = docId;
      populateSelect($("#unit-subject-select"), allSubjects, d.subjectId);
      $("#unit-name").value = d.name;
      show($("#unit-modal"));

    } else if (type === "chapter") {
      const doc = await db.collection("chapters").doc(docId).get();
      const d = doc.data();
      const unit = allUnits.find(u => u.id === d.unitId);
      const subjectId = unit ? unit.subjectId : "";
      $("#chapter-modal-title").textContent = "Edit Chapter";
      $("#chapter-id").value = docId;
      populateSelect($("#chapter-subject-select"), allSubjects, subjectId);
      const filteredUnits = allUnits.filter(u => u.subjectId === subjectId);
      populateSelect($("#chapter-unit-select"), filteredUnits, d.unitId);
      $("#chapter-name").value = d.name;
      show($("#chapter-modal"));

    } else if (type === "homework") {
      const doc = await db.collection("homeworks").doc(docId).get();
      const d = doc.data();
      const chap = allChapters.find(c => c.id === d.chapterId);
      const unit = chap ? allUnits.find(u => u.id === chap.unitId) : null;
      const subjectId = unit ? unit.subjectId : "";
      const unitId = chap ? chap.unitId : "";

      $("#homework-modal-title").textContent = "Edit Homework";
      $("#homework-id").value = docId;

      populateSelect($("#hw-subject-select"), allSubjects, subjectId);
      const filteredUnits = allUnits.filter(u => u.subjectId === subjectId);
      populateSelect($("#hw-unit-select"), filteredUnits, unitId);
      const filteredChapters = allChapters.filter(c => c.unitId === unitId);
      populateSelect($("#hw-chapter-select"), filteredChapters, d.chapterId);

      $("#hw-name").value       = d.name || "";
      $("#hw-type").value       = d.type || "exercise";
      $("#hw-description").value = d.description || "";
      $("#hw-tags").value       = (d.tags || []).join(", ");

      // Populate link inputs
      const container = $("#hw-links-container");
      container.innerHTML = "";
      if (d.files && d.files.length > 0) {
        d.files.forEach(link => addLinkInput(link));
      } else {
        addLinkInput();
      }

      show($("#homework-modal"));
    }
  } catch (err) {
    toast("Error loading item", "error");
  }
}

async function deleteItem(docId, type) {
  if (!confirm(`Delete this ${type}? This cannot be undone.`)) return;
  const collectionName = type === "homework" ? "homeworks" : type + "s";
  try {
    await db.collection(collectionName).doc(docId).delete();
    toast(`${type.charAt(0).toUpperCase() + type.slice(1)} deleted!`, "success");
    // Reload the appropriate admin list
    if (type === "subject") loadAdminSubjects();
    else if (type === "unit") loadAdminUnits();
    else if (type === "chapter") loadAdminChapters();
    else if (type === "homework") loadAdminHomework();
    loadAllCaches();
  } catch (err) {
    toast(err.message, "error");
  }
}

// ══════════════════════════════════════════════
//  MODAL CLOSE
// ══════════════════════════════════════════════

$$(".modal-close").forEach(btn => {
  btn.addEventListener("click", () => {
    const modalId = btn.dataset.modal;
    hide($(`#${modalId}`));
  });
});

// Close modal on overlay click
$$(".modal-overlay").forEach(overlay => {
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) hide(overlay);
  });
});

// ══════════════════════════════════════════════
//  HELPERS
// ══════════════════════════════════════════════

function populateSelect(selectEl, items, selectedId = "") {
  selectEl.innerHTML = '<option value="">— Select —</option>';
  items.forEach(item => {
    const opt = document.createElement("option");
    opt.value = item.id;
    opt.textContent = item.name;
    if (item.id === selectedId) opt.selected = true;
    selectEl.appendChild(opt);
  });
}

function extractDriveId(url) {
  if (!url) return null;
  // Match /file/d/ID or id=ID
  const match = url.match(/\/file\/d\/([a-zA-Z0-9_-]+)/) || url.match(/id=([a-zA-Z0-9_-]+)/);
  return match ? match[1] : null;
}

function esc(str) {
  if (!str) return "";
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}
