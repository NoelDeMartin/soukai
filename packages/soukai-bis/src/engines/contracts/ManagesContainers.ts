export default interface ManagesContainers {
    getContainerUrls(): Promise<string[]>;
    dropContainers(containerUrls: string[] | RegExp): Promise<void>;
}
