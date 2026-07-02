import { safeContainerUrl } from 'soukai-bis/utils/urls';

export default class ContainersIndex {

    private childrenByParent: Map<string, Set<string>> | null = null;

    public constructor(private urls: Set<string>) {}

    public has(url: string): boolean {
        return this.urls.has(url);
    }

    public getUrls(): string[] {
        return Array.from(this.urls);
    }

    public childrenOf(url: string): Set<string> | undefined {
        this.childrenByParent ??= this.buildChildrenByParent();

        return this.childrenByParent.get(url);
    }

    public add(url: string): void {
        this.urls.add(url);
        this.childrenByParent = null;
    }

    public delete(url: string): void {
        this.urls.delete(url);
        this.childrenByParent = null;
    }

    private buildChildrenByParent(): Map<string, Set<string>> {
        const childrenByParent = new Map<string, Set<string>>();

        for (const containerUrl of this.urls) {
            let childUrl: string = containerUrl;
            let parentUrl: string | null;

            while ((parentUrl = safeContainerUrl(childUrl))) {
                const children = childrenByParent.get(parentUrl) ?? new Set();

                childrenByParent.set(parentUrl, children);
                children.add(childUrl);

                childUrl = parentUrl;
            }
        }

        return childrenByParent;
    }

}
