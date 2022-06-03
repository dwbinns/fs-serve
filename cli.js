#!/usr/bin/env node
const Server = require(".");

(async (directory = ".", requestPort, host = "localhost") => {
    console.log("fs-serve [<directory>] [<port>]");
    if (requestPort && isNaN(Number(requestPort))) return;

    let server = new Server(directory, { directoryList: true });

    let {address, port} = await server.listen(requestPort || 4000, host).catch(e => server.listen(requestPort, host));
    console.log(`Server started http://${address}:${port}/`);
})(...process.argv.slice(2));