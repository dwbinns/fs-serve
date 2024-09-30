#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import Server from "./index.js";
import child_process from "child_process";

(async (...options) => {
    let directory = ".", listenPort, listenHost = "localhost", open = false, ssi = [], maxAge, extensions = [], key, cert;
    while (options.length) {
        let option = options.shift();
        if (option == "path") directory = options.shift();
        else if (option == "port") listenPort = Number(options.shift());
        else if (option == "host") listenHost = options.shift();
        else if (option == "open") open = true;
        else if (option == "age") maxAge = Number(options.shift());
        else if (option == "https") [key, cert] = await Promise.all(options.splice(0, 2).map(name => readFile(name)))
        else if (option == "extensions") extensions.push(...options.shift().split(","));
        else {
            if (option != 'help') console.log("Unknown option:", option);
            console.log("fs-serve [path <directory>] [port <port>] [host <host>] [ssi.<extension> <handlers>] [open] [extensions <extensions>] [age <maxAge>]");
            console.log("path: content served from this directory (the current directory by default)");
            console.log("port: listen on the specified port (4000 by default)");
            console.log("host: listen on the specified host (localhost by default)");
            console.log("https <key.pem> <cert.pem>: use HTTPS with the given private key and certificate");
            console.log("open: open the default browser");
            console.log("extension: add one of a comma separated list of extensions to find files (disabled by default)");
            console.log("age: the max-age header will be set to this value (in seconds, 2 by default)");
            console.log("See https://github.com/dwbinns/fs-serve for further documentation");
            process.exit(1);
        }
    }

    let server = new Server(directory, { directoryList: true, ssi, extensions, maxAge });

    let listenOptions = {key, cert};

    let { address, port, family } = (await server.listen(listenPort || 4000, listenHost, listenOptions).catch(e => server.listen(listenPort, listenHost, listenOptions))).address();
    let url = `http://${family == "IPv6" ? `[${address}]` : address}:${port}/`;
    console.log("For help run: fs-serve help");
    console.log(`Server started ${url}`);

    if (open) {
        let command = {
            darwin: 'open',
            win32: 'start',
            linux: 'xdg-open'
        }[process.platform];
        if (command) child_process.execFileSync(command, [url]);
    }
})(...process.argv.slice(2));