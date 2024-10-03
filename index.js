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
    console.log('got event')
    if (err) {
        console.log(err);
        return;
    }

    stream.on('data', async (chunk) => {
        if (!chunk) return;

        const event = JSON.parse(chunk.toString());
        console.log("🚀 ~ stream.on ~ event:", event)
        if (event.Type === 'container' && event.Action === 'start') {
            const container = docker.getContainer(event.id);
            const containerInfo = await container.inspect();

            const containerName = containerInfo.Name.substring(1);
            const ipAddress = containerInfo.NetworkSettings.IPAddress;

            const exposedPort = Object.keys(containerInfo.Config.ExposedPorts);
            let defaultPort;
            if (exposedPort?.length > 0) {
                const [port, type] = exposedPort[0].split('/');
                if (type === 'tcp') {
                    defaultPort = port;
                }
            }

            console.log(`Registering ${containerName} ---> http://${ipAddress}:${defaultPort}`);
            db.set(containerName, { containerName, ipAddress, defaultPort });
        }
    });
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

managementApi.post('/containers', async (req, res) => {
    const { image, tag = 'latest' } = req.body;
    const images = await docker.listImages();

    console.log(images , 'these are my images')
    let imageAlreadyExist = false;
    for (const img in images){
        for(const tag in images.RepoTags){
            if(img === `${image}:${tag}`){
                imageAlreadyExist=true
                break
            }
        }
        if (imageAlreadyExist) break
       
    }

    if (!imageAlreadyExist) {
        console.log('Pulling image from Docker:', `${image}:${tag}`);
        await docker.pull(`${image}:${tag}`);
    }

    const container = await docker.createContainer({
        Image: `${image}:${tag}`,
        Tty: false,
        HostConfig: {
            autoRemove: true,
        }
    });

    await container.start();

    return res.json({
        status: 'success',
        container: `${(await container.inspect()).Name}.localhost`
    });
});

managementApi.listen(8080, () => {
    console.log('Management API started at port 8080');
});

reverseProxy.listen(80, () => {
    console.log('Reverse proxy listening on port 80');
});
