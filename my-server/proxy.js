// socks5-proxy.js
// Minimal SOCKS5 proxy with username/password auth (RFC1928 + RFC1929 basics).
// Uses only Node.js standard library (net, dns).
// Run: PORT=1080 SOCKS_USER=myuser SOCKS_PASS=mypass node socks5-proxy.js

const net = require('net');
const dns = require('dns');

const PORT = parseInt(process.env.PORT, 10) || 1080;
const SOCKS_USER = process.env.SOCKS_USER || 'testuser';
const SOCKS_PASS = process.env.SOCKS_PASS || 'testpass';

function log(...args) {
  console.log(new Date().toISOString(), ...args);
}

function parseUint16(buf, offset = 0) {
  return buf.readUInt16BE(offset);
}

function sendSocksReply(socket, replyCode, boundAddr = '0.0.0.0', boundPort = 0) {
  // Build reply: VER(0x05) REP RSV(0x00) ATYP BND.ADDR BND.PORT
  const parts = [];
  parts.push(Buffer.from([0x05, replyCode, 0x00])); // VER REP RSV
  // We send IPv4 BND.ADDR always for simplicity
  const addrBuf = Buffer.alloc(4);
  const addrParts = boundAddr.split('.').map(n => parseInt(n, 10) || 0);
  addrBuf[0] = addrParts[0] || 0;
  addrBuf[1] = addrParts[1] || 0;
  addrBuf[2] = addrParts[2] || 0;
  addrBuf[3] = addrParts[3] || 0;
  parts.push(Buffer.from([0x01])); // ATYP = IPv4
  parts.push(addrBuf);
  const portBuf = Buffer.alloc(2);
  portBuf.writeUInt16BE(boundPort || 0, 0);
  parts.push(portBuf);
  socket.write(Buffer.concat(parts));
}

const server = net.createServer((clientSocket) => {
  clientSocket.once('error', (err) => {
    log('Client socket error:', err.message);
    clientSocket.destroy();
  });

  const clientAddr = `${clientSocket.remoteAddress}:${clientSocket.remotePort}`;
  log('New client', clientAddr);

  // Step 1: SOCKS5 greeting
  clientSocket.once('data', async (data) => {
    try {
      if (data.length < 2 || data[0] !== 0x05) {
        log('Unsupported SOCKS version from', clientAddr);
        clientSocket.end();
        return;
      }

      const nMethods = data[1];
      const methods = data.slice(2, 2 + nMethods);
      // We require username/password method (0x02). If client offers it, select it.
      const METHOD_USERNAME = 0x02;
      const METHOD_NOAUTH = 0x00;
      let selected = 0xFF;
      for (let b of methods) {
        if (b === METHOD_USERNAME) { selected = METHOD_USERNAME; break; }
      }
      if (selected === 0xFF) {
        // No acceptable methods -> reply 0xFF and close
        clientSocket.write(Buffer.from([0x05, 0xFF]));
        clientSocket.end();
        log('No supported auth methods offered, closing', clientAddr);
        return;
      }

      // send method selection
      clientSocket.write(Buffer.from([0x05, selected]));

      // If username/password auth, perform subnegotiation per RFC1929
      if (selected === METHOD_USERNAME) {
        // read username/password auth frame
        clientSocket.once('data', (authData) => {
          try {
            // authData: VER(0x01) ULEN UNAME PLEN PASSWD
            if (authData.length < 2 || authData[0] !== 0x01) {
              clientSocket.end();
              return;
            }
            const ulen = authData[1];
            if (authData.length < 2 + ulen + 1) {
              clientSocket.end();
              return;
            }
            const uname = authData.slice(2, 2 + ulen).toString('utf8');
            const plen = authData[2 + ulen];
            const passwd = authData.slice(2 + ulen + 1, 2 + ulen + 1 + plen).toString('utf8');

            if (uname === SOCKS_USER && passwd === SOCKS_PASS) {
              // success
              clientSocket.write(Buffer.from([0x01, 0x00]));
            } else {
              clientSocket.write(Buffer.from([0x01, 0x01])); // fail
              clientSocket.end();
              log('Auth failed for client', clientAddr, 'username=', uname);
              return;
            }

            // proceed to request phase
            clientSocket.once('data', (reqBuf) => {
              handleSocksRequest(reqBuf, clientSocket, clientAddr);
            });
          } catch (err) {
            log('Auth processing error', err.message);
            clientSocket.end();
          }
        });
      } else {
        // noauth selected (not expected in our config) — proceed to request
        clientSocket.once('data', (reqBuf) => {
          handleSocksRequest(reqBuf, clientSocket, clientAddr);
        });
      }
    } catch (err) {
      log('Greeting handling error:', err.message);
      clientSocket.end();
    }
  });
});

