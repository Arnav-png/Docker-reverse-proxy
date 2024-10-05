const http = require('http');
const express = require('express');
const Docker = require('dockerode');
const httpProxy = require('http-proxy');
const { createClient } = require('redis');
const cors = require('cors');

const managementApi = express();
const proxy = httpProxy.createProxy({});
const docker = new Docker({ socketPath: '/var/run/docker.sock' });
managementApi.use(express.json());
managementApi.use(cors())

const redis = createClient({
    url: 'redis://redis:6379' // Connect using the service name
});


(async () => {
    try {
        await redis.connect()
        await redis.set('test_key', 'Hello, Redis!');
        const value = await redis.get('test_key');
        console.log('Value from Redis:', value); // Should log "Hello, Redis!"
    } catch (error) {
        console.error('Error connecting to Redis:', error);
    }
})();


redis.on('error', (error) => console.log('Redis error:', error));

// Docker event handling
docker.getEvents((err, stream) => {
    if (err) {
        console.error(err);
        return;
    }

    stream.on('data', async (chunk) => {
        const event = JSON.parse(chunk.toString());
        if (event.Type === 'container' && event.Action === 'start') {
            const container = docker.getContainer(event.id);
            const containerInfo = await container.inspect();

            const containerName = containerInfo.Name.substring(1);
            const ipAddress = containerInfo.NetworkSettings.IPAddress;
            const exposedPort = Object.keys(containerInfo.Config.ExposedPorts);
            let defaultPort;

            if (exposedPort.length > 0) {
                const [port, type] = exposedPort[0].split('/');
                if (type === 'tcp') {
                    defaultPort = port;
                }
            }

            console.log(`Registering ${containerName} ---> http://${ipAddress}:${defaultPort}`);
            await redis.hSet(containerName, 'ipAddress', ipAddress, 'defaultPort', defaultPort);
        }
    });
});

// Reverse proxy setup
const reverseProxyApp = express();
reverseProxyApp.use(async (req, res) => {
    const hostname = req.headers.host;
    const subdomain = hostname.split('.')[0];

    const containerData = await redis.hGetAll(subdomain);
    if (!Object.keys(containerData).length) {
        return res.status(404).end('404 Not Found');
    }

    const { ipAddress, defaultPort } = containerData;
    const target = `http://${ipAddress}:${defaultPort}`;

    console.log(`Forwarding ${hostname} -> ${target}`);
    return proxy.web(req, res, { target, changeOrigin: true });
});

// Management API route
managementApi.post('/containers', async (req, res) => {
    const { image, tag = 'latest' } = req.body;
    const images = await docker.listImages();

    let imageAlreadyExist = images.some(img => img.RepoTags?.includes(`${image}:${tag}`));

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

const reverseProxy = http.createServer(reverseProxyApp);
reverseProxy.listen(80, () => {
    console.log('Reverse proxy listening on port 80');
});
