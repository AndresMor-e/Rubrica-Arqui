// ── CONFIGURACIÓN ──
const API_BASE_URL = 'http://localhost:3000/api/rest/v1';
const ADMIN = "admin";

// ── FUNCIÓN SB ──
const sb = async (path, opts = {}) => {
  const method = (opts.method || "GET").toUpperCase();
  let url = `${API_BASE_URL}/${path}`;
  
  const options = {
    method,
    headers: { "Content-Type": "application/json" },
    ...opts
  };
  
  if (opts.body) options.body = opts.body;
  
  try {
    const response = await fetch(url, options);
    if (response.status === 204) {
      return { ok: true, status: 204, json: async () => ({}) };
    }
    const data = await response.json();
    return { ok: response.ok, status: response.status, json: async () => data };
  } catch (error) {
    console.error("Error en sb:", error);
    return { ok: false, status: 500, json: async () => ({ error: error.message }) };
  }
};

// ========== AGREGAR SUPABASE REALTIME AQUÍ ==========
// ── SUPABASE REALTIME (CAMBIOS INSTANTÁNEOS) ──
let supabaseRealtime = null;

function initRealtime() {
  if (!usuarioActual) return;
  
  // Crear cliente de Supabase para realtime
  const supabaseClient = supabase.createClient(
    'https://tzalcntdwgxzgqiqytug.supabase.co',
    'sb_publishable_7pnkUiErTGUH5PP7ukio2g_DObLdpCS'
  );
  
  // Suscribirse a cambios en mensajes
  supabaseRealtime = supabaseClient
    .channel('nova-talk')
    .on('postgres_changes', 
      { event: '*', schema: 'public', table: 'mensajes' },
      (payload) => {
        console.log("🔄 Cambio detectado en mensajes:", payload.eventType);
        cargarMensajes();
        cargarUltimosMsg();
        renderSidebar();
      }
    )
    .on('postgres_changes',
      { event: '*', schema: 'public', table: 'usuarios' },
      (payload) => {
        console.log("🔄 Cambio detectado en usuarios:", payload.eventType);
        cargarUsuarios();
      }
    )
    .subscribe();
}

// ========== MODIFICAR FUNCIONES EXISTENTES ==========
// Guardar funciones originales
const originalLogin = login;
const originalCerrarSesion = cerrarSesion;

// Mejorar login para iniciar realtime
login = async function() {
  await originalLogin();
  initRealtime();
};

// Mejorar cerrarSesion para limpiar realtime
cerrarSesion = function() {
  if (supabaseRealtime) {
    supabaseRealtime.unsubscribe();
    supabaseRealtime = null;
  }
  originalCerrarSesion();
};



let usuarioActual = "";
let chatActual = null;
let ultimoHash = "";
let estaAlFondo = true;
let todosLosUsuarios = [];
let usuariosEnLinea = new Set();
let lastMsgCache = {};

// ── SPLASH SCREEN ──
function mostrarSplash() {
  const splash = document.getElementById("splash-screen");
  const login = document.getElementById("login-screen");
  if (!splash) { login.style.display = "flex"; return; }
  splash.style.display = "flex";
  login.style.display = "none";
  const bar = splash.querySelector(".splash-bar-fill");
  const perc = splash.querySelector(".splash-perc");
  let p = 0;
  const interval = setInterval(() => {
    p += Math.random() * 18 + 4;
    if (p >= 100) { p = 100; clearInterval(interval); }
    bar.style.width = p + "%";
    if (perc) perc.textContent = Math.floor(p) + "%";
    if (p >= 100) {
      setTimeout(() => {
        splash.classList.add("splash-fade-out");
        setTimeout(() => {
          splash.style.display = "none";
          login.style.display = "flex";
        }, 1500);
      }, 1000);
    }
  }, 80);
}

// ── TOAST ──
function toast(msg, type = "info") {
  const t = document.createElement("div");
  t.className = `toast ${type}`;
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 3000);
}

