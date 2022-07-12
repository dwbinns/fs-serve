const { createReadStream } = require('fs');
const { stat, readFile, readdir } = require('fs/promises');
const { join, extname, dirname } = require('path');
const { createServer, get } = require("http");
const { once } = require('events');

const mime = {
    shtml: 'text/html; charset=UTF-8',
    mp4: 'video/mp4',
    flv: 'video/x-flv',
    md: 'text/markdown',
    // Following from:
    // https://developer.mozilla.org/en-US/docs/Web/HTTP/Basics_of_HTTP/MIME_types/Common_types
    aac: 'audio/aac',
    abw: 'application/x-abiword',
    arc: 'application/x-freearc',
    avi: 'video/x-msvideo',
    azw: 'application/vnd.amazon.ebook',
    bin: 'application/octet-stream',
    bmp: 'image/bmp',
    bz: 'application/x-bzip',
    bz2: 'application/x-bzip2',
    csh: 'application/x-csh',
    css: 'text/css',
    csv: 'text/csv',
    doc: 'application/msword',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    eot: 'application/vnd.ms-fontobject',
    epub: 'application/epub+zip',
    gz: 'application/gzip',
    gif: 'image/gif',
    htm: 'text/html',
    html: 'text/html',
    ico: 'image/vnd.microsoft.icon',
    ics: 'text/calendar',
    jar: 'application/java-archive',
    jpeg: 'image/jpeg',
    jpg: 'image/jpeg',
    js: 'text/javascript',
    json: 'application/json',
    jsonld: 'application/ld+json',
    mid: 'audio/midi audio/x-midi',
    midi: 'audio/midi audio/x-midi',
    mjs: 'text/javascript',
    mp3: 'audio/mpeg',
    mpeg: 'video/mpeg',
    mpkg: 'application/vnd.apple.installer+xml',
    odp: 'application/vnd.oasis.opendocument.presentation',
    ods: 'application/vnd.oasis.opendocument.spreadsheet',
    odt: 'application/vnd.oasis.opendocument.text',
    oga: 'audio/ogg',
    ogv: 'video/ogg',
    ogx: 'application/ogg',
    opus: 'audio/opus',
    otf: 'font/otf',
    png: 'image/png',
    pdf: 'application/pdf',
    php: 'application/x-httpd-php',
    ppt: 'application/vnd.ms-powerpoint',
    pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    rar: 'application/vnd.rar',
    rtf: 'application/rtf',
    sh: 'application/x-sh',
    svg: 'image/svg+xml',
    swf: 'application/x-shockwave-flash',
    tar: 'application/x-tar',
    tif: 'image/tiff',
    tiff: 'image/tiff',
    ts: 'video/mp2t',
    ttf: 'font/ttf',
    txt: 'text/plain',
    vsd: 'application/vnd.visio',
    wav: 'audio/wav',
    weba: 'audio/webm',
    webm: 'video/webm',
    webp: 'image/webp',
    woff: 'font/woff',
    woff2: 'font/woff2',
    xhtml: 'application/xhtml+xml',
    xls: 'application/vnd.ms-excel',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    xml: 'text/xml',
    xul: 'application/vnd.mozilla.xul+xml',
    zip: 'application/zip',
    '3gp': 'video/3gpp',
    '3g2': 'video/3gpp2',
    '7z': 'application/x-7z-compressed',
};

function escapeEntities(text) {
    return text.replace(/[<>&'"]/g, function (c) {
        switch (c) {
            case '<': return '&lt;';
            case '>': return '&gt;';
            case '&': return '&amp;';
            case '\'': return '&apos;';
            case '"': return '&quot;';
        }
    });
}

async function consume(stream) {
    let blocks = [];
    for await (let block of stream) blocks.push(block);
    return Buffer.concat(blocks);
}

const header = `<!DOCTYPE html>
<html>
<head><title>List</title></head>
<body>
`;

const trailer = `
</body>
</html>
`;

const indexDocuments = ["index.html", "index.shtml"];

const extensions = ["html", "shtml"];

async function asyncRegexpReplace(input, regex, replacer) {
    const substrs = [];
    let match;
    let index = 0;
    while ((match = regex.exec(input)) !== null) {
        substrs.push(input.slice(index, match.index));
        substrs.push(replacer(...match));
        index = regex.lastIndex;
    }
    substrs.push(input.slice(index));
    return (await Promise.all(substrs)).join('');
};

const defaultLog = (url, statusCode, result) => console.log("Request", url, statusCode, result);

class Server {
    constructor(root, { log = defaultLog, directoryList, ssi = [], maxAge = 2 } = {}) {
        this.root = root;
        this.directoryList = directoryList;
        this.ssi = ssi;
        this.maxAge = maxAge;
        this.log = log;
    }

    async listen(port, host) {
        let server = createServer((req, res) => this.serve(req, res));
        server.listen(port, host);
        await once(server, "listening");
        return server.address();
    }

