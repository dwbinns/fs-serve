import { createReadStream } from 'fs';
import { stat, readFile, readdir } from 'fs/promises';
import { join, extname, dirname } from 'path';
import http from "http";
import https from "https";
import { once } from 'events';

const mime = {
    shtml: 'text/html',
    mp4: 'video/mp4',
    flv: 'video/x-flv',
    md: 'text/markdown',
    wasm: 'application/wasm',
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

export function mimeTypeFor(filename) {
    let ext = extname(filename).slice(1);

    let mimeType = mime[ext] || 'application/octet-stream';
    if (mimeType.startsWith("text/")) mimeType += "; charset=UTF-8";
    return mimeType;
}

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

const defaultLog = (url, statusCode, result) => console.log("Request", statusCode, url, result);

class Server {
    constructor(root, { log = defaultLog, directoryList = false, ssi = [], maxAge = 2, extensions = [] } = {}) {
        this.root = root;
        this.extensions = extensions;
        this.directoryList = directoryList;
        this.ssi = ssi;
        this.maxAge = maxAge;
        this.log = log;
    }

    async listen(port, host, options) {
        let protocol = options.key ? "https" : "http";
        let server = { http, https }[protocol].createServer(options, (req, res) => this.serve(req, res));
        server.listen(port, host);
        await once(server, "listening");
        return server;
    }

    async serve(request, response) {
        await this.serveRelative(request.url, request, response);
    }

    getRequestURL(request, pathname = request.url) {
        return new URL(pathname, `http://${request.headers.host}`);
    }

    async serveRelative(pathname, request, response) {
        try {
            let url = this.getRequestURL(request, pathname);
            let result = await this.serveURL(url, request.headers);
            let status = result.status || 200;
            response.writeHeader(status, result.headers || {});
            if (result.body) response.end(result.body);
            else if (result.stream) result.stream.pipe(response);
            else response.end();

            this.log?.(request.url, status, result.comment || '');
        } catch (e) {
            console.error("Request processing error", e);
            response.writeHeader(500, {});
            response.end();
            this.log?.(request.url, 500, e?.message);
        }
    }

    async serveURL(url, headers) {
        let parts = decodeURIComponent(url.pathname.slice(1)).split("/");
        return await this.servePathParts(parts, headers);

    }

    async servePathParts(parts, headers) {
        let filePath = this.root;
        let stats = await stat(filePath).catch(() => null);
        return await this.servePath(headers, filePath, stats, parts, parts);
    }

    async servePath(headers, filePath, stats, parts, context) {
        let isTrailingSlash = parts.length == 1 && parts[0] == "";

        if (!stats) {
            return this.serve404();
        }

        if (parts.length && !isTrailingSlash) {
            let [head, ...tail] = parts;
            if (head == ".." || head == "." || head == "") {
                return this.serve404();
            }

            let extensions = [null, ...this.extensions];

            for (let extension of extensions) {
                let childPath = join(filePath, extension ? `${head}.${extension}` : head);
                let childStats = await stat(childPath).catch(() => null);

                if (childStats) {
                    return await this.servePath(headers, childPath, childStats, tail, context);
                }
            }
        }

        if (stats.isDirectory()) {
            if (parts.length == 0) {
                return this.serveRedirect(`/${context.join("/")}/`);
            }

            for (let indexDocument of indexDocuments) {
                let indexPath = join(filePath, indexDocument);
                let indexStats = await stat(indexPath).catch(() => null);
                if (indexStats?.isFile()) {
                    return await this.serveFile(headers, indexPath, indexStats);
                }
            }

            if (isTrailingSlash) {
                return await this.serveIndexList(filePath);
            }
        }

        if (stats.isFile()) {
            return await this.serveFile(headers, filePath, stats)
        }

        return this.serve404();
    }

    async serveIndexList(pathname) {
        if (!this.directoryList) {
            return this.serve404();
        }

        let lines = (await readdir(pathname, { withFileTypes: true }))
            .filter(entry => !entry.name.startsWith("."))
            .map(entry => {
                return `<div><a href='./${encodeURI(escapeEntities(entry.name) + (entry.isDirectory() ? "/" : ""))}'>${escapeEntities(entry.name)}</a></div>`
            });

        return {
            body: header + lines.join("") + trailer
        }
    }

    serve500() {
        return { status: 500 };
    }

    serve404() {
        return { status: 404 };
    }

    serveRedirect(location) {
        return { status: 301, headers: { location } }
    }

    async serveFile(requestHeaders, filename, stats) {
        let responseHeaders = {};
        responseHeaders['Cache-Control'] = `max-age = ${this.maxAge}`;

        responseHeaders['Content-Type'] = mimeTypeFor(filename);

        let etag = `${stats.size}-${stats.mtime.getTime()}`;

        responseHeaders['ETag'] = etag;

        let requestEtags = (requestHeaders['if-none-match'] || '').split(',').map(header => header.trim());
        if (requestEtags.includes(etag)) {
            return { status: 304, headers: responseHeaders, coment: filename };
        }

        responseHeaders['Content-Length'] = stats.size;


        return {
            status: 200,
            headers: responseHeaders,
            stream: createReadStream(filename),
            comment: filename,
            path: filename,
        };
    }
}

export default Server;