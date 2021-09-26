# Serve static files with HTTP

Serve static files with:

- charset **utf-8** for text file types
- **etags**
- optional server side include (**SSI**) processing

## Usage (CLI)

```
npm install -g fs-serve
fs-serve 4000 .
```

Serve the content of this directory. Directory listing are enabled.

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
  ssi: false,
  maxAge: 2,
});
```

- directoryList - set to **true** to enable directory lists - default **false**
- ssi - set to **true** to enable SSI processing for .shtml files - default **false**
- log - provide a callback for custom logging, or set to falsy to disable logging - default **console.log**
- maxAge - how many seconds a client should cache a response - default **2** seconds

```javascript
// Serve a request in an existing web server:
server.serve(request, response);

// Create an http server and listen on port:
server.listen(port);
```

## Server side includes (SSI)

If enabled, .shtml files will be processed and directives of this kind will processed

```
<!--#include virtual="head.html"-->
```

The referenced file will be resolved relative to the .shtml file and will itself be processed for SSI directives.

No other SSI directives will be processed.
