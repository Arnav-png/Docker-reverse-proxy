const http = require('http');
const express = require('express');
const Docker = require('dockerode')
const managementApi = express();
const httpProxy = require('http-proxy');

const proxy = httpProxy.createProxy({})

const docker = new Docker({socketPath:'/var/run/docker.sock'});
managementApi.use(express.json());

const db = new Map()

docker.getEvents((err,stream)=>{
    if(err){
        console.log(err);
        return
    }

    stream.on('data',async(chunk)=>{
        if(!chunk) return;

        const event = JSON.parse(chunk.toString())
        if(event.type === 'container' && event.action === 'start'){
            const container = docker.getContainer(event.id);
            const containerinfo = await container.inspect()

            const containerName = containerinfo.Name.substring(1)
            const ipAdress = containerinfo.NetworkSettings.IPAddress

            const exposedPort = Object.keys(containerinfo.Config.ExposedPorts);
            let defaultPort
            if(exposedPort?.length>0){
                const [port,type] = exposedPort[0].split('/')
                if(type == 'tcp'){
                    defaultPort = port;
                }
            }
            console.log(`registering ${containerName.localhost} ---> http://${ipAdress}:${defaultPort}`)
            db.set(containerName , {containerName , ipAdress , defaultPort})
        }
    })
})


const revereProxyApp = express();
revereProxyApp.use((req,res)=>{
    const hostname = req.body;
    const subdomain = hostname.split('.')[0];

    if(!db.has(subdomain)){
        return res.status(404).end(404)
    }
    const {ipAdress , defaultPort} = db.get(subdomain);
    const target = `http://${ipAdress}:${defaultPort}`

    console.log(`forwarding ${hostname} -> ${target}`);

    return proxy.web(req,res,{target,changeOrigin:true})
})
const revereProxy = http.createSevrer(revereProxyApp);

managementApi.post('/containers' , async(req , res)=>{
    const {image, tag = 'latest'} = req.body
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

    if (!imageAlreadyExist){
        console.log('image is pulling by docker ::::' , `${image}:${tag}`);
        await docker.pull(`${image}:${tag}`)
    }

    const container = await docker.createContainer({
        Image: `${image}:${tag}`,
        Tty: false,
        HostConfig:{
            autoRemove:true,
        }
    })

    await container.start();

    return res.json({
        status:'success',
        container:`${await container.inspect().Name }.localhost`
    })
})

managementApi.listen(8080 , ()=>{
    console.log('started at port 8080')
})

revereProxy.listen(80,()=>{
    console.log('reverse proxy listenting');
    
})