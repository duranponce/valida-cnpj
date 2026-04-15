(function () {
  "use strict";

  // =========================================================================
  // Constantes
  // =========================================================================
  const VIACEP_BASE      = "https://viacep.com.br/ws/";
  const STORAGE_SALVAS   = "consultasSalvas_v1";   // fallback legado
  const STORAGE_SETTINGS = "appSettings_v1";

  let lastConsult = null;         // { cnpj14, data, enderecoRow }
  let currentPinned = false;      // estado do pin da consulta atual

  // =========================================================================
  // Labels PT-BR para chaves da API / ViaCEP
  // =========================================================================
  const LABELS_PT = {
    abertura: "Data de abertura",
    atividade_principal: "Atividade principal",
    atividades_secundarias: "Atividades secundárias",
    bairro: "Bairro",
    billing: "Faturamento",
    capital_social: "Capital social (R$)",
    cep: "CEP",
    cnpj: "CNPJ",
    cnpj_cpf_do_socio: "CPF/CNPJ do sócio",
    cnpj_cpf_socio: "CPF/CNPJ do sócio",
    code: "Código",
    complemento: "Complemento",
    data_consulta: "Data da consulta",
    data_situacao: "Data da situação cadastral",
    data_situacao_especial: "Data da situação especial",
    descricao_situacao_cadastral: "Descrição da situação cadastral",
    ddd: "DDD",
    ddd_fax: "DDD do fax",
    ddd_telefone_1: "DDD / Telefone 1",
    ddd_telefone_2: "DDD / Telefone 2",
    email: "E-mail",
    ente_federativo_responsavel: "Ente federativo responsável",
    efr: "Ente federativo responsável",
    extra: "Informações adicionais",
    fantasia: "Nome fantasia",
    faixa_etaria: "Faixa etária",
    gia: "GIA",
    ibge: "Código IBGE",
    localidade: "Cidade",
    logradouro: "Logradouro",
    motivo_situacao: "Motivo da situação",
    municipio: "Município",
    natureza_juridica: "Natureza jurídica",
    nome: "Razão social / nome",
    nome_rep_legal: "Representante legal",
    numero: "Número",
    pais: "País",
    pais_origem: "País de origem",
    porte: "Porte da empresa",
    qual: "Qualificação",
    qual_rep_legal: "Qualificação do representante",
    qsa: "Quadro societário",
    siafi: "Código SIAFI",
    situacao: "Situação cadastral",
    situacao_cadastral: "Situação cadastral",
    situacao_especial: "Situação especial",
    status: "Status na consulta",
    telefone: "Telefone",
    text: "Descrição",
    tipo: "Tipo de atividade",
    uf: "UF",
    ultima_atualizacao: "Última atualização",
    cnpj_matriz: "CNPJ da matriz",
    data_opcao_pelo_mei: "Data de opção pelo MEI",
    data_exclusao_do_mei: "Data de exclusão do MEI",
    opcao_pelo_mei: "Opção pelo MEI",
    situacao_especial_descricao: "Descrição da situação especial",
  };

  function tituloCampoPt(chave) {
    if (!chave) return "";
    if (LABELS_PT[chave]) return LABELS_PT[chave];
    const last = String(chave).split(".").pop();
    if (LABELS_PT[last]) return LABELS_PT[last];
    const joined = String(chave).replace(/\./g, "_");
    if (LABELS_PT[joined]) return LABELS_PT[joined];
    return last.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
  }

  function formatValorCampo(chave, val) {
    if (val === null || val === undefined) return "";
    const s = String(val).trim();
    const lastKey = (chave || "").split(".").pop();
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
      const p = s.split("-");
      return `${p[2]}/${p[1]}/${p[0]}`;
    }
    if (lastKey === "capital_social" || lastKey === "valor") {
      const n = parseFloat(String(val).replace(/\s/g, "").replace(",", "."));
      if (!isNaN(n)) return n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }
    return s;
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function formatCnpj(digits) {
    if (!digits || digits.length !== 14) return digits || "";
    return `${digits.slice(0,2)}.${digits.slice(2,5)}.${digits.slice(5,8)}/${digits.slice(8,12)}-${digits.slice(12)}`;
  }

  function formatBytes(n) {
    if (n < 1024) return n + " B";
    if (n < 1048576) return (n / 1024).toFixed(1) + " KB";
    return (n / 1048576).toFixed(1) + " MB";
  }

  // =========================================================================
  // URL helpers
  // =========================================================================
  function normalizeApiOrigin(base) {
    if (!base) return "";
    base = String(base).trim().replace(/\/+$/, "");
    if (base.toLowerCase().endsWith("/api")) base = base.slice(0, -4);
    return base;
  }

  function isLoopbackHost(host) {
    return host === "localhost" || host === "127.0.0.1" || host === "::1" || host === "[::1]";
  }

  function hostForOrigin(host) {
    return host.indexOf(":") >= 0 && !host.startsWith("[") ? "[" + host + "]" : host;
  }

  function appRootPrefix() {
    const m = document.querySelector('meta[name="application-root"]');
    let raw = m ? (m.getAttribute("content") || "").trim() : "";
    if (!raw || raw === "/") return "";
    raw = raw.replace(/\/+$/, "");
    if (raw.charAt(0) !== "/") raw = "/" + raw;
    return raw;
  }

  function joinUrl(base, path) {
    let p = path == null ? "/" : String(path);
    if (!p || p.charAt(0) !== "/") p = "/" + p.replace(/^\/+/, "");
    let b = base == null ? "" : String(base).trim().replace(/\/+$/, "");
    if (!b) {
      try {
        if (typeof window !== "undefined" && window.location && (window.location.protocol === "http:" || window.location.protocol === "https:")) {
          b = window.location.origin;
        } else { return p; }
      } catch (e0) { return p; }
    }
    const joined = b + p;
    const mm = joined.match(/^(https?:\/\/[^/]+)(.*)$/i);
    if (mm) return mm[1] + mm[2].replace(/\/{2,}/g, "/");
    return joined.replace(/\/{2,}/g, "/");
  }

  function pagePath(path) {
    const p = path.charAt(0) === "/" ? path : "/" + path;
    const root = appRootPrefix();
    return root ? root + p : p;
  }

  function stripAppRoot(pathname) {
    if (!pathname) return "/";
    const root = appRootPrefix();
    if (!root) return pathname;
    if (pathname.indexOf(root) === 0) {
      const rest = pathname.slice(root.length);
      if (!rest) return "/";
      return rest.charAt(0) !== "/" ? "/" + rest : rest;
    }
    return pathname;
  }

  function apiBase() {
    const m = document.querySelector('meta[name="api-base"]');
    if (m) {
      const c = (m.getAttribute("content") || "").trim();
      if (c) return normalizeApiOrigin(c);
    }
    try {
      if (typeof localStorage !== "undefined") {
        const o = localStorage.getItem("apiBaseOverride");
        if (o) return normalizeApiOrigin(o);
      }
    } catch (e) {}
    try {
      const port = window.location.port;
      const host = window.location.hostname;
      if (port && port !== "5000" && isLoopbackHost(host)) {
        return normalizeApiOrigin(window.location.protocol + "//" + hostForOrigin(host) + ":5000");
      }
    } catch (e2) {}
    return "";
  }

  function apiUrl(path) {
    const p = path.charAt(0) === "/" ? path : "/" + path;
    return joinUrl(apiBase(), p);
  }

  function staticUrl(path) { return apiUrl(path); }

  // =========================================================================
  // IndexedDB para PDFs locais
  // =========================================================================
  const IDB_NAME  = "valida-cnpj-arquivados";
  const IDB_STORE = "pdfs";
  const IDB_VER   = 1;

  function idbOpen() {
    if (typeof indexedDB === "undefined") return Promise.reject(new Error("IndexedDB não disponível."));
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(IDB_NAME, IDB_VER);
      req.onerror = () => reject(req.error);
      req.onsuccess = () => resolve(req.result);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(IDB_STORE)) {
          db.createObjectStore(IDB_STORE, { keyPath: "id", autoIncrement: true });
        }
      };
    });
  }

  function idbAddPdf(blob, name, cnpj) {
    return idbOpen().then(db => new Promise((resolve, reject) => {
      const rec = { name, cnpj: cnpj || "", savedAt: new Date().toISOString(), blob };
      const tx = db.transaction(IDB_STORE, "readwrite");
      const r = tx.objectStore(IDB_STORE).add(rec);
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    }));
  }

  function idbGetAllPdfs() {
    return idbOpen().then(db => new Promise((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, "readonly");
      const r = tx.objectStore(IDB_STORE).getAll();
      r.onsuccess = () => resolve(r.result || []);
      r.onerror = () => reject(r.error);
    }));
  }

  function idbDeletePdf(id) {
    return idbOpen().then(db => new Promise((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, "readwrite");
      const r = tx.objectStore(IDB_STORE).delete(Number(id));
      r.onsuccess = () => resolve();
      r.onerror = () => reject(r.error);
    }));
  }

  function pdfBlobFromStored(raw) {
    if (!raw) return null;
    if (raw instanceof Blob && raw.type === "application/pdf") return raw;
    try { return new Blob([raw], { type: "application/pdf" }); } catch (e) { return null; }
  }

  // =========================================================================
  // Toast
  // =========================================================================
  function showToast(message, isError) {
    const el = document.getElementById("app-toast");
    if (!el) return;
    el.textContent = message;
    el.hidden = false;
    el.classList.toggle("app-toast-error", !!isError);
    el.classList.add("app-toast-visible");
    if (showToast._t) clearTimeout(showToast._t);
    showToast._t = setTimeout(() => {
      el.hidden = true;
      el.classList.remove("app-toast-visible");
    }, 7000);
  }

  function redirectIfUnauthorized(res) {
    if (res && res.status === 401) {
      window.location.assign(joinUrl(window.location.origin, pagePath("/login")));
      return true;
    }
    return false;
  }

  // =========================================================================
  // Tema
  // =========================================================================
  const THEME_ORDER  = ["system", "light", "dark"];
  const THEME_LABELS = { system: "Sistema", light: "Claro", dark: "Escuro" };
  const THEME_SVG = {
    system: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="3" y="4" width="18" height="13" rx="2" stroke="currentColor" stroke-width="1.6"/><path d="M8 21h8M12 17v4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>',
    light:  '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="12" cy="12" r="4" stroke="currentColor" stroke-width="1.6"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>',
    dark:   '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M20.5 14.5A8.5 8.5 0 0 1 9.5 3.5 7 7 0 1 0 20.5 14.5Z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg>',
  };

  const ICON_DL   = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>';
  const ICON_DEL  = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>';
  const ICON_VIEW = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>';

  function initTheme() {
    let stored = null;
    try { stored = localStorage.getItem("theme"); } catch (e) {}
    let mode = stored === "light" || stored === "dark" || stored === "system" ? stored : "system";
    const iconEl  = document.getElementById("theme-cycle-icon");
    const labelEl = document.getElementById("theme-cycle-label");
    const btn     = document.getElementById("theme-cycle");

    function applyMode(m) {
      mode = m;
      document.documentElement.setAttribute("data-theme", mode);
      try { localStorage.setItem("theme", mode); } catch (e2) {}
      if (labelEl) labelEl.textContent = THEME_LABELS[mode] || mode;
      if (iconEl)  iconEl.innerHTML = THEME_SVG[mode] || "";
      if (btn) btn.setAttribute("aria-label", "Tema atual: " + (THEME_LABELS[mode] || mode) + ". Clique para alternar.");
    }
    applyMode(mode);
    if (btn) {
      btn.addEventListener("click", () => {
        const i = THEME_ORDER.indexOf(mode);
        applyMode(THEME_ORDER[(i + 1) % THEME_ORDER.length]);
      });
    }
  }

  // =========================================================================
  // Tabs de resultado
  // =========================================================================
  function selectTabByIndex(index) {
    const tabs   = document.querySelectorAll(".tab-bar .tab");
    const panels = document.querySelectorAll(".tab-panels .tab-panel");
    if (!tabs.length || index < 0 || index >= tabs.length) return;
    tabs.forEach((tab, i) => {
      const sel = i === index;
      tab.setAttribute("aria-selected", sel ? "true" : "false");
      tab.tabIndex = sel ? 0 : -1;
    });
    panels.forEach((panel, i) => panel.classList.toggle("is-active", i === index));
  }

  function initTabs() {
    const tabBar = document.querySelector(".tab-bar");
    if (!tabBar) return;
    tabBar.querySelectorAll(".tab").forEach((tab, index) => {
      tab.addEventListener("click", () => selectTabByIndex(index));
    });
    tabBar.addEventListener("keydown", (e) => {
      const tabs = Array.from(tabBar.querySelectorAll(".tab"));
      const current = tabs.findIndex(t => t.getAttribute("aria-selected") === "true");
      if (current < 0) return;
      let next = current;
      if (e.key === "ArrowRight" || e.key === "ArrowDown") { next = (current + 1) % tabs.length; e.preventDefault(); }
      else if (e.key === "ArrowLeft" || e.key === "ArrowUp") { next = (current - 1 + tabs.length) % tabs.length; e.preventDefault(); }
      else if (e.key === "Home") { next = 0; e.preventDefault(); }
      else if (e.key === "End") { next = tabs.length - 1; e.preventDefault(); }
      else return;
      selectTabByIndex(next);
      tabs[next].focus();
    });
  }

  // =========================================================================
  // Roteamento SPA
  // =========================================================================
  const VIEW_NAME_TO_PATH = {
    dashboard:       "/dashboard",
    consulta:        "/consulta",
    salvas:          "/salvas",
    arquivados:      "/arquivados",
    config:          "/config",
    enriquecimento:  "/enriquecimento",
  };

  const PATH_TO_VIEW = {
    "/dashboard":      "dashboard",
    "/consulta":       "consulta",
    "/salvas":         "salvas",
    "/arquivados":     "arquivados",
    "/config":         "config",
    "/enriquecimento": "enriquecimento",
  };

  function showView(name, opts) {
    opts = opts || {};
    const views = {
      dashboard:      document.getElementById("view-dashboard"),
      consulta:       document.getElementById("view-consulta"),
      salvas:         document.getElementById("view-salvas"),
      arquivados:     document.getElementById("view-arquivados"),
      config:         document.getElementById("view-config"),
      enriquecimento: document.getElementById("view-enriquecimento"),
    };
    const target = views[name];
    if (!target) return;

    document.querySelectorAll(".view").forEach(v => v.classList.remove("is-active"));
    target.classList.add("is-active");

    document.querySelectorAll(".sidebar-link").forEach(btn => {
      const active = btn.getAttribute("data-view") === name;
      btn.classList.toggle("is-active", active);
      if (active) btn.setAttribute("aria-current", "page");
      else btn.removeAttribute("aria-current");
    });

    if (name === "arquivados")      refreshArquivadosList();
    if (name === "dashboard")       refreshDashboard();
    if (name === "salvas")          renderListaSalvas(getTopbarFilterQuery());
    if (name === "enriquecimento")  refreshEnriquecimento();

    if (!opts.skipHistory && window.history && VIEW_NAME_TO_PATH[name]) {
      const targetPath = pagePath(VIEW_NAME_TO_PATH[name]);
      if (window.location.pathname !== targetPath) {
        history.pushState({ view: name }, "", targetPath);
      }
    }
  }

  function syncViewFromPath() {
    let path = stripAppRoot(window.location.pathname || "/");
    path = path.replace(/\/+$/, "") || "/";
    if (path === "/") path = "/dashboard";
    showView(PATH_TO_VIEW[path] || "dashboard", { skipHistory: true });
  }

  function initRouter() {
    window.addEventListener("popstate", syncViewFromPath);
    syncViewFromPath();
  }

  // =========================================================================
  // Dashboard
  // =========================================================================
  function formatDashDate(iso) {
    if (!iso) return "";
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    return d.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
  }

  async function refreshDashboard() {
    const loading = document.getElementById("dash-loading");
    const content = document.getElementById("dash-content");
    if (!loading || !content) return;
    loading.textContent = "Calculando…";
    loading.classList.remove("hidden");
    content.classList.add("hidden");
    try {
      let r = await fetch(apiUrl("/api/dashboard/stats"), { credentials: "same-origin", cache: "no-store" });
      if (r.status === 404) r = await fetch(apiUrl("/api/stats"), { credentials: "same-origin", cache: "no-store" });
      if (redirectIfUnauthorized(r)) return;
      if (!r.ok) throw new Error("Falha ao carregar o painel (" + r.status + ").");
      const d = await r.json();
      const elN = document.getElementById("dash-consultas-total");
      const elA = document.getElementById("dash-arquivados-total");
      if (elN) elN.textContent = String(d.consultas_total != null ? d.consultas_total : "—");
      if (elA) elA.textContent = String(d.arquivados_total != null ? d.arquivados_total : "—");
      const ul = document.getElementById("dash-ultimas");
      if (ul) {
        ul.innerHTML = "";
        (d.ultimas_consultas || []).forEach(row => {
          const li = document.createElement("li");
          li.textContent = formatDashDate(row.at) + " — " + formatCnpj(row.cnpj || "");
          ul.appendChild(li);
        });
      }
      loading.classList.add("hidden");
      content.classList.remove("hidden");
    } catch (err) {
      loading.textContent = "Não foi possível carregar o painel.";
      showToast(err.message || String(err), true);
    }
  }

  // =========================================================================
  // Temas (Light / Dark / System)
  // =========================================================================
  function initTheme() {
    const btn = document.getElementById("theme-cycle");
    const label = document.getElementById("theme-cycle-label");
    if (!btn) return;

    function updateUI(theme) {
      if (!label) return;
      if (theme === "light") label.textContent = "Claro";
      else if (theme === "dark") label.textContent = "Escuro";
      else label.textContent = "Sistema";
    }

    let current = localStorage.getItem("theme") || "system";
    updateUI(current);

    btn.addEventListener("click", () => {
      if (current === "system") current = "light";
      else if (current === "light") current = "dark";
      else current = "system";

      localStorage.setItem("theme", current);
      document.documentElement.setAttribute("data-theme", current);
      updateUI(current);
    });
  }

  function initLogout() {
    const btn = document.getElementById("topbar-logout");
    if (btn) {
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        window.location.assign(apiUrl("/api/auth/logout"));
      });
    }
  }

  // =========================================================================
  // Settings / Autenticação
  // =========================================================================
  function initSettings() {
    const btnSave = document.getElementById("cfg-save");
    if (!btnSave) return;

    btnSave.addEventListener("click", async () => {
      const elUser = document.getElementById("cfg-username");
      const elPass = document.getElementById("cfg-password");
      const elConf = document.getElementById("cfg-password-confirm");

      const username = elUser.value.trim();
      const password = elPass.value;
      const confirm  = elConf.value;

      if (!username || !password) {
        showToast("Usuário e senha são obrigatórios.", true);
        return;
      }
      if (password.length < 6) {
        showToast("A senha deve ter pelo menos 6 caracteres.", true);
        return;
      }
      if (password !== confirm) {
        showToast("As senhas não coincidem.", true);
        return;
      }

      btnSave.disabled = true;
      try {
        const res = await fetch(apiUrl("/api/auth/update"), {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username, password }),
        });
        
        const data = await res.json().catch(() => ({}));
        if (res.ok) {
          showToast("Credenciais atualizadas! Redirecionando...", false);
          setTimeout(() => {
            window.location.assign(apiUrl("/api/auth/logout"));
          }, 2000);
        } else {
          showToast(data.error || "Erro ao atualizar credenciais.", true);
          btnSave.disabled = false;
        }
      } catch (err) {
        showToast("Erro de rede ao atualizar.", true);
        btnSave.disabled = false;
      }
    });
  }

  // =========================================================================
  // Navegação
  // =========================================================================
  function initNavigation() {
    document.querySelectorAll(".sidebar-link").forEach(btn => {
      btn.addEventListener("click", (e) => { e.preventDefault(); showView(btn.getAttribute("data-view") || "dashboard"); });
    });
    const logo = document.getElementById("logo-home");
    if (logo) {
      logo.setAttribute("href", pagePath("/dashboard"));
      logo.addEventListener("click", (e) => { e.preventDefault(); showView("dashboard"); });
    }
    const cfgLogin = document.getElementById("cfg-login-link");
    if (cfgLogin) cfgLogin.setAttribute("href", pagePath("/login"));
  }

  // =========================================================================
  // Topbar filter
  // =========================================================================
  function initTopbarFilter() {
    const inp = document.getElementById("topbar-filter");
    if (!inp) return;
    inp.addEventListener("input", () => renderListaSalvas(inp.value.trim()));
  }

  function getTopbarFilterQuery() {
    const inp = document.getElementById("topbar-filter");
    return inp ? inp.value.trim() : "";
  }

  // =========================================================================
  // API — Entidades (banco SQLite no backend)
  // =========================================================================

  /** Busca sugestões para autocomplete. Fallback para localStorage se API indisponível. */
  async function apiAutocomplete(query) {
    try {
      const r = await fetch(apiUrl("/api/entidades/autocomplete?q=" + encodeURIComponent(query)), {
        credentials: "same-origin", cache: "no-store",
      });
      if (!r.ok) throw new Error("Status " + r.status);
      const j = await r.json();
      return j.sugestoes || [];
    } catch (e) {
      // Fallback localStorage
      const fq = query.toLowerCase();
      return loadConsultasSalvasLocal().filter(item => {
        return String(item.cnpj || "").includes(fq) || String(item.nome || "").toLowerCase().includes(fq);
      }).slice(0, 8).map(item => ({
        cnpj: item.cnpj,
        razao_social: item.nome || "",
        fantasia: "",
        situacao: "",
        pinned: true,
      }));
    }
  }

  /** Lista entidades fixadas do backend. Fallback para localStorage. */
  async function apiListPinned(filterQuery) {
    try {
      let url = apiUrl("/api/entidades?pinned=1");
      if (filterQuery) url += "&q=" + encodeURIComponent(filterQuery);
      const r = await fetch(url, { credentials: "same-origin", cache: "no-store" });
      if (!r.ok) throw new Error("Status " + r.status);
      const j = await r.json();
      return { ok: true, entidades: j.entidades || [] };
    } catch (e) {
      // Fallback localStorage legado
      let list = loadConsultasSalvasLocal();
      if (filterQuery) {
        const fq = filterQuery.toLowerCase();
        list = list.filter(item =>
          String(item.cnpj || "").includes(fq) ||
          String(item.nome || "").toLowerCase().includes(fq)
        );
      }
      return { ok: false, entidades: list.map(item => ({
        cnpj: item.cnpj,
        razao_social: item.nome || "",
        fantasia: "",
        situacao: "",
        atualizado_em: item.dataISO || "",
        pinned: 1,
      })) };
    }
  }

  /** Pina ou despina uma entidade no backend. */
  async function apiPinEntidade(cnpj14, pinned) {
    try {
      const r = await fetch(apiUrl("/api/entidades/" + encodeURIComponent(cnpj14) + "/pin"), {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pinned }),
      });
      if (redirectIfUnauthorized(r)) return { ok: false };
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        showToast((j.error || "Erro ao fixar/desfixar."), true);
        return { ok: false };
      }
      return { ok: true };
    } catch (e) {
      showToast("Não foi possível comunicar com o servidor.", true);
      return { ok: false };
    }
  }

  // =========================================================================
  // localStorage legado (fallback)
  // =========================================================================
  function loadConsultasSalvasLocal() {
    try {
      const raw = localStorage.getItem(STORAGE_SALVAS);
      const arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr : [];
    } catch (e) { return []; }
  }

  /** Salva no localStorage local para compatibilidade e fallback. */
  function saveConsultaSalvaLocal(entry) {
    const list = loadConsultasSalvasLocal();
    const idx = list.findIndex(x => x.cnpj === entry.cnpj);
    if (idx >= 0) list[idx] = entry; else list.unshift(entry);
    try { localStorage.setItem(STORAGE_SALVAS, JSON.stringify(list.slice(0, 200))); } catch (e) {}
  }

  // =========================================================================
  // Consultas Salvas (renderização)
  // =========================================================================
  async function renderListaSalvas(filterQuery) {
    const el = document.getElementById("lista-salvas");
    if (!el) return;
    el.innerHTML = '<p class="mensagem info">Carregando…</p>';

    const { entidades } = await apiListPinned(filterQuery);

    if (!entidades.length) {
      el.innerHTML = '<p class="mensagem info">' +
        (filterQuery ? "Nenhuma consulta corresponde ao filtro." : "Nenhum CNPJ fixado ainda. Use o botão 📌 após consultar.") +
        "</p>";
      return;
    }

    let html = "";
    entidades.forEach(item => {
      const nome = item.fantasia || item.razao_social || "";
      const situacao = (item.situacao || "").toUpperCase();
      let badgeClass = "situacao-outro";
      if (situacao === "ATIVA") badgeClass = "situacao-ativa";
      else if (["INAPTA", "BAIXADA", "SUSPENSA"].includes(situacao)) badgeClass = "situacao-inapta";

      const dataStr = item.atualizado_em
        ? new Date(item.atualizado_em).toLocaleDateString("pt-BR")
        : "";

      html += `<div class="card-salva">
        <div>
          <strong>${escapeHtml(formatCnpj(item.cnpj))}</strong>
          ${nome ? `<div class="card-salva-meta">${escapeHtml(nome)}</div>` : ""}
          ${situacao ? `<span class="situacao-badge ${badgeClass}">${escapeHtml(situacao)}</span>` : ""}
          ${dataStr ? `<div class="card-salva-meta">Atualizado em ${escapeHtml(dataStr)}</div>` : ""}
        </div>
        <div class="file-actions">
          <button type="button" class="btn-link js-reconsultar" data-cnpj="${escapeHtml(item.cnpj)}">Consultar</button>
          <button type="button" class="btn-link js-desafixar" data-cnpj="${escapeHtml(item.cnpj)}">Desfixar</button>
        </div>
      </div>`;
    });

    el.innerHTML = html;

    el.querySelectorAll(".js-reconsultar").forEach(b => {
      b.addEventListener("click", () => {
        const cnpj = b.getAttribute("data-cnpj") || "";
        const input = document.getElementById("cnpj");
        if (input) input.value = formatCnpj(cnpj);
        showView("consulta");
        const form = document.getElementById("form-consulta");
        if (form) form.requestSubmit();
      });
    });

    el.querySelectorAll(".js-desafixar").forEach(b => {
      b.addEventListener("click", async () => {
        const cnpj = b.getAttribute("data-cnpj") || "";
        const res = await apiPinEntidade(cnpj, false);
        if (res.ok) {
          showToast("CNPJ " + formatCnpj(cnpj) + " removido das consultas salvas.");
          renderListaSalvas(getTopbarFilterQuery());
          // Se era o CNPJ atual, atualiza o estado do botão pin
          if (lastConsult && lastConsult.cnpj14 === cnpj) {
            currentPinned = false;
            updatePinButton();
          }
        }
      });
    });
  }

  // =========================================================================
  // Botão Fixar (Pin)
  // =========================================================================
  function updatePinButton() {
    const btn   = document.getElementById("btn-pin");
    const label = document.getElementById("btn-pin-label");
    if (!btn) return;
    btn.classList.toggle("is-pinned", currentPinned);
    btn.setAttribute("aria-pressed", currentPinned ? "true" : "false");
    if (label) label.textContent = currentPinned ? "Fixado ✓" : "Fixar consulta";
  }

  function initPinButton() {
    const btn = document.getElementById("btn-pin");
    if (!btn) return;
    btn.addEventListener("click", async () => {
      if (!lastConsult) return;
      const cnpj14 = lastConsult.cnpj14;
      const novoPinned = !currentPinned;
      btn.disabled = true;
      const res = await apiPinEntidade(cnpj14, novoPinned);
      btn.disabled = false;
      if (res.ok) {
        currentPinned = novoPinned;
        updatePinButton();
        if (novoPinned) {
          // Salva também no localStorage como fallback
          saveConsultaSalvaLocal({
            cnpj: cnpj14,
            nome: (lastConsult.data && (lastConsult.data.fantasia || lastConsult.data.nome)) || "",
            dataISO: new Date().toISOString(),
          });
          showToast("CNPJ fixado em Consultas Salvas!");
        } else {
          showToast("CNPJ removido das Consultas Salvas.");
        }
      }
    });
  }

  // =========================================================================
  // Autocomplete no campo CNPJ
  // =========================================================================
  function initAutocomplete() {
    const input    = document.getElementById("cnpj");
    const dropdown = document.getElementById("cnpj-autocomplete");
    if (!input || !dropdown) return;

    let debounceTimer = null;
    let activeIndex   = -1;
    let currentItems  = [];

    function closeDropdown() {
      dropdown.hidden = true;
      dropdown.innerHTML = "";
      input.setAttribute("aria-expanded", "false");
      activeIndex  = -1;
      currentItems = [];
    }

    function renderDropdown(items) {
      currentItems = items;
      dropdown.innerHTML = "";
      if (!items.length) { closeDropdown(); return; }

      items.forEach((item, i) => {
        const li = document.createElement("li");
        li.className = "autocomplete-item";
        li.setAttribute("role", "option");
        li.setAttribute("id", "ac-item-" + i);
        const nome = item.fantasia || item.razao_social || "";
        li.innerHTML =
          `<span class="autocomplete-item-cnpj">${escapeHtml(formatCnpj(item.cnpj))}</span>` +
          (nome ? `<span class="autocomplete-item-nome">${escapeHtml(nome)}</span>` : "") +
          (item.pinned ? `<span class="autocomplete-pin-badge">Fixado</span>` : "");
        li.addEventListener("mousedown", (e) => {
          e.preventDefault();
          selectItem(item);
        });
        dropdown.appendChild(li);
      });

      dropdown.hidden = false;
      input.setAttribute("aria-expanded", "true");
      activeIndex = -1;
    }

    function selectItem(item) {
      input.value = formatCnpj(item.cnpj);
      closeDropdown();
      const form = document.getElementById("form-consulta");
      if (form) form.requestSubmit();
    }

    function setActiveItem(idx) {
      const items = dropdown.querySelectorAll(".autocomplete-item");
      items.forEach((el, i) => el.classList.toggle("is-active", i === idx));
      if (idx >= 0 && items[idx]) {
        items[idx].scrollIntoView({ block: "nearest" });
        input.setAttribute("aria-activedescendant", "ac-item-" + idx);
      } else {
        input.removeAttribute("aria-activedescendant");
      }
      activeIndex = idx;
    }

    input.addEventListener("input", () => {
      const q = input.value.replace(/\D/g, "");
      const raw = input.value.trim();
      clearTimeout(debounceTimer);
      if (raw.length < 3) { closeDropdown(); return; }
      debounceTimer = setTimeout(async () => {
        const items = await apiAutocomplete(raw.length > 2 ? raw : q);
        renderDropdown(items);
      }, 280);
    });

    input.addEventListener("keydown", (e) => {
      if (dropdown.hidden) return;
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveItem(Math.min(activeIndex + 1, currentItems.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveItem(Math.max(activeIndex - 1, -1));
      } else if (e.key === "Enter" && activeIndex >= 0) {
        e.preventDefault();
        selectItem(currentItems[activeIndex]);
      } else if (e.key === "Escape") {
        closeDropdown();
      }
    });

    input.addEventListener("blur", () => setTimeout(closeDropdown, 150));
    document.addEventListener("click", (e) => {
      if (!input.contains(e.target) && !dropdown.contains(e.target)) closeDropdown();
    });
  }

  function initLogout() {
    const btn = document.getElementById("topbar-logout");
    if (btn) {
      btn.addEventListener("click", () => {
        if (confirm("Deseja realmente sair do sistema?")) {
          window.location.href = pagePath("/logout");
        }
      });
    }
  }

  // =========================================================================
  // URL e Routing
  // =========================================================================
  let enrPollingTimer = null;

  async function refreshEnriquecimento() {
    const listEl = document.getElementById("enriquecimento-list");
    if (!listEl) return;
    listEl.innerHTML = '<p class="mensagem info">Carregando entidades fixadas…</p>';

    const { entidades } = await apiListPinned();

    if (!entidades.length) {
      listEl.innerHTML = '<p class="mensagem info">Nenhuma entidade fixada. Fixe CNPJs na tela de Consulta para enriquecer.</p>';
      return;
    }

    listEl.innerHTML = entidades.map(item => {
      const nome    = item.fantasia || item.razao_social || "(sem nome)";
      const dataStr = item.atualizado_em
        ? new Date(item.atualizado_em).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })
        : "—";

      return `<div class="enr-card" role="button" tabindex="0" data-cnpj="${escapeHtml(item.cnpj)}" aria-label="Editar ${escapeHtml(formatCnpj(item.cnpj))}, ${escapeHtml(nome)}">
        <span class="enr-card-cnpj">${escapeHtml(formatCnpj(item.cnpj))}</span>
        <div class="enr-card-info">
          <div class="enr-card-nome">${escapeHtml(nome)}</div>
          <div class="enr-card-meta">Última atualização: ${escapeHtml(dataStr)}</div>
        </div>
        <span class="enr-badge enr-badge-pendente" id="enr-status-${escapeHtml(item.cnpj)}">Pendente</span>
      </div>`;
    }).join("");
  }

  async function startEnriquecimento() {
    const btn = document.getElementById("btn-enriquecer");
    if (btn) btn.disabled = true;

    try {
      const r = await fetch(apiUrl("/api/enriquecimento/processar"), {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (redirectIfUnauthorized(r)) return;
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        showToast(j.error || "Erro ao iniciar enriquecimento.", true);
        if (btn) btn.disabled = false;
        return;
      }
      showToast("Enriquecimento iniciado para " + j.total + " entidade(s).");
      showEnriquecimentoProgress();
      pollEnriquecimentoStatus();
    } catch (e) {
      showToast("Não foi possível iniciar o enriquecimento.", true);
      if (btn) btn.disabled = false;
    }
  }

  function showEnriquecimentoProgress() {
    const prog = document.getElementById("enriquecimento-progress");
    if (prog) prog.classList.remove("hidden");
  }

  function hideEnriquecimentoProgress() {
    const prog = document.getElementById("enriquecimento-progress");
    if (prog) prog.classList.add("hidden");
  }

  async function pollEnriquecimentoStatus() {
    clearTimeout(enrPollingTimer);
    try {
      const r = await fetch(apiUrl("/api/enriquecimento/status"), { credentials: "same-origin", cache: "no-store" });
      if (!r.ok) return;
      const s = await r.json();

      const bar   = document.getElementById("enriquecimento-bar");
      const txt   = document.getElementById("enriquecimento-status-text");
      if (bar) bar.style.width = (s.percentual || 0) + "%";
      if (txt) {
        if (s.em_andamento) {
          txt.textContent = `Processando ${s.processados} de ${s.total}… (${s.erros.length} erro(s))`;
        } else if (s.concluido) {
          txt.textContent = `Concluído! ${s.processados} atualizado(s), ${s.erros.length} erro(s).`;
        }
      }

      // Atualiza badges dos cards
      (s.erros || []).forEach(err => {
        const badge = document.getElementById("enr-status-" + err.cnpj);
        if (badge) {
          badge.className = "enr-badge enr-badge-erro";
          badge.textContent = "Erro";
          badge.title = err.erro || "";
        }
      });

      if (s.em_andamento) {
        enrPollingTimer = setTimeout(pollEnriquecimentoStatus, 2000);
      } else {
        const btn = document.getElementById("btn-enriquecer");
        if (btn) btn.disabled = false;
        if (s.concluido) {
          // Marca os que não tiveram erro como atualizados
          const errorCnpjs = new Set((s.erros || []).map(e => e.cnpj));
          document.querySelectorAll(".enr-card[data-cnpj]").forEach(card => {
            const cnpj = card.getAttribute("data-cnpj");
            if (!errorCnpjs.has(cnpj)) {
              const badge = document.getElementById("enr-status-" + cnpj);
              if (badge) {
                badge.className = "enr-badge enr-badge-ok";
                badge.textContent = "Atualizado";
              }
            }
          });
        }
        setTimeout(hideEnriquecimentoProgress, 4000);
      }
    } catch (e) {
      // Silencia erros de poll
    }
  }

  function parseEntidadeDadosJson(row) {
    let j = {};
    if (row && row.dados_json) {
      try {
        j = typeof row.dados_json === "string" ? JSON.parse(row.dados_json) : (row.dados_json || {});
      } catch (e2) { j = {}; }
    }
    return j && typeof j === "object" ? j : {};
  }

  let enrEditCnpj14 = null;

  function closeModalEditEntidade() {
    const modal = document.getElementById("modal-edit-entidade");
    const form = document.getElementById("form-edit-entidade");
    if (form) form.querySelectorAll("input").forEach(el => { el.disabled = false; });
    const saveBtn = document.getElementById("modal-edit-entidade-save");
    if (saveBtn) saveBtn.disabled = false;
    if (modal) modal.hidden = true;
    document.body.classList.remove("modal-open");
    enrEditCnpj14 = null;
  }

  function fillEnriquecimentoEditForm(row) {
    const j = parseEntidadeDadosJson(row);
    const setv = (id, v) => {
      const el = document.getElementById(id);
      if (el) el.value = v != null ? String(v) : "";
    };
    const cnpj = row.cnpj || "";
    setv("enr-edit-cnpj", formatCnpj(cnpj));
    setv("enr-edit-razao_social", row.razao_social || j.nome || "");
    setv("enr-edit-fantasia", row.fantasia || j.fantasia || "");
    setv("enr-edit-situacao", row.situacao || j.situacao || "");
    setv("enr-edit-cep", row.cep || j.cep || "");
    setv("enr-edit-municipio", row.municipio || j.municipio || "");
    setv("enr-edit-uf", row.uf || j.uf || "");
    setv("enr-edit-data_abertura", row.data_abertura || j.abertura || "");
    setv("enr-edit-telefone", j.telefone || "");
    setv("enr-edit-email", j.email || "");
    setv("enr-edit-logradouro", j.logradouro || "");
    setv("enr-edit-numero", j.numero || "");
    setv("enr-edit-complemento", j.complemento || "");
    setv("enr-edit-bairro", j.bairro || "");
  }

  async function openModalEditEntidade(cnpj14) {
    const modal = document.getElementById("modal-edit-entidade");
    const form = document.getElementById("form-edit-entidade");
    if (!modal || !form) return;
    enrEditCnpj14 = cnpj14;
    modal.hidden = false;
    document.body.classList.add("modal-open");
    form.querySelectorAll("input:not([readonly])").forEach(el => { el.disabled = true; });
    const saveBtn = document.getElementById("modal-edit-entidade-save");
    if (saveBtn) saveBtn.disabled = true;

    try {
      const r = await fetch(apiUrl("/api/entidades/" + encodeURIComponent(cnpj14)), {
        credentials: "same-origin",
        cache: "no-store",
      });
      if (redirectIfUnauthorized(r)) {
        closeModalEditEntidade();
        return;
      }
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        showToast(j.error || "Não foi possível carregar a entidade.", true);
        closeModalEditEntidade();
        return;
      }
      fillEnriquecimentoEditForm(j);
    } catch (e) {
      showToast("Erro de rede ao carregar a entidade.", true);
      closeModalEditEntidade();
      return;
    }
    form.querySelectorAll("input:not([readonly])").forEach(el => { el.disabled = false; });
    if (saveBtn) saveBtn.disabled = false;
    const first = document.getElementById("enr-edit-razao_social");
    if (first) first.focus();
  }

  async function submitEnriquecimentoEdit(e) {
    e.preventDefault();
    if (!enrEditCnpj14) return;
    const g = id => {
      const el = document.getElementById(id);
      return el ? String(el.value || "").trim() : "";
    };
    const body = {
      razao_social: g("enr-edit-razao_social"),
      fantasia: g("enr-edit-fantasia"),
      situacao: g("enr-edit-situacao"),
      cep: g("enr-edit-cep"),
      municipio: g("enr-edit-municipio"),
      uf: g("enr-edit-uf"),
      data_abertura: g("enr-edit-data_abertura"),
      telefone: g("enr-edit-telefone"),
      email: g("enr-edit-email"),
      logradouro: g("enr-edit-logradouro"),
      numero: g("enr-edit-numero"),
      complemento: g("enr-edit-complemento"),
      bairro: g("enr-edit-bairro"),
    };
    const saveBtn = document.getElementById("modal-edit-entidade-save");
    if (saveBtn) saveBtn.disabled = true;
    try {
      const r = await fetch(apiUrl("/api/entidades/" + encodeURIComponent(enrEditCnpj14)), {
        method: "PATCH",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (redirectIfUnauthorized(r)) {
        if (saveBtn) saveBtn.disabled = false;
        return;
      }
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        showToast(j.error || "Não foi possível salvar.", true);
        if (saveBtn) saveBtn.disabled = false;
        return;
      }
      showToast("Cadastro atualizado.");
      closeModalEditEntidade();
      const vEnr = document.getElementById("view-enriquecimento");
      if (vEnr && vEnr.classList.contains("is-active")) await refreshEnriquecimento();
    } catch (err) {
      showToast("Erro de rede ao salvar.", true);
      if (saveBtn) saveBtn.disabled = false;
    }
  }

  function initModalEditEntidade() {
    const modal = document.getElementById("modal-edit-entidade");
    const form = document.getElementById("form-edit-entidade");
    const btnCancel = document.getElementById("modal-edit-entidade-cancel");
    if (modal) {
      modal.addEventListener("click", (e) => { if (e.target === modal) closeModalEditEntidade(); });
    }
    if (btnCancel) btnCancel.addEventListener("click", () => closeModalEditEntidade());
    if (form) form.addEventListener("submit", submitEnriquecimentoEdit);
    document.addEventListener("keydown", (e) => {
      if (e.key !== "Escape") return;
      const m = document.getElementById("modal-edit-entidade");
      if (!m || m.hidden) return;
      e.preventDefault();
      closeModalEditEntidade();
    }, true);
  }

  function initEnriquecimento() {
    const btnEnr = document.getElementById("btn-enriquecer");
    if (btnEnr) btnEnr.addEventListener("click", startEnriquecimento);

    const btnRefresh = document.getElementById("btn-enriquecer-refresh");
    if (btnRefresh) btnRefresh.addEventListener("click", refreshEnriquecimento);

    const listEl = document.getElementById("enriquecimento-list");
    if (listEl) {
      listEl.addEventListener("click", (e) => {
        const card = e.target.closest(".enr-card");
        if (!card || !listEl.contains(card)) return;
        const cnpj = card.getAttribute("data-cnpj");
        if (cnpj) openModalEditEntidade(cnpj);
      });
      listEl.addEventListener("keydown", (e) => {
        if (e.key !== "Enter" && e.key !== " ") return;
        const card = e.target.closest(".enr-card");
        if (!card || !listEl.contains(card)) return;
        if (e.key === " ") e.preventDefault();
        const cnpj = card.getAttribute("data-cnpj");
        if (cnpj) openModalEditEntidade(cnpj);
      });
    }

    initModalEditEntidade();
    initModalPreviewPdf();
  }

  // =========================================================================
  // Modal de Visualização de PDF (Servidor)
  // =========================================================================
  let currentPdfBlobUrl = null;

  async function openModalPreviewPdf(name, url) {
    const modal = document.getElementById("modal-preview-pdf");
    const title = document.getElementById("modal-preview-pdf-title");
    const iframe = document.getElementById("iframe-preview-pdf");
    if (!modal || !iframe) return;

    if (title) title.textContent = "Carregando visualização...";
    modal.hidden = false;
    document.body.classList.add("modal-open");

    try {
      // Usar fetch para obter o blob evita o download prompt do navegador
      const res = await fetch(url);
      if (!res.ok) throw new Error("Erro ao carregar PDF.");
      const blob = await res.blob();
      
      // Limpa URL anterior se existir
      if (currentPdfBlobUrl) URL.revokeObjectURL(currentPdfBlobUrl);
      
      currentPdfBlobUrl = URL.createObjectURL(blob);
      iframe.src = currentPdfBlobUrl;
      
      if (title) title.textContent = "Visualizando: " + name;
    } catch (e) {
      if (title) title.textContent = "Erro ao carregar visualização.";
      showToast("Não foi possível carregar o PDF para visualização.", true);
      console.error(e);
    }
  }

  function closeModalPreviewPdf() {
    const modal = document.getElementById("modal-preview-pdf");
    const iframe = document.getElementById("iframe-preview-pdf");
    if (!modal) return;
    
    if (iframe) iframe.src = "";
    if (currentPdfBlobUrl) {
      URL.revokeObjectURL(currentPdfBlobUrl);
      currentPdfBlobUrl = null;
    }
    
    modal.hidden = true;
    document.body.classList.remove("modal-open");
  }

  function initModalPreviewPdf() {
    const btnClose = document.getElementById("modal-preview-pdf-close");
    const modal = document.getElementById("modal-preview-pdf");
    if (btnClose) btnClose.addEventListener("click", closeModalPreviewPdf);
    if (modal) {
      modal.addEventListener("click", (e) => {
        if (e.target === modal) closeModalPreviewPdf();
      });
    }
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && modal && !modal.hidden) closeModalPreviewPdf();
    });
  }

  // =========================================================================
  // Arquivados
  // =========================================================================
  async function apiDeleteArquivado(name) {
    try {
      const r = await fetch(apiUrl("/api/arquivados/eliminar/" + encodeURIComponent(name)), {
        method: "DELETE",
        credentials: "same-origin",
      });
      if (redirectIfUnauthorized(r)) return { ok: false };
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        showToast(j.error || "Erro ao excluir arquivo no servidor.", true);
        return { ok: false };
      }
      return { ok: true };
    } catch (e) {
      showToast("Não foi possível comunicar com o servidor.", true);
      return { ok: false };
    }
  }

  async function refreshArquivadosList() {
    const el = document.getElementById("lista-arquivados");
    if (!el) return;
    el.innerHTML = '<p class="mensagem info">Carregando…</p>';
    let serverFiles = [];
    try {
      const r = await fetch(apiUrl("/api/arquivados"), { credentials: "same-origin", cache: "no-store" });
      if (redirectIfUnauthorized(r)) return;
      if (r.ok) { const data = await r.json(); serverFiles = data.files || []; }
    } catch (e) {}
    let loc = [];
    try { loc = await idbGetAllPdfs(); } catch (e2) { loc = []; }
    loc.sort((a, b) => String(b.savedAt || "").localeCompare(String(a.savedAt || "")));
    renderArquivadosMerged(el, serverFiles, loc);
  }

  function renderArquivadosMerged(container, serverFiles, localRecords) {
    const hasServer = serverFiles && serverFiles.length > 0;
    const hasLocal  = localRecords && localRecords.length > 0;
    if (!hasServer && !hasLocal) {
      container.innerHTML = '<p class="mensagem info">Nenhum PDF arquivado. Use Exportar → Local após uma consulta.</p>';
      return;
    }
    let html = "";
    if (hasServer) {
      html += '<h3 class="arquivados-section-title">Servidor <span class="badge-origem">pasta</span></h3>';
      html += '<table class="file-table"><thead><tr><th>Arquivo</th><th>Tamanho</th><th>Modificado</th><th>Ações</th></tr></thead><tbody>';
      serverFiles.forEach(f => {
        const base = apiUrl("/api/arquivados/download/" + encodeURIComponent(f.name));
        const viewUrl = base + "?inline=1";
        html += `<tr><td>${escapeHtml(f.name)}</td><td>${escapeHtml(formatBytes(f.size || 0))}</td><td>${escapeHtml(f.modified || "")}</td>`;
        html += `<td class="file-actions">
          <a class="btn-link" href="${base}" download title="Baixar arquivo do servidor" aria-label="Baixar">${ICON_DL}</a>
          <button type="button" class="btn-link js-arq-srv-view" data-name="${escapeHtml(f.name)}" data-url="${viewUrl}" title="Visualizar no servidor" aria-label="Visualizar">${ICON_VIEW}</button>
          <button type="button" class="btn-link js-arq-srv-del" data-name="${escapeHtml(f.name)}" title="Excluir do servidor" aria-label="Excluir">${ICON_DEL}</button>
        </td></tr>`;
      });
      html += "</tbody></table>";
    }
    if (hasLocal) {
      html += '<h3 class="arquivados-section-title">Neste navegador <span class="badge-origem">IndexedDB</span></h3>';
      html += '<table class="file-table"><thead><tr><th>Arquivo</th><th>Tamanho</th><th>Guardado</th><th>Ações</th></tr></thead><tbody>';
      localRecords.forEach(rec => {
        const sz = rec.blob && rec.blob.size ? rec.blob.size : 0;
        html += `<tr><td>${escapeHtml(rec.name || "")}</td><td>${escapeHtml(formatBytes(sz))}</td><td>${escapeHtml(rec.savedAt || "")}</td>`;
        html += `<td class="file-actions">
          <button type="button" class="btn-link js-arq-local-dl" data-id="${String(rec.id)}" title="Baixar PDF local" aria-label="Baixar">${ICON_DL}</button>
          <button type="button" class="btn-link js-arq-local-view" data-id="${String(rec.id)}" title="Visualizar PDF local" aria-label="Visualizar">${ICON_VIEW}</button>
          <button type="button" class="btn-link js-arq-local-del" data-id="${String(rec.id)}" title="Excluir PDF local" aria-label="Excluir">${ICON_DEL}</button>
        </td></tr>`;
      });
      html += "</tbody></table>";
    }
    container.innerHTML = html;

    container.querySelectorAll(".js-arq-srv-del").forEach(btn => {
      btn.addEventListener("click", async () => {
        const name = btn.getAttribute("data-name");
        if (!confirm(`Tem certeza que deseja excluir o arquivo "${name}" do servidor?`)) return;
        const res = await apiDeleteArquivado(name);
        if (res.ok) {
          showToast(`Arquivo "${name}" excluído do servidor.`);
          refreshArquivadosList();
        }
      });
    });

    container.querySelectorAll(".js-arq-srv-view").forEach(btn => {
      btn.addEventListener("click", () => {
        const name = btn.getAttribute("data-name");
        const url = btn.getAttribute("data-url");
        if (name && url) openModalPreviewPdf(name, url);
      });
    });

    container.querySelectorAll(".js-arq-local-dl").forEach(btn => {
      btn.addEventListener("click", () => {
        const id = btn.getAttribute("data-id");
        idbOpen().then(db => new Promise((res, rej) => {
          const r = db.transaction(IDB_STORE, "readonly").objectStore(IDB_STORE).get(Number(id));
          r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
        })).then(rec => {
          if (!rec || !rec.blob) return;
          const blob = pdfBlobFromStored(rec.blob);
          if (!blob) return;
          const a = document.createElement("a");
          a.href = URL.createObjectURL(blob); a.download = rec.name || "consulta.pdf"; a.click(); URL.revokeObjectURL(a.href);
        }).catch(() => showToast("Não foi possível ler o arquivo.", true));
      });
    });

    container.querySelectorAll(".js-arq-local-view").forEach(btn => {
      btn.addEventListener("click", () => {
        const id = btn.getAttribute("data-id");
        idbOpen().then(db => new Promise((res, rej) => {
          const r = db.transaction(IDB_STORE, "readonly").objectStore(IDB_STORE).get(Number(id));
          r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
        })).then(rec => {
          if (!rec || !rec.blob) return;
          const blob = pdfBlobFromStored(rec.blob); if (!blob) return;
          const u = URL.createObjectURL(blob);
          const w = window.open(u, "_blank", "noopener,noreferrer");
          if (!w) { showToast("Permita pop-ups para visualizar o PDF.", true); URL.revokeObjectURL(u); return; }
          setTimeout(() => URL.revokeObjectURL(u), 120000);
        }).catch(() => showToast("Não foi possível abrir o arquivo.", true));
      });
    });

    container.querySelectorAll(".js-arq-local-del").forEach(btn => {
      btn.addEventListener("click", () => {
        const id = btn.getAttribute("data-id");
        idbDeletePdf(id).then(refreshArquivadosList).catch(() => showToast("Não foi possível excluir.", true));
      });
    });
  }

  // =========================================================================
  // PDF (jsPDF)
  // =========================================================================
  function hasJsPdf() { return !!(window.jspdf && window.jspdf.jsPDF); }

  function buildPdfBlob(cnpj14, data, enderecoRow) {
    if (!hasJsPdf()) throw new Error("Biblioteca jsPDF não carregou (verifique a rede).");
    const jsPDF = window.jspdf.jsPDF;
    const doc = new jsPDF({ unit: "pt", format: "a4" });
    
    // Constantes e Cores Profissionais
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const marginX = 40;
    const maxW = pageWidth - marginX * 2;
    let y = 0;
    const lh = 14; 
    
    const colorBgTop = [15, 23, 42]; // Slate 900
    const colorAccent = [79, 70, 229]; // Indigo 600
    const colorTextTitle = [15, 23, 42]; 
    const colorTextLabel = [100, 116, 139]; // Slate 500
    const colorTextValue = [30, 41, 59]; // Slate 800
    const colorLine = [226, 232, 240]; // Slate 200
    
    function drawHeaderAndFooter() {
      // Cabeçalho (Bloco principal e linha detalhe)
      doc.setFillColor(...colorBgTop);
      doc.rect(0, 0, pageWidth, 75, "F");
      doc.setFillColor(...colorAccent);
      doc.rect(0, 75, pageWidth, 4, "F");
      
      // Logotipo (Imagem e Texto)
      doc.setFont("helvetica", "bold");
      doc.setFontSize(22);
      doc.setTextColor(255, 255, 255);
      const brandName = "Duran Ponce | Compliance";
      
      const textX = window._cachedLogoBase64 ? marginX + 40 : marginX;

      // Desenhar o logo se estiver carregado
      if (window._cachedLogoBase64) {
        doc.addImage(window._cachedLogoBase64, "PNG", marginX, 22, 30, 30);
      }
      
      doc.text(brandName, textX, 40);

      // Subtítulo: Razão Social
      doc.setFontSize(10);
      doc.setFont("helvetica", "italic");
      doc.setTextColor(200, 203, 210); // Branco levemente acinzentado
      const razaoSocial = (data.nome || "").trim();
      if (razaoSocial) {
        doc.text(razaoSocial, textX, 55, { maxWidth: pageWidth - marginX - 160 });
      }
      
      // Metadados direita (Data e CNPJ)
      doc.setFontSize(9);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(148, 163, 184); 
      const nowStr = new Date().toLocaleString("pt-BR");
      doc.text(`Documento gerado em: ${nowStr}`, pageWidth - marginX, 36, { align: "right" });
      doc.setFontSize(11);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(255, 255, 255);
      doc.text(`CNPJ: ${cnpj14}`, pageWidth - marginX, 52, { align: "right" });
      
      // Rodapé
      doc.setFillColor(...colorBgTop);
      doc.rect(0, pageHeight - 35, pageWidth, 35, "F");
      doc.setFontSize(9);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(148, 163, 184);
      doc.text(`${brandName} — Sistema de Compliance e Auditoria`, pageWidth / 2, pageHeight - 14, { align: "center" });
      
      y = 110; // Inicio do conteúdo pós cabeçalho
    }
    
    function checkPageBreak(requiredSpace = lh * 2) {
      if (y + requiredSpace > pageHeight - 60) {
        doc.addPage();
        drawHeaderAndFooter();
      }
    }
    
    function addSectionTitle(title) {
      checkPageBreak(40);
      doc.setFontSize(14);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...colorTextTitle);
      doc.text(title.toUpperCase(), marginX, y);
      y += 8;
      // Linha separadora
      doc.setDrawColor(...colorLine);
      doc.setLineWidth(1.5);
      doc.line(marginX, y, pageWidth - marginX, y);
      y += 20;
    }
    
    function renderFieldsGrid(fieldsArray) {
       const midX = marginX + (maxW / 2) + 10;
       let isLeft = true;
       
       fieldsArray.forEach(f => {
         const label = String(f.label);
         const valStr = String(f.value || "-").trim();
         
         // Força bloco completo caso o valor seja muito longo (+50 chars)
         if (valStr.length > 50) {
            if (!isLeft) { y += lh * 2; isLeft = true; } // Empurra para a nova linha
            checkPageBreak(lh * 4);
            
            doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.setTextColor(...colorTextLabel);
            doc.text(label, marginX, y);
            
            doc.setFont("helvetica", "normal"); doc.setTextColor(...colorTextValue); doc.setFontSize(10);
            const splitted = doc.splitTextToSize(valStr, maxW);
            y += 12;
            splitted.forEach(l => {
              checkPageBreak(lh);
              doc.text(l, marginX, y);
              y += lh;
            });
            y += 6;
         } else {
            // Elemento em grade (2 colunas)
            checkPageBreak(lh * 3);
            const posX = isLeft ? marginX : midX;
            doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.setTextColor(...colorTextLabel);
            doc.text(label, posX, y);
            
            doc.setFont("helvetica", "normal"); doc.setTextColor(...colorTextValue); doc.setFontSize(10);
            const splitted = doc.splitTextToSize(valStr, (maxW / 2) - 10);
            doc.text(splitted[0] || "", posX, y + 12);
            
            if (!isLeft) { y += lh * 2.5; }
            isLeft = !isLeft;
         }
       });
       if (!isLeft) y += lh * 2.5; // Finaliza grid se ficou pendente
    }
    
    function addArrayBlock(title, dataArray) {
      addSectionTitle(title);
      if (!dataArray || dataArray.length === 0) {
        doc.setFont("helvetica", "italic"); doc.setFontSize(10); doc.setTextColor(...colorTextLabel);
        doc.text("(sem registros aplicáveis)", marginX, y);
        y += lh * 2.5;
        return;
      }
      
      dataArray.forEach((rowObj, index) => {
        checkPageBreak(60);
        
        // Estilo Cabeçalho do Bloco Interno
        doc.setFillColor(248, 250, 252); // Slate 50 background
        const startY = y - 12;
        doc.rect(marginX - 6, startY, maxW + 12, 22, "F");
        
        doc.setFont("helvetica", "bold"); doc.setFontSize(10); doc.setTextColor(...colorAccent);
        doc.text(`Registro #${index + 1}`, marginX, y + 3);
        y += 24;
        
        const blockFields = Object.keys(rowObj)
          .filter(k => k !== "cnpj" && k !== "tipo")
          .sort()
          .map(k => ({ label: tituloCampoPt(k).toUpperCase(), value: formatValorCampo(k, rowObj[k]) }));
        
        renderFieldsGrid(blockFields);
        y += 4; 
      });
      y += lh;
    }

    // Inicialização do Documento
    drawHeaderAndFooter();
    
    // Cadastro
    addSectionTitle("Dados Cadastrais");
    const cadRows = buildCadastroRow(data).map(r => ({ label: tituloCampoPt(r.campo).toUpperCase(), value: formatValorCampo(r.campo, r.valor) }));
    renderFieldsGrid(cadRows);
    
    // Localização & Contatos Complementares
    addSectionTitle("Localização e ViaCEP");
    if (enderecoRow) {
      const endRows = Object.keys(enderecoRow).sort().map(k => ({ label: tituloCampoPt(k).toUpperCase(), value: formatValorCampo(k, enderecoRow[k]) }));
      renderFieldsGrid(endRows);
    } else {
      doc.setFont("helvetica", "italic"); doc.setFontSize(10); doc.setTextColor(...colorTextLabel);
      doc.text("(Dados de localização ViaCEP não disponíveis no histórico)", marginX, y);
      y += lh * 2.5;
    }
    
    // Coleções Extras
    const quadro = buildQuadroSocietario(data.qsa, cnpj14);
    addArrayBlock("Quadro Societário", quadro);
    
    const atividades = buildAtividades(data.atividade_principal, data.atividades_secundarias, cnpj14);
    addArrayBlock("Atividades Econômicas (CNAE)", atividades);

    return doc.output("blob");
  }


  function updateExportButtonState() {
    const btn = document.getElementById("btn-exportar");
    if (btn) btn.disabled = !lastConsult || !hasJsPdf();
  }

  // =========================================================================
  // Modal de exportação
  // =========================================================================
  function openModalExport() {
    const modal = document.getElementById("modal-export");
    if (!modal) return;
    modal.hidden = false; document.body.classList.add("modal-open");
    const cancel = document.getElementById("modal-export-cancel");
    if (cancel) cancel.focus();
  }
  function closeModalExport() {
    const modal = document.getElementById("modal-export");
    if (!modal) return;
    modal.hidden = true; document.body.classList.remove("modal-open");
  }

  function initExportModal() {
    const btnExport  = document.getElementById("btn-exportar");
    const modal      = document.getElementById("modal-export");
    const btnExterno = document.getElementById("modal-export-externo");
    const btnLocal   = document.getElementById("modal-export-local");
    const btnCancel  = document.getElementById("modal-export-cancel");

    if (btnExport) btnExport.addEventListener("click", () => { if (!lastConsult || !hasJsPdf()) return; openModalExport(); });
    if (modal) modal.addEventListener("click", (e) => { if (e.target === modal) closeModalExport(); });
    document.addEventListener("keydown", (e) => { if (e.key === "Escape" && modal && !modal.hidden) closeModalExport(); });

    function runExportExterno() {
      if (!lastConsult) return;
      const blob  = buildPdfBlob(lastConsult.cnpj14, lastConsult.data, lastConsult.enderecoRow);
      const fname = "CNPJ_" + lastConsult.cnpj14 + "_" + Date.now() + ".pdf";
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob); a.download = fname; a.click(); URL.revokeObjectURL(a.href);
      closeModalExport();
    }

    function buildUploadFormData(blob, fname) {
      const fd = new FormData();
      try { fd.append("file", new File([blob], fname, { type: "application/pdf" }), fname); }
      catch (e) { fd.append("file", blob, fname); }
      return fd;
    }

    async function runExportLocal() {
      if (!lastConsult) return;
      const blob   = buildPdfBlob(lastConsult.cnpj14, lastConsult.data, lastConsult.enderecoRow);
      const fname  = "CNPJ_" + lastConsult.cnpj14 + "_" + Date.now() + ".pdf";
      const cnpj14 = lastConsult.cnpj14;
      const tryUrls = [staticUrl("/salvar_pdf"), apiUrl("/api/salvar_arquivado"), apiUrl("/api/arquivados")];
      let up = null; let lastNetErr = null;
      for (const url of tryUrls) {
        try {
          up = await fetch(url, { method: "POST", body: buildUploadFormData(blob, fname), credentials: "same-origin", cache: "no-store" });
        } catch (netErr) { lastNetErr = netErr; up = null; continue; }
        if (up.status !== 404) break;
      }
      if (up && redirectIfUnauthorized(up)) return;
      if (up && up.status !== 404) {
        const raw = await up.text();
        let jr = {};
        try { jr = raw ? JSON.parse(raw) : {}; } catch (pe) { showToast("Resposta inválida do servidor. Guardando no navegador…", true); }
        if (up.ok) {
          closeModalExport(); showView("arquivados"); await refreshArquivadosList();
          showToast("PDF salvo no servidor: " + (jr.name || fname)); return;
        }
        if (up.status >= 400) showToast((jr && jr.error) || "Erro do servidor. Guardando no navegador…", true);
      }
      try {
        await idbAddPdf(blob, fname, cnpj14);
        closeModalExport(); showView("arquivados"); await refreshArquivadosList();
        showToast("PDF guardado neste navegador (Arquivados).");
      } catch (eIdb) {
        showToast("Não foi possível guardar: " + (eIdb.message || String(eIdb)), true);
      }
    }

    if (btnExterno) btnExterno.addEventListener("click", (e) => { e.stopPropagation(); try { runExportExterno(); } catch (err) { showToast(err.message || String(err), true); } });
    if (btnLocal) {
      btnLocal.addEventListener("click", async (e) => {
        e.stopPropagation(); btnLocal.disabled = true;
        try { await runExportLocal(); } catch (err) { showToast(err.message || String(err), true); }
        finally { btnLocal.disabled = false; }
      });
    }
    if (btnCancel) btnCancel.addEventListener("click", closeModalExport);
    updateExportButtonState();
  }

  // =========================================================================
  // Validação de CNPJ (client-side)
  // =========================================================================
  function onlyDigits(s) { return String(s || "").replace(/\D/g, ""); }
  function padCNPJ(digits) { return digits.padStart(14, "0").slice(-14); }

  function validateCNPJDigits(cnpj14) {
    if (!cnpj14 || cnpj14.length !== 14) return false;
    if (/^(\d)\1{13}$/.test(cnpj14)) return false;
    let size = cnpj14.length - 2, numbers = cnpj14.substring(0, size), digits = cnpj14.substring(size);
    let sum = 0, pos = size - 7;
    for (let i = size; i >= 1; i--) { sum += parseInt(numbers.charAt(size - i), 10) * pos--; if (pos < 2) pos = 9; }
    let result = sum % 11 < 2 ? 0 : 11 - (sum % 11);
    if (result !== parseInt(digits.charAt(0), 10)) return false;
    size += 1; numbers = cnpj14.substring(0, size); sum = 0; pos = size - 7;
    for (let i = size; i >= 1; i--) { sum += parseInt(numbers.charAt(size - i), 10) * pos--; if (pos < 2) pos = 9; }
    result = sum % 11 < 2 ? 0 : 11 - (sum % 11);
    return result === parseInt(digits.charAt(1), 10);
  }

  function normalizeCNPJInput(raw) {
    const d = onlyDigits(raw);
    if (!d.length) return { ok: false, error: "Informe o CNPJ." };
    if (d.length > 14) return { ok: false, error: "CNPJ com quantidade de dígitos incorreta." };
    const cnpj14 = padCNPJ(d);
    if (!validateCNPJDigits(cnpj14)) return { ok: false, error: "CNPJ inválido. Não atende ao algoritmo da Receita Federal." };
    return { ok: true, cnpj: cnpj14 };
  }

  // =========================================================================
  // Construção de tabelas de resultados
  // =========================================================================
  const SKIP_CADASTRO = new Set(["atividade_principal", "atividades_secundarias", "qsa"]);

  function flattenValue(key, value, out) {
    if (value === null || value === undefined) { out[key] = ""; return; }
    if (typeof value === "object" && !Array.isArray(value)) {
      for (const [k2, v2] of Object.entries(value)) flattenValue(`${key}.${k2}`, v2, out);
      return;
    }
    out[key] = Array.isArray(value) ? JSON.stringify(value) : value;
  }

  function buildCadastroRow(data) {
    const flat = {};
    for (const [k, v] of Object.entries(data)) {
      if (SKIP_CADASTRO.has(k) || k === "billing") continue;
      flattenValue(k, v, flat);
    }
    return Object.keys(flat).sort().map(k => ({ campo: k, valor: flat[k] }));
  }

  function rowsFromArray(arr) {
    return Array.isArray(arr) ? arr.filter(x => x && typeof x === "object") : [];
  }

  function buildQuadroSocietario(qsa, cnpj14) {
    return rowsFromArray(qsa).map(r => Object.assign({}, r, { cnpj: cnpj14 }));
  }

  function buildAtividades(atividadePrincipal, atividadesSecundarias, cnpj14) {
    const out = [];
    rowsFromArray(atividadePrincipal).forEach(r => out.push(Object.assign({}, r, { tipo: "principal", cnpj: cnpj14 })));
    rowsFromArray(atividadesSecundarias).forEach(r => out.push(Object.assign({}, r, { tipo: "secundaria", cnpj: cnpj14 })));
    return out;
  }

  function renderKeyValueTable(container, rows) {
    if (!rows.length) { container.innerHTML = '<p class="mensagem info">Sem dados.</p>'; return; }
    let html = '<table class="data data-kv"><tbody>';
    rows.forEach(row => {
      html += `<tr><td>${escapeHtml(tituloCampoPt(row.campo))}</td><td>${escapeHtml(formatValorCampo(row.campo, row.valor))}</td></tr>`;
    });
    html += "</tbody></table>";
    container.innerHTML = html;
  }

  function renderObjectTable(container, rows) {
    if (!rows.length) { container.innerHTML = '<p class="mensagem info">Sem registros.</p>'; return; }
    const keys = Array.from(new Set(rows.flatMap(r => Object.keys(r)))).sort();
    let html = '<table class="data"><thead><tr>' + keys.map(k => `<th>${escapeHtml(tituloCampoPt(k))}</th>`).join("") + "</tr></thead><tbody>";
    rows.forEach(r => {
      html += "<tr>" + keys.map(k => {
        const v = r[k];
        return `<td>${escapeHtml(v === undefined || v === null ? "" : formatValorCampo(k, v))}</td>`;
      }).join("") + "</tr>";
    });
    html += "</tbody></table>";
    container.innerHTML = html;
  }

  // =========================================================================
  // ViaCEP
  // =========================================================================
  function parseCepForViaCep(cepRaw) {
    const cep = onlyDigits(String(cepRaw || ""));
    if (cep.length < 8) return { ok: false };
    return { ok: true, cep: cep.slice(0, 8) };
  }

  async function fetchViaCep(cepDigits) {
    const r = await fetch(VIACEP_BASE + cepDigits + "/json/");
    if (!r.ok) throw new Error("ViaCEP: falha na requisição.");
    return r.json();
  }

  function buildEnderecoRow(viaJson, nome, numero) {
    if (!viaJson || viaJson.erro) return null;
    const row = Object.assign({}, viaJson);
    delete row.ibge; delete row.gia;
    row.nome = nome; row.numero = numero;
    row.data_consulta = new Date().toISOString().slice(0, 10);
    return row;
  }

  function renderEndereco(container, row) {
    if (!row) { container.innerHTML = '<p class="mensagem info">CEP inválido ou não encontrado.</p>'; return; }
    renderKeyValueTable(container, Object.keys(row).sort().map(k => ({ campo: k, valor: row[k] })));
  }

  // =========================================================================
  // Layout de resultado (split animado)
  // =========================================================================
  function setMessage(el, text, type) {
    el.textContent = text || "";
    el.classList.remove("erro", "info");
    if (type === "erro") el.classList.add("erro");
    else if (type === "info") el.classList.add("info");
  }

  function setConsultaResultsVisible(show) {
    const wrap       = document.getElementById("resultados-wrap");
    const split      = document.getElementById("consulta-split");
    const panelExport = document.getElementById("panel-export");
    if (!wrap || !split) return;
    if (panelExport) panelExport.classList.toggle("hidden", !show);
    if (show) {
      wrap.classList.remove("hidden");
      selectTabByIndex(0);
      requestAnimationFrame(() => requestAnimationFrame(() => split.classList.add("has-results")));
    } else {
      split.classList.remove("has-results");
      wrap.classList.add("hidden");
    }
  }

  // =========================================================================
  // Boot
  // =========================================================================
  initTheme();
  initTabs();
  initNavigation();
  initRouter();
  initTopbarFilter();
  initSettings();
  initLogout();

  // =========================================================================
  // Inicialização do Logotipo (Pre-loading para PDF)
  // =========================================================================
  async function preloadLogo() {
    try {
      const resp = await fetch("/logo.png");
      if (!resp.ok) return;
      const blob = await resp.blob();
      const reader = new FileReader();
      reader.onloadend = () => {
        window._cachedLogoBase64 = reader.result;
      };
      reader.readAsDataURL(blob);
    } catch (e) {
      console.warn("Falha ao pré-carregar logotipo para o PDF:", e);
    }
  }

  preloadLogo();
  initExportModal();
  initPinButton();
  initAutocomplete();
  initEnriquecimento();
  renderListaSalvas(getTopbarFilterQuery());

  window.addEventListener("load", updateExportButtonState);

  // =========================================================================
  // Submit do formulário de consulta
  // =========================================================================
  document.getElementById("form-consulta").addEventListener("submit", async function (e) {
    e.preventDefault();
    const input = document.getElementById("cnpj");
    const msg   = document.getElementById("mensagem");
    const btn   = document.getElementById("btn-consultar");
    const norm  = normalizeCNPJInput(input.value);

    if (!norm.ok) {
      setMessage(msg, norm.error, "erro");
      lastConsult = null; currentPinned = false;
      updateExportButtonState(); updatePinButton();
      setConsultaResultsVisible(false);
      return;
    }

    btn.disabled = true;
    setMessage(msg, "Consultando…", "info");
    setConsultaResultsVisible(false);

    const outCadastro    = document.getElementById("out-cadastro");
    const outQuadro      = document.getElementById("out-quadro");
    const outAtividades  = document.getElementById("out-atividades");
    const outEndereco    = document.getElementById("out-endereco");

    try {
      const url = apiUrl("/api/cnpj/" + encodeURIComponent(norm.cnpj));
      const res = await fetch(url, { credentials: "same-origin", cache: "no-store" });
      if (redirectIfUnauthorized(res)) return;
      const data = await res.json().catch(() => ({}));

      if (!res.ok) throw new Error(data.error || res.statusText || "Falha ao consultar CNPJ.");
      if (!data || typeof data !== "object" || data.status === "ERROR") {
        throw new Error(data && data.message ? data.message : "CNPJ não encontrado na ReceitaWS.");
      }

      const cnpj14 = norm.cnpj;
      renderKeyValueTable(outCadastro, buildCadastroRow(data));
      renderObjectTable(outQuadro, buildQuadroSocietario(data.qsa, cnpj14));
      renderObjectTable(outAtividades, buildAtividades(data.atividade_principal, data.atividades_secundarias, cnpj14));

      const parsed = parseCepForViaCep(data.cep);
      let enderecoRow = null;
      if (parsed.ok) {
        try { const via = await fetchViaCep(parsed.cep); enderecoRow = buildEnderecoRow(via, data.nome || "", data.numero || ""); }
        catch (err) { enderecoRow = null; }
      }
      renderEndereco(outEndereco, enderecoRow);

      // Salva resultado e reseta pin (novo CNPJ não está fixado até o user clicar)
      lastConsult    = { cnpj14, data, enderecoRow };
      currentPinned  = false;
      updateExportButtonState();
      updatePinButton();
      setConsultaResultsVisible(true);
      setMessage(msg, "CNPJ " + formatCnpj(cnpj14) + " encontrado.", "info");

      // Verifica no backend se este CNPJ já está fixado (backend já fez upsert via /api/cnpj)
      try {
        const checkR = await fetch(apiUrl("/api/entidades/" + encodeURIComponent(cnpj14)), {
          credentials: "same-origin", cache: "no-store",
        });
        if (checkR.ok) {
          const ent = await checkR.json();
          if (ent && ent.pinned) {
            currentPinned = true;
            updatePinButton();
          }
        }
      } catch (e) {}

    } catch (err) {
      setMessage(msg, err.message || String(err), "erro");
      lastConsult = null; currentPinned = false;
      updateExportButtonState(); updatePinButton();
      setConsultaResultsVisible(false);
    } finally {
      btn.disabled = false;
    }
  });

})();
