const {createReadStream, promises: {stat, readFile, readdir}} = require('fs');
const {join, extname, dirname} = require('path');

const mime={
    js: 'application/javascript;charset=UTF-8',
    html: 'text/html; charset=UTF-8',
    shtml: 'text/html; charset=UTF-8',
    mp4: 'video/mp4',
    flv: 'video/x-flv',
    jpg: 'image/jpeg',
    css: 'text/css',
    png: 'image/png',
    pdf: 'application/pdf',
    svg: 'image/svg+xml',
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

class Server {
    constructor(root, config) {
        this.root = root;
        this.config = config;
        this.maxAge = 10;
    }

    async serve(req, res) {
        try {
            let requestURL = new URL(req.url, "http://localhost");

            let result = await this.serveRelative(decodeURI(requestURL.pathname), req, res);
            console.log(req.url, res.statusCode, result);
        } catch (e) {
            console.log(e);
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
                if (await stat(filePath).catch(e => false)) {
                    return await this.servePath(filePath, req, res);
                }
            }
        } else {
            if (stats.isDirectory()) return await this.serveDirectory(filename, stats, req, res);
            if (stats.isFile()) return await this.serveFile(filename, stats, req, res);
        }
        return this.serve404(req, res);
    }

    async serveIndexList(pathname, req, res) {
        res.writeHeader(200, {});

        let lines = (await readdir(pathname, {withFileTypes: true}))
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
        res.writeHeader(301, {Location: location});
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
            //return this.serve404(req, res);
        }
    }

    async serveFile(filename, stats, req, res) {
        let etag = `${stats.size}-${stats.mtime.getTime()}`;

        let headers = {};
        headers['ETag'] = etag;
        headers['Cache-Control'] = `max-age = ${this.maxAge}`;

        let requestEtags = (req.headers['if-none-match'] || '').split(',').map(header => header.trim());
        if (requestEtags.includes(etag)) {
            res.writeHead(304, headers);
            res.end();
            return filename;
        }

        let ext = extname(filename).slice(1);

        headers['Content-Type'] = mime[ext] || 'application/octet-stream';

        res.writeHead(200, headers);

        if (ext == "shtml" && this.config.ssi) {
            let response = await this.processSSI(filename);

            res.end(response);
        } else {
            headers['Content-Length'] = stats.size;

            createReadStream(filename).pipe(res);
        }

        return filename;
    }

    async processSSI(filename) {
        return await asyncRegexpReplace(
            await readFile(filename, {encoding: 'utf8'}),
            /<!--#([^ ]*) (.*?)-->/g,
            async (comment, command, parameters) => {
                let parameterMap = new Map(
                    Array.from(
                        parameters.matchAll(/([^=]*)="([^"]*)"/g),
                        ([_, key, value]) => [key, value]
                    )
                );
                if (command == "include" && parameterMap.get('virtual')) {
                    //return await readFile(join(dirname(filename), parameterMap.get("virtual")), {encoding: "utf8"});
                    return this.processSSI(join(dirname(filename), parameterMap.get("virtual")));
                    //return "hi";
                }
                return comment;
        });
    }
}

module.exports = Server;
