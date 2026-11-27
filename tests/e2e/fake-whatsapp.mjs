// Webhook falso de WhatsApp para o e2e: POST /hook guarda a mensagem, GET /messages lista,
// DELETE /messages limpa. Nada sai da máquina.
import http from "node:http";

const port = Number(process.argv[2] || 8788);
let messages = [];

http
  .createServer((req, res) => {
    if (req.method === "POST" && req.url === "/hook") {
      let body = "";
      req.on("data", (c) => (body += c));
      req.on("end", () => {
        messages.push(JSON.parse(body || "{}"));
        res.end("ok");
      });
      return;
    }
    if (req.url === "/messages") {
      if (req.method === "DELETE") messages = [];
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify(messages));
      return;
    }
    res.statusCode = 404;
    res.end();
  })
  .listen(port, "127.0.0.1");
