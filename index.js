const {createReadStream, promises: {stat}} = require('fs');
const {join, extname} = require('path');

var mime={
    js: 'application/javascript;charset=UTF-8',
    html: 'text/html; charset=UTF-8',
    mp4: 'video/mp4',
    flv: 'video/x-flv',
    jpg: 'image/jpeg'
};

class Server {
    constructor(root) {
        this.root = root;
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
        if (stats && stats.isDirectory()) return await this.serveDirectory(filename, stats, req, res);
        if (stats && stats.isFile()) return await this.serveFile(filename, stats, req, res);
        return this.serve404(req, res);
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

    serveRedirect(req, res, Location) {
        res.writeHeader(301, {Location});
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
            return await this.servePath(`${filename}index.html`, req, res);
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

        headers['Content-Length'] = stats.size;

        headers['Content-Type'] = mime[extname(filename).slice(1)] || 'application/octet-stream';

        res.writeHead(200, headers);

        createReadStream(filename).pipe(res);

        return filename;
    }
}
    
module.exports = Server;