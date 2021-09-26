#!/usr/bin/env node
const Server = require(".");

(async (port = 4000, directory = ".") => {
    console.log("fs-serve [<port>] [<directory>]");

    new Server(directory, { directoryList: true }).listen(Number(port));

    console.log(`Server started http://localhost:${port}/`);
})(...process.argv.slice(2));