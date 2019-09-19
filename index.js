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
    
            let decodedPath = decodeURI(requestURL.pathname);
        
            let filename = join(this.root, decodedPath);

            //console.log(req.url, requestURL.pathname, decodedPath, filename);

            await this.servePath(filename, req, res);
        } catch (e) {
            this.serve404(req, res);
        }
    }

    async servePath(filename, req, res) {
        let stats = await stat(filename).catch(e => null);
        if (!stats) this.serve404(req, res);
        else if (stats.isDirectory()) await this.serveDirectory(filename, stats, req, res);
        else if (stats.isFile()) await this.serveFile(filename, stats, req, res);
        else this.serve404(req, res);
    }

    serve404(req, res) {
        res.writeHeader(404, {});
        res.end();
    }

    async serveDirectory(filename, stats, req, res) {
        if (!filename.endsWith('/')) {
            res.writeHeader(301, {
                Location: encodeURI(filename + "/")
            });
            res.end();
        } else {
            await this.servePath(`${filename}index.html`, req, res);
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
            return;
        }

        headers['Content-Length'] = stats.size;

        headers['Content-Type'] = mime[extname(filename).slice(1)] || 'application/octet-stream';

        res.writeHead(200, headers);

        createReadStream(filename).pipe(res);
    }
}
    
module.exports = Server;