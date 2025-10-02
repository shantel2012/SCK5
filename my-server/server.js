require("dotenv").config();
const http = require("http");

const PORT = process.env.PORT || 3000;
const USER = process.env.SOCKS_USER || "defaultuser";
const PASS = process.env.SOCKS_PASS || "defaultpass";

// Simple HTTP server
const server = http.createServer((req, res) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  res.writeHead(200, { "Content-Type": "text/plain" });
  res.end(`Hello! Server running on port ${PORT}\nConfigured user: ${USER}`);
});

server.listen(PORT, () => {
  console.log(
    `${new Date().toISOString()} Server listening on http://localhost:${PORT}`
  );
});
