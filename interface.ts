export interface containerRes {
    status: string;
    container: string;
}

export interface ContainerInfo {
    containerName: string;
    ipAddress: string;
    defaultPort: string | undefined;
}