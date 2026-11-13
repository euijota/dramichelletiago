const { app, BrowserWindow, shell, Menu } = require("electron");
const path = require("path");

// Wrapper desktop do painel web (https://dramichelletiago.com.br/painel).
// Autenticação Supabase e cookies persistem no userData do app entre sessões.
const ORIGIN = "https://dramichelletiago.com.br";
const APP_URL = `${ORIGIN}/painel`;

let win = null;

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
}

function isInternal(url) {
  return url.startsWith(ORIGIN);
}

// Windows tem o app WhatsApp Desktop: converte links de WhatsApp (wa.me,
// api.whatsapp.com, web.whatsapp.com) para o esquema whatsapp:// para abrir
// direto no app com a conversa pronta. Se o app não estiver instalado,
// cai para o navegador com a URL original. No Mac mantemos o navegador.
function openExternal(url) {
  const isWhatsAppLink = /^https?:\/\/(wa\.me|api\.whatsapp\.com|web\.whatsapp\.com)/.test(url);
  if (process.platform === "win32" && isWhatsAppLink) {
    try {
      const u = new URL(url);
      const phone = u.searchParams.get("phone") ?? (u.pathname.match(/\d{10,15}/) ?? [null])[0];
      const text = u.searchParams.get("text");
      if (phone) {
        const target = `whatsapp://send?phone=${phone}${text ? `&text=${encodeURIComponent(text)}` : ""}`;
        return shell.openExternal(target).catch(() => shell.openExternal(url));
      }
    } catch {
      // URL inválida para o esquema: cai para o navegador abaixo.
    }
  }
  return shell.openExternal(url);
}

function createWindow() {
  win = new BrowserWindow({
    width: 1360,
    height: 900,
    minWidth: 980,
    minHeight: 640,
    title: "Painel — Dra. Michelle",
    backgroundColor: "#FAF5F5",
    autoHideMenuBar: true,
    show: false,
    icon: path.join(__dirname, "build", "icon.png"),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  win.loadURL(APP_URL);
  win.once("ready-to-show", () => win.show());

  // Links externos (wa.me, tel:, Google Calendar...) abrem no navegador/sistema,
  // nunca dentro do webview do painel.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (isInternal(url)) {
      return { action: "allow", overrideBrowserWindowOptions: { autoHideMenuBar: true } };
    }
    openExternal(url);
    return { action: "deny" };
  });

  win.webContents.on("will-navigate", (event, url) => {
    if (!isInternal(url)) {
      event.preventDefault();
      openExternal(url);
    }
  });
  win.webContents.on("render-process-gone", (_event, details) => {
    if (details.reason !== "clean-exit") {
      win.reload();
    }
  });

  win.on("closed", () => {
    win = null;
  });
}

const menuTemplate =
  process.platform === "darwin"
    ? [{ role: "appMenu" }, { role: "editMenu" }, { role: "viewMenu" }, { role: "windowMenu" }]
    : [{ role: "editMenu" }, { role: "viewMenu" }];

app.on("second-instance", () => {
  if (win) {
    if (win.isMinimized()) win.restore();
    win.focus();
  }
});

app.whenReady().then(() => {
  Menu.setApplicationMenu(Menu.buildFromTemplate(menuTemplate));
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