// ── MODAL MEJORADO ──
function confirmar(titulo, desc, onOk, onCancel = null) {
  // Crear overlay
  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";
  
  // Crear contenido del modal mejorado
  overlay.innerHTML = `
    <div class="modal-box">
      <div class="modal-title">${titulo}</div>
      <div class="modal-desc">${desc}</div>
      <div class="modal-actions">
        <button class="btn-modal-cancel" id="mc">Cancelar</button>
        <button class="btn-modal-confirm" id="mo">Eliminar</button>
      </div>
    </div>`;
  
  document.body.appendChild(overlay);
  
  // Eventos
  const cancelBtn = overlay.querySelector("#mc");
  const confirmBtn = overlay.querySelector("#mo");
  
  cancelBtn.onclick = () => {
    overlay.remove();
    if (onCancel) onCancel();
  };
  
  confirmBtn.onclick = () => {
    overlay.remove();
    if (onOk) onOk();
  };
  
  // Cerrar al hacer clic fuera
  overlay.onclick = (e) => {
    if (e.target === overlay) {
      overlay.remove();
      if (onCancel) onCancel();
    }
  };
  
  // Cerrar con tecla ESC
  const escHandler = (e) => {
    if (e.key === 'Escape') {
      overlay.remove();
      document.removeEventListener('keydown', escHandler);
      if (onCancel) onCancel();
    }
  };
  document.addEventListener('keydown', escHandler);
}

// ── LOGIN ──
async function login() {
  const username = document.getElementById("user").value.trim();
  const password = document.getElementById("pass").value;
  if (!username || !password) return toast("Completa los campos", "error");
  
  const res = await sb(`usuarios?username=eq.${encodeURIComponent(username)}`);
  const data = await res.json();
  const user = Array.isArray(data) ? data.find(u => u.username === username && u.password === password) : null;
  
  if (!user) return toast("Credenciales incorrectas", "error");
  
  usuarioActual = username;
  document.getElementById("usuario-label").innerText = username;
  document.getElementById("avatar-letter").innerText = username[0].toUpperCase();
  document.getElementById("admin-badge-el").style.display = username === ADMIN ? "inline-block" : "none";
  document.getElementById("login-screen").style.display = "none";
  document.getElementById("app").style.display = "flex";
  toast("¡Bienvenido, " + username + "!", "success");
  
  await cargarUsuarios();
  abrirChat(null, null);
}

// ── REGISTRO ──
async function registro() {
  const username = document.getElementById("user").value.trim();
  const password = document.getElementById("pass").value;
  if (!username || !password) return toast("Completa los campos", "error");
  const res = await sb("usuarios", { method: "POST", body: JSON.stringify({ username, password }) });
  if (res.ok) toast("¡Cuenta creada! Ahora inicia sesión.", "success");
  else toast("Usuario ya existe", "error");
}

// ── ONLINE ──
async function actualizarOnline() {
  const res = await sb("usuarios");
  const data = await res.json();
  if (!Array.isArray(data)) return;
  usuariosEnLinea.clear();
  usuariosEnLinea.add(usuarioActual);
  const badge = document.getElementById("online-count");
  if (badge) badge.textContent = usuariosEnLinea.size + " en línea";
  actualizarAvatarsOnline();
}

function actualizarAvatarsOnline() {
  document.querySelectorAll(".conv-item[data-user]").forEach(item => {
    const u = item.dataset.user;
    const av = item.querySelector(".conv-avatar");
    if (!av) return;
    if (usuariosEnLinea.has(u)) av.classList.add("conv-avatar-online");
    else av.classList.remove("conv-avatar-online");
  });
}

// ── CARGAR ÚLTIMOS MENSAJES ──
async function cargarUltimosMsg() {
  try {
    const rGlobal = await sb("mensajes?para=is.null&order=created_at.desc&limit=1");
    const dGlobal = await rGlobal.json();
    lastMsgCache["__global__"] = Array.isArray(dGlobal) && dGlobal[0] ? dGlobal[0] : null;
    
    for (const u of todosLosUsuarios) {
      const r = await sb(`mensajes/directos/${usuarioActual}/${u}`);
      const d = await r.json();
      if (Array.isArray(d) && d.length > 0) {
        lastMsgCache[u] = d[d.length - 1];
      } else {
        lastMsgCache[u] = null;
      }
    }
  } catch (error) {
    console.error("Error en cargarUltimosMsg:", error);
  }
}

