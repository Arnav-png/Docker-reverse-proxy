Project Description

This project is a reverse proxy management application built with Node.js and Express, designed to dynamically manage Docker containers. It allows users to register and route requests to specific containers based on subdomains. The application listens for Docker container events and automatically updates its routing table when containers are started. This simplifies the process of managing multiple microservices deployed as Docker containers.
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


