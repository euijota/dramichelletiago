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
    shell.openExternal(url);
    return { action: "deny" };
  });

  win.webContents.on("will-navigate", (event, url) => {
    if (!isInternal(url)) {
      event.preventDefault();
      shell.openExternal(url);
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