// ── CARGAR USUARIOS ──
async function cargarUsuarios() {
  try {
    const response = await fetch(`${API_BASE_URL}/usuarios?order=username.asc`);
    const data = await response.json();
    if (!Array.isArray(data)) return;
    todosLosUsuarios = data.map(u => u.username).filter(u => u !== usuarioActual);
    await cargarUltimosMsg();
    renderSidebar();
    await actualizarOnline();
  } catch (error) {
    console.error("Error en cargarUsuarios:", error);
  }
}

function formatPreviewTime(isoStr) {
  if (!isoStr) return "";
  const d = new Date(isoStr);
  const now = new Date();
  const diffMs = now - d;
  const diffMin = Math.floor(diffMs / 60000);
  const diffH = Math.floor(diffMs / 3600000);
  const diffD = Math.floor(diffMs / 86400000);
  if (diffMin < 1) return "ahora";
  if (diffMin < 60) return diffMin + "m";
  if (diffH < 24) return d.toLocaleTimeString("es", { hour: "2-digit", minute: "2-digit" });
  if (diffD === 1) return "Ayer";
  const dias = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
  if (diffD < 7) return dias[d.getDay()];
  return d.toLocaleDateString("es", { day: "2-digit", month: "2-digit" });
}

function formatPreviewMsg(msg) {
  if (!msg) return "Sin mensajes aún";
  const m = msg.mensaje || "";
  return m.length > 32 ? m.slice(0, 32) + "…" : m;
}

function renderSidebar() {
  const canalesList = document.getElementById("canales-list");
  const globalLast = lastMsgCache["__global__"];
  canalesList.innerHTML = `
    <div class="conv-item" id="global-btn" onclick="abrirChat(null, this)">
      <div class="conv-avatar">🌍</div>
      <div class="conv-body">
        <div class="conv-top">
          <span class="conv-name">Chat Global</span>
          ${globalLast ? `<span class="conv-time">${formatPreviewTime(globalLast.created_at)}</span>` : ""}
        </div>
        <div class="conv-preview">${globalLast ? globalLast.de + ": " + formatPreviewMsg(globalLast) : "Sin mensajes aún"}</div>
      </div>
    </div>`;
  
  const directosList = document.getElementById("directos-list");
  directosList.innerHTML = "";
  const esAdmin = usuarioActual === ADMIN;
  
  todosLosUsuarios.forEach(u => {
    const last = lastMsgCache[u];
    const isOnline = usuariosEnLinea.has(u);
    const initial = u[0].toUpperCase();
    const div = document.createElement("div");
    div.className = "conv-item";
    div.dataset.user = u;
    div.onclick = (e) => {
      if (e.target.closest('.btn-del-user')) return;
      abrirChat(u, div);
    };
    div.innerHTML = `
      <div class="conv-avatar ${isOnline ? "conv-avatar-online" : ""}">${initial}</div>
      <div class="conv-body">
        <div class="conv-top">
          <span class="conv-name">${escapeHtml(u)}</span>
          ${last ? `<span class="conv-time">${formatPreviewTime(last.created_at)}</span>` : ""}
        </div>
        <div class="conv-preview">${last ? (last.de === usuarioActual ? "Tú: " : "") + formatPreviewMsg(last) : "Sin mensajes aún"}</div>
      </div>
      ${esAdmin ? `<button class="btn-del-user" onclick="eliminarUsuario('${escapeHtml(u)}', event)" title="Eliminar usuario">✕</button>` : ""}`;
    directosList.appendChild(div);
  });
  
  if (chatActual === null) {
    document.getElementById("global-btn")?.classList.add("activo");
  } else {
    document.querySelector(`.conv-item[data-user="${chatActual}"]`)?.classList.add("activo");
  }
}

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/[&<>]/g, function(m) {
    if (m === '&') return '&amp;';
    if (m === '<') return '&lt;';
    if (m === '>') return '&gt;';
    return m;
  });
}

