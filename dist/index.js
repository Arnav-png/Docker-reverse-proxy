"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
const http = require('http');
const express = require('express');
const Docker = require('dockerode');
const httpProxy = require('http-proxy');
const managementApi = express();
const proxy = httpProxy.createProxy({});
const docker = new Docker({ socketPath: '/var/run/docker.sock' });
managementApi.use(express.json());
const db = new Map();
docker.getEvents((err, stream) => {
    console.log('got event');
    if (err) {
        console.log(err);
        return;
    }
    stream.on('data', (chunk) => __awaiter(void 0, void 0, void 0, function* () {
        if (!chunk)
            return;
        const event = JSON.parse(chunk.toString());
        console.log("🚀 ~ stream.on ~ event:", event);
        if (event.Type === 'container' && event.Action === 'start') {
            const container = docker.getContainer(event.id);
            const containerInfo = yield container.inspect();
            const containerName = containerInfo.Name.substring(1);
            const ipAddress = containerInfo.NetworkSettings.IPAddress;
            const exposedPort = Object.keys(containerInfo.Config.ExposedPorts);
            let defaultPort;
            if ((exposedPort === null || exposedPort === void 0 ? void 0 : exposedPort.length) > 0) {
                const [port, type] = exposedPort[0].split('/');
                if (type === 'tcp') {
                    defaultPort = port;
                }
            }
            console.log(`Registering ${containerName} ---> http://${ipAddress}:${defaultPort}`);
            db.set(containerName, { containerName, ipAddress, defaultPort });
        }
    }));
});
const reverseProxyApp = express();
reverseProxyApp.use((req, res) => {
    const hostname = req.headers.host;
    const subdomain = hostname.split('.')[0];
    if (!db.has(subdomain)) {
        return res.status(404).end('404 Not Found');
    }
    const { ipAddress, defaultPort } = db.get(subdomain);
    const target = `http://${ipAddress}:${defaultPort}`;
    console.log(`Forwarding ${hostname} -> ${target}`);
    return proxy.web(req, res, { target, changeOrigin: true });
});
const reverseProxy = http.createServer(reverseProxyApp);
managementApi.post('/containers', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { image, tag = 'latest' } = req.body;
    const images = yield docker.listImages();
    console.log(images, 'these are my images');
    let imageAlreadyExist = false;
    for (const img in images) {
        for (const tag in images.RepoTags) {
            if (img === `${image}:${tag}`) {
                imageAlreadyExist = true;
                break;
            }
        }
        if (imageAlreadyExist)
            break;
    }
    if (!imageAlreadyExist) {
        console.log('Pulling image from Docker:', `${image}:${tag}`);
        yield docker.pull(`${image}:${tag}`);
    }
    const container = yield docker.createContainer({
        Image: `${image}:${tag}`,
        Tty: false,
        HostConfig: {
            autoRemove: true,
        }
    });
    yield container.start();
    return res.json({
        status: 'success',
        container: `${(yield container.inspect()).Name}.localhost`
    });
}));
managementApi.listen(8080, () => {
    console.log('Management API started at port 8080');
});
reverseProxy.listen(80, () => {
    console.log('Reverse proxy listening on port 80');
});
