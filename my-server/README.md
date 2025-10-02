# SOCKS5 Proxy Server

A simple SOCKS5 proxy server implementation in Node.js that supports:
- TCP connection tunneling
- Username/password authentication
- Connection logging
- Configurable listening port

## Features

- Accepts incoming client connections
- Forwards traffic to requested destinations (TCP tunneling)
- Logs each connection (source IP, destination host/port)
- Configurable listening port via environment variables
- Username/password authentication

## Requirements

- Node.js (v12 or higher recommended)

## Installation

1. Clone this repository
2. Install dependencies:
```
npm install
```

## Configuration

The proxy server can be configured using environment variables:

- `PORT`: The port on which the proxy server will listen (default: 1080)
- `SOCKS_USER`: Username for authentication (default: "testuser")
- `SOCKS_PASS`: Password for authentication (default: "testpass")

You can set these variables in a `.env` file or directly when running the server.

## Running the Proxy Server

Start the server with default settings:

```
node proxy.js
```

Or with custom configuration:

```
PORT=8080 SOCKS_USER=myuser SOCKS_PASS=mypassword node proxy.js
```

## Testing with curl

You can test the proxy using curl with the `--socks5` flag:

```
curl --socks5 localhost:1080 -U testuser:testpass https://ipinfo.io
```

This command will:
1. Connect to your SOCKS5 proxy running on localhost:1080
2. Authenticate with the username "testuser" and password "testpass"
3. Request https://ipinfo.io through the proxy
4. Display your apparent IP address and location information

## Implementation Details

This SOCKS5 proxy implements the core functionality as specified in:
- RFC 1928 (SOCKS Protocol Version 5)
- RFC 1929 (Username/Password Authentication for SOCKS V5)

The implementation includes:
- SOCKS5 handshake and method negotiation
- Username/password authentication
- TCP CONNECT command support
- Domain name resolution
- IPv4 address handling

## Limitations

- Only supports TCP CONNECT command (no BIND or UDP ASSOCIATE)
- Limited IPv6 support
- No support for GSSAPI authentication

## License

ISC