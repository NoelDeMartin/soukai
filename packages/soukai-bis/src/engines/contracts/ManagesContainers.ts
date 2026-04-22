export default interface ManagesContainers {
    getContainerUrls(): Promise<string[]>;
    dropContainers(containerUrls: string[]): Promise<void>;
}