function abrirChat(usuario, el) {
  chatActual = usuario;
  ultimoHash = "";
  document.querySelectorAll(".conv-item").forEach(i => i.classList.remove("activo"));
  if (el) el.classList.add("activo");
  const nombre = usuario || "Chat Global";
  const icono = usuario ? usuario[0].toUpperCase() : "🌍";
  const status = usuario ? (usuariosEnLinea.has(usuario) ? "● En línea" : "○ Desconectado") : "● Canal público";
  document.getElementById("chat-nombre").textContent = nombre;
  document.getElementById("chat-icon").textContent = icono;
  document.getElementById("chat-status").textContent = status;
  document.getElementById("participants-panel")?.classList.remove("open");
  document.getElementById("emoji-picker")?.classList.remove("open");
  document.getElementById("mensaje").value = "";
  cargarMensajes();
  cargarParticipantes();
}

function toggleParticipants() {
  document.getElementById("participants-panel")?.classList.toggle("open");
  document.getElementById("emoji-picker")?.classList.remove("open");
}

async function cargarParticipantes() {
  const lista = document.getElementById("participants-list");
  if (!lista) return;
  lista.innerHTML = "";
  const usuarios = chatActual ? [chatActual, usuarioActual] : [usuarioActual, ...todosLosUsuarios];
  usuarios.forEach(u => {
    const isOnline = usuariosEnLinea.has(u);
    const div = document.createElement("div");
    div.className = "participant-item";
    div.innerHTML = `
      <div class="participant-avatar ${isOnline ? "p-online" : ""}">${u[0].toUpperCase()}</div>
      <div class="participant-info">
        <div class="participant-name">${u}${u === usuarioActual ? " (tú)" : ""}</div>
        <div class="participant-status">${isOnline ? "● En línea" : "○ Desconectado"}</div>
      </div>`;
    lista.appendChild(div);
  });
}

function hashMensajes(data) {
  return data.map(m => m.id + m.mensaje).join("|");
}

function renderMensajes(data) {
  const cont = document.getElementById("mensajes");
  const distanciaAlFondo = cont.scrollHeight - cont.scrollTop - cont.clientHeight;
  estaAlFondo = distanciaAlFondo < 60;
  cont.innerHTML = "";
  let lastDate = "";
  data.forEach(m => {
    const fecha = new Date(m.created_at);
    const dateKey = fecha.toLocaleDateString("es");
    if (dateKey !== lastDate) {
      lastDate = dateKey;
      const hoy = new Date().toLocaleDateString("es");
      const label = dateKey === hoy ? "Hoy" : fecha.toLocaleDateString("es", { weekday: "long", day: "numeric", month: "long" });
      const div = document.createElement("div");
      div.className = "date-divider";
      div.innerHTML = `<span>${label}</span>`;
      cont.appendChild(div);
    }
    const esMio = m.de === usuarioActual;
    const esAdmin = usuarioActual === ADMIN;
    const tipo = esMio ? "mio" : "otro";
    const hora = fecha.toLocaleTimeString("es", { hour: "2-digit", minute: "2-digit" });
    const puedeBorrar = esMio || esAdmin;
    const wrapper = document.createElement("div");
    wrapper.className = `mensaje-wrapper ${tipo}`;
    wrapper.dataset.id = m.id;
    wrapper.innerHTML = `
      ${puedeBorrar ? `<button class="btn-del-msg" onclick="eliminarMensaje('${m.id}')">✕</button>` : ""}
      ${!esMio ? `<div class="mensaje-sender">${escapeHtml(m.de)}</div>` : ""}
      <div class="mensaje-burbuja">${escapeHtml(m.mensaje)}</div>
      <div class="mensaje-time">${hora}</div>`;
    cont.appendChild(wrapper);
  });
  if (estaAlFondo) cont.scrollTop = cont.scrollHeight;
}

