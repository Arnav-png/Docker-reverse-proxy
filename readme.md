Project Description

This project is a TypeScript-based reverse proxy built with dockerode, http-proxy and Express, designed to dynamically manage Docker containers and route traffic based on subdomains. It automatically registers and routes requests to specific containers, updating its routing table in real-time when containers are started. This simplifies managing multiple microservices deployed as Docker containers by handling routing and container lifecycle management seamlessly.
Architecture Overview

The architecture consists of the following components:

    Management API:
        An Express server that provides endpoints to manage Docker containers.
        Listens for HTTP POST requests to create and start new containers based on user-defined images.

    Event Listener:
        Monitors Docker events using the Docker API to detect when containers start.
        Updates an internal mapping of container information, including names, IP addresses, and exposed ports.

    Reverse Proxy:
        An HTTP server that routes incoming requests based on subdomains.
        Uses http-proxy to forward requests to the appropriate Docker container based on the mapped data.

    Docker Integration:
        Utilizes dockerode, a Docker API client for Node.js, to interact with the Docker daemon for container management.


![image](https://github.com/user-attachments/assets/10a3cf1c-8599-4002-ac73-6f5930271cec)

