// Service worker mínimo (instalabilidade da PWA).
// Estratégia: pass-through — nenhuma resposta é cacheada.
// O painel é dinâmico (dados clínicos em tempo real) e o agendamento
// público consulta disponibilidade ao vivo; cache offline seria um risco.
self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", () => {
  // Pass-through intencional: sempre rede.
});