async function cargarMensajes() {
  try {
    let data = [];
    if (chatActual) {
      const res = await sb(`mensajes/directos/${usuarioActual}/${chatActual}`);
      data = await res.json();
    } else {
      const res = await sb("mensajes?para=is.null&order=created_at.asc");
      data = await res.json();
    }
    if (!Array.isArray(data)) return;
    const nuevoHash = hashMensajes(data);
    if (nuevoHash === ultimoHash) return;
    ultimoHash = nuevoHash;
    renderMensajes(data);
    await cargarUltimosMsg();
    renderSidebar();
  } catch (error) {
    console.error("Error en cargarMensajes:", error);
  }
}

async function enviar() {
  const texto = document.getElementById("mensaje").value.trim();
  if (!texto) return;
  document.getElementById("mensaje").value = "";
  estaAlFondo = true;
  await sb("mensajes", {
    method: "POST",
    body: JSON.stringify({ de: usuarioActual, para: chatActual || null, mensaje: texto })
  });
  ultimoHash = "";
  cargarMensajes();
}

async function eliminarMensaje(id) {
  confirmar("¿Eliminar mensaje?", "Esta acción no se puede deshacer.", async () => {
    const res = await sb(`mensajes?id=eq.${id}`, { method: "DELETE" });
    if (res.status === 204 || res.ok) {
      document.querySelector(`[data-id="${id}"]`)?.remove();
      ultimoHash = "";
      toast("Mensaje eliminado", "success");
    } else {
      toast("No se pudo eliminar", "error");
    }
  });
}

async function eliminarUsuario(username, event) {
  if (event) {
    event.stopPropagation();
    event.preventDefault();
  }
  
  if (usuarioActual !== ADMIN) {
    toast("Solo el admin puede hacer esto", "error");
    return;
  }
  
  // Usar el modal personalizado en lugar de confirm()
  confirmar(
    "Eliminar usuario", 
    `¿Estás seguro de que quieres eliminar a "${username}"?`, 
    async () => {
      // Este código se ejecuta cuando el usuario confirma
      try {
        const res = await sb(`usuarios?username=eq.${username}`, { method: "DELETE" });
        
        if (res.status === 204) {
          toast(`✅ Usuario "${username}" eliminado`, "success");
          delete lastMsgCache[username];
          
          if (chatActual === username) {
            chatActual = null;
            abrirChat(null, null);
          }
          
          await cargarUsuarios();
        } else {
          toast("No se pudo eliminar el usuario", "error");
        }
      } catch (error) {
        console.error("Error:", error);
        toast("Error al eliminar usuario", "error");
      }
    }
  );
}

function cerrarSesion() {
  usuarioActual = "";
  chatActual = null;
  document.getElementById("app").style.display = "none";
  document.getElementById("login-screen").style.display = "flex";
  document.getElementById("user").value = "";
  document.getElementById("pass").value = "";
  document.getElementById("mensajes").innerHTML = "";
  toast("Sesión cerrada", "info");
}

// ── EMOJIS ──
const EMOJI_DATA = {
  smileys: { label: "Caras", icon: "😊", emojis: [{ e: "😀", n: "feliz" }, { e: "😂", n: "carcajada" }, { e: "😊", n: "sonrisa" }, { e: "😍", n: "enamorado" }, { e: "😎", n: "genial" }, { e: "🥳", n: "fiesta" }] },
  gestures: { label: "Gestos", icon: "👍", emojis: [{ e: "👍", n: "bien" }, { e: "👎", n: "mal" }, { e: "👏", n: "aplausos" }, { e: "❤️", n: "corazón" }, { e: "🔥", n: "fuego" }, { e: "✨", n: "brillos" }] },
  animals: { label: "Animales", icon: "🐶", emojis: [{ e: "🐶", n: "perro" }, { e: "🐱", n: "gato" }, { e: "🐭", n: "ratón" }, { e: "🐻", n: "oso" }, { e: "🐼", n: "panda" }, { e: "🦄", n: "unicornio" }] },
  food: { label: "Comida", icon: "🍕", emojis: [{ e: "🍕", n: "pizza" }, { e: "🍔", n: "hamburguesa" }, { e: "🌮", n: "taco" }, { e: "🍜", n: "ramen" }, { e: "🍣", n: "sushi" }, { e: "🍫", n: "chocolate" }] },
  sports: { label: "Deportes", icon: "⚽", emojis: [{ e: "⚽", n: "fútbol" }, { e: "🏀", n: "baloncesto" }, { e: "🎮", n: "videojuego" }, { e: "🎵", n: "música" }, { e: "🎨", n: "arte" }, { e: "🎬", n: "cine" }] },
  travel: { label: "Lugares", icon: "🚀", emojis: [{ e: "🚀", n: "cohete" }, { e: "🌍", n: "tierra" }, { e: "🌈", n: "arcoíris" }, { e: "⭐", n: "estrella" }, { e: "☀️", n: "sol" }, { e: "🌙", n: "luna" }] }
};

