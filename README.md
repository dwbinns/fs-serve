# Serve static files with HTTP

Serve static files with:

- configurable directory listing
- a wide range of pre-configured mime-types
- charset **utf-8** for text file types
- configurable caching (including **etags** and custom **max-age**)
- streamed responses

## Usage (CLI)

Serve the content of this directory. Directory listing are enabled:
```
npm install -g fs-serve
fs-serve
```

Serve the content of the wwww on port 3333 to localhost:
```
fs-serve path www port 3333
```

## Usage (JS)

```
npm install fs-serve
```

Note that only ES module imports are supported (not `require`)

```js
import Server from "fs-serve";

let httpServer = await new Server("www").listen(3000);
console.log(await (await fetch("http://localhost:3000/")).text());
httpServer.close();
```

## API

```js
import Server from "fs-serve";

let directory = "www";
// Create a new server
const server = new Server(directory, {
  directoryList: false,
  log: (url, statusCode, result) => console.log(url, statusCode, result),
  maxAge: 2,
  ssi: {
    extension: ".shtml",
    handlers: [Server.includeVirtual]
  }
});
```

- directoryList - set to **true** to enable directory lists - default **false**
- log - provide a callback for custom logging, or set to falsy to disable logging - default **console.log**
- maxAge - how many seconds a client should cache a response - default **2** seconds
- ssi - a list of extensions with SSI handlers

Serve a request in an existing web server:

```js
import Server from "fs-serve";
import http from "http";

const server = new Server("www");

http.createServer((req, res) => server.serve(request, response));
```

Create an http server and listen on port and host:

```js
import Server from "fs-serve";

let port = 4444;
let host = "localhost";
let httpServer = await new Server("www").listen(port, host);
httpServer.close();
```

The port will be selected automatically if omitted, and the server will listen on all addresses if the host is omitted.
See https://nodejs.org/api/net.html#serverlisten for details.