function handleSocksRequest(reqBuf, clientSocket, clientAddr) {
  try {
    // Request: VER(0x05) CMD RSV(0x00) ATYP DST.ADDR DST.PORT
    if (reqBuf.length < 7 || reqBuf[0] !== 0x05) {
      log('Invalid request from', clientAddr);
      clientSocket.end();
      return;
    }
    const cmd = reqBuf[1];
    const atyp = reqBuf[3];

    if (cmd !== 0x01) { // only CONNECT supported
      sendSocksReply(clientSocket, 0x07); // command not supported
      clientSocket.end();
      log('Unsupported CMD from', clientAddr, 'cmd=', cmd);
      return;
    }

    let destHost = null;
    let destPort = null;
    let offset = 4;

    if (atyp === 0x01) { // IPv4
      if (reqBuf.length < offset + 6) { clientSocket.end(); return; }
      const addrBytes = reqBuf.slice(offset, offset + 4);
      destHost = `${addrBytes[0]}.${addrBytes[1]}.${addrBytes[2]}.${addrBytes[3]}`;
      offset += 4;
      destPort = reqBuf.readUInt16BE(offset);
    } else if (atyp === 0x03) { // domain
      const len = reqBuf[offset];
      offset += 1;
      destHost = reqBuf.slice(offset, offset + len).toString('utf8');
      offset += len;
      destPort = reqBuf.readUInt16BE(offset);
    } else if (atyp === 0x04) { // ipv6
      // Not implemented in detail — reject
      sendSocksReply(clientSocket, 0x08); // address type not supported
      clientSocket.end();
      log('IPv6 not supported, from', clientAddr);
      return;
    } else {
      sendSocksReply(clientSocket, 0x08);
      clientSocket.end();
      return;
    }

    // Log the connection attempt
    log('CONNECT from', clientAddr, '->', `${destHost}:${destPort}`);

    // Resolve domain if needed
    const connectToTarget = (ip) => {
      const remote = net.createConnection({ host: ip, port: destPort }, () => {
        // On success, send success reply (REP = 0x00). BND.ADDR/BND.PORT are local addr/port of connection.
        const local = remote.localAddress || '0.0.0.0';
        const localPort = remote.localPort || 0;
        // Use IPv4 presentation for BND.ADDR
        sendSocksReply(clientSocket, 0x00, local, localPort);

        // Pipe data both ways
        clientSocket.pipe(remote);
        remote.pipe(clientSocket);

        // Logging close
        remote.on('close', () => {
          log('Closed tunnel', clientAddr, '->', `${destHost}:${destPort}`);
        });
      });

      remote.on('error', (err) => {
        log('Remote connection error to', `${ip}:${destPort}`, err.message);
        sendSocksReply(clientSocket, 0x05); // connection refused / general failure
        clientSocket.end();
      });
    };

    if (atyp === 0x03) {
      // resolve domain to first A record (simple)
      dns.lookup(destHost, { family: 4 }, (err, address) => {
        if (err) {
          log('DNS lookup failed for', destHost, err.message);
          sendSocksReply(clientSocket, 0x04); // host unreachable
          clientSocket.end();
          return;
        }
        connectToTarget(address);
      });
    } else {
      connectToTarget(destHost);
    }

  } catch (err) {
    log('Error handling request:', err.message);
    sendSocksReply(clientSocket, 0x01);
    clientSocket.end();
  }
}

server.on('error', (err) => {
  log('Server error:', err.message);
});

server.listen(PORT, () => {
  log(`SOCKS5 proxy listening on 0.0.0.0:${PORT}`);
  log(`Configured user=${SOCKS_USER} (use env SOCKS_USER / SOCKS_PASS to change)`);
});
