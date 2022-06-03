# Serve static files with HTTP

Serve static files with:

- charset **utf-8** for text file types
- **etags**

## Usage (CLI)

```
npm install -g fs-serve
fs-serve
```

Serve the content of this directory. Directory listing are enabled.

```
fs-serve www 3333
```

Serve the content of the wwww on port 3333 to localhost

```
fs-serve www 3333 0.0.0.0
```

Serve the content of the wwww on port 3333 on all networks


## Usage (JS)

```
npm install fs-serve
```

```javascript
import Server from "fs-serve";

new Server(".").listen(3000);
```

## API

```javascript
// Create a new server
const server = new Server(directory, {
  directoryList: false,
  log: (url, statusCode, result) => console.log(url, statusCode, result),
  maxAge: 2,
});
```

- directoryList - set to **true** to enable directory lists - default **false**
- log - provide a callback for custom logging, or set to falsy to disable logging - default **console.log**
- maxAge - how many seconds a client should cache a response - default **2** seconds

```javascript
// Serve a request in an existing web server:
server.serve(request, response);

// Create an http server and listen on port and host:
server.listen(port, host);
```
The port will be selected automatically if omitted, and the server will listen on all addresses if the host is omitted.
See https://nodejs.org/api/net.html#serverlisten for details.