const CAT_KEYS = Object.keys(EMOJI_DATA);
let activeCat = CAT_KEYS[0];
let emojiSearchTimeout = null;

function initEmojiPicker() {
  const catsEl = document.getElementById("emoji-cats");
  const search = document.getElementById("emoji-search");
  CAT_KEYS.forEach((key, i) => {
    const cat = EMOJI_DATA[key];
    const btn = document.createElement("button");
    btn.className = "emoji-cat-btn" + (i === 0 ? " active" : "");
    btn.innerHTML = `<span class="emoji-cat-icon">${cat.icon}</span><span class="emoji-cat-label">${cat.label}</span>`;
    btn.onclick = () => {
      activeCat = key;
      catsEl.querySelectorAll(".emoji-cat-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      search.value = "";
      renderEmojiGrid();
    };
    catsEl.appendChild(btn);
  });
  search.oninput = () => {
    clearTimeout(emojiSearchTimeout);
    emojiSearchTimeout = setTimeout(() => {
      const q = search.value.toLowerCase().trim();
      if (!q) { renderEmojiGrid(); return; }
      const todos = CAT_KEYS.flatMap(k => EMOJI_DATA[k].emojis).filter(item => item.n.includes(q) || item.e.includes(q));
      renderEmojiGrid(todos);
    }, 150);
  };
  renderEmojiGrid();
}

function renderEmojiGrid(lista) {
  const grid = document.getElementById("emoji-grid");
  grid.innerHTML = "";
  const emojis = lista || EMOJI_DATA[activeCat].emojis;
  emojis.forEach(item => {
    const btn = document.createElement("button");
    btn.className = "emoji-btn";
    btn.innerHTML = `<span class="emoji-glyph">${item.e}</span><span class="emoji-name">${item.n}</span>`;
    btn.onclick = () => insertarEmoji(item.e);
    grid.appendChild(btn);
  });
}

function insertarEmoji(emoji) {
  const input = document.getElementById("mensaje");
  const pos = input.selectionStart;
  const val = input.value;
  input.value = val.slice(0, pos) + emoji + val.slice(pos);
  input.focus();
  input.selectionStart = input.selectionEnd = pos + emoji.length;
  document.getElementById("emoji-picker").classList.remove("open");
}

function toggleEmoji() {
  const picker = document.getElementById("emoji-picker");
  picker.classList.toggle("open");
  document.getElementById("participants-panel")?.classList.remove("open");
}

document.addEventListener("click", e => {
  const picker = document.getElementById("emoji-picker");
  const btnEmoji = document.getElementById("btn-emoji");
  const panel = document.getElementById("participants-panel");
  if (picker && !picker.contains(e.target) && e.target !== btnEmoji) picker.classList.remove("open");
  if (panel && !panel.contains(e.target)) panel.classList.remove("open");
});

document.getElementById("mensaje").addEventListener("keypress", e => { if (e.key === "Enter") enviar(); });

initEmojiPicker();
mostrarSplash();

setInterval(() => { if (usuarioActual) cargarMensajes(); }, 3000);
setInterval(() => { if (usuarioActual) actualizarOnline(); }, 8000);