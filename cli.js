#!/usr/bin/env node
const {createServer} = require("http");
const Server = require(".");

(async(port = 4000, directory = ".") => {
    let server = new Server(directory);

    createServer((req, res) => {
        server.serve(req, res);
    }).listen(port);

    console.log(`Server started http://localhost:${port}/`);

})(...process.argv.slice(2));