    async serve(req, res) {
        try {
            let requestURL = new URL(req.url, "http://localhost");

            let result = await this.serveRelative(decodeURI(requestURL.pathname), req, res);
            this.log?.(req.url, res.statusCode, result);
        } catch (e) {
            console.error("Request processing error", e);
            this.serve500(req, res);
        }
    }

    async serveRelative(path, req, res) {
        return await this.servePath(join(this.root, path), req, res);
    }

    async servePath(filename, req, res) {
        let stats = await stat(filename).catch(e => null);
        if (!stats) {
            for (let extension of extensions) {
                let filePath = filename + '.' + extension;
                let fileStats = await stat(filePath).catch(() => null);
                if (fileStats?.isFile()) {
                    return await this.serveFile(filePath, fileStats, req, res);
                }
            }
            while (dirname(filename) != filename) {
                filename = dirname(filename);
                if (!filename.startsWith(this.root)) break;
                let parentStats = await stat(filename).catch(() => null);
                if (parentStats?.isFile()) {
                    return await this.serveFile(filename, parentStats, req, res);
                }
            }
        } else {
            if (stats.isDirectory()) return await this.serveDirectory(filename, stats, req, res);
            if (stats.isFile()) return await this.serveFile(filename, stats, req, res);
        }
        return this.serve404(req, res);
    }

    async serveIndexList(pathname, req, res) {
        if (!this.directoryList) {
            return this.serve404(req, res);
        }
        res.writeHeader(200, {});

        let lines = (await readdir(pathname, { withFileTypes: true }))
            .filter(entry => !entry.name.startsWith("."))
            .map(entry => {
                return `<div><a href='./${encodeURI(escapeEntities(entry.name) + (entry.isDirectory() ? "/" : ""))}'>${escapeEntities(entry.name)}</a></div>`
            });

        res.end(header + lines.join("") + trailer);
    }

    serve500(req, res) {
        res.writeHeader(500, {});
        res.end();
        return "";
    }

    serve404(req, res) {
        res.writeHeader(404, {});
        res.end();
        return "";
    }

    serveRedirect(req, res, location) {
        res.writeHeader(301, { Location: location });
        res.end();
        return location;
    }

    serveRedirectSlash(req, res) {
        return this.serveRedirect(req, res, req.url + "/");
    }

    async serveDirectory(filename, stats, req, res) {
        if (!filename.endsWith('/')) {
            return this.serveRedirectSlash(req, res);
        } else {
            for (let indexDocument of indexDocuments) {
                if (await stat(join(filename, indexDocument)).catch(e => false)) {
                    return await this.servePath(filename + indexDocument, req, res);
                }
            }
            return this.serveIndexList(filename, req, res);
        }
    }

    async serveFile(filename, stats, request, res) {
        let headers = {};
        headers['Cache-Control'] = `max-age = ${this.maxAge}`;

        let ext = extname(filename).slice(1);

        let mimeType = mime[ext] || 'application/octet-stream';
        if (mimeType.startsWith("text/")) mimeType += "; charset=UTF-8";
        headers['Content-Type'] = mimeType;

        let ssiHandlers = this.ssi.find(({ extension }) => extension == ext)?.handlers;
        if (ssiHandlers) {
            let response = await this.processSSI(request, filename, ssiHandlers);

            res.end(response);
            return filename;
        }

        let etag = `${stats.size}-${stats.mtime.getTime()}`;

        headers['ETag'] = etag;

        let requestEtags = (request.headers['if-none-match'] || '').split(',').map(header => header.trim());
        if (requestEtags.includes(etag)) {
            res.writeHead(304, headers);
            res.end();
            return filename;
        }

        res.writeHead(200, headers);

        headers['Content-Length'] = stats.size;

        createReadStream(filename).pipe(res);

        return filename;
    }

    async processSSI(request, filename, handlers) {
        let server = this;
        return await this.replaceSSI(
            { server, request, filename },
            await readFile(filename, { encoding: 'utf8' }),
            handlers
        );
    }

    async replaceSSI(context, input, handlers) {
        return await asyncRegexpReplace(
            input,
            /<!--#([^ ]*?)(.*?)-->/g,
            async (comment, command, parameters) => {
                let parameterMap = new Map(
                    parameters
                        .split(/ +/)
                        .map(item => item.match(/([^=]*)(="([^"]*)")?/))
                        .map(([, key, , value]) => [key, value])
                );
                for (let handler of handlers) {
                    let result = await handler({ ...context, command, parameterMap, comment });
                    if (result) return result;
                }
                return comment;
            });
    }


    static async includeFile({ server, request, filename, command, parameterMap }) {
        if (command == "include" && parameterMap.has('file')) {
            return await server.processSSI(request, join(dirname(filename), parameterMap.get("file")));
        }
    }

    static async includeVirtual({ request, parameterMap }) {
        if (command == "include" && parameterMap.has('virtual')) {
            let url = new URL(parameterMap.get("virtual"), `http://${request.headers.host}${request.url}`);
            return await consume(await new Promise(resolve => get(url, resolve)));
        }
    }
}

module.exports = Server;
