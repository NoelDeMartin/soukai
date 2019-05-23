import { EventEmitter } from 'events';

import StubResponse from '@tests/stubs/StubResponse';

class StubFetcher extends EventEmitter {

    private fetchResponses: Response[] = [];

    public reset(): void {
        this.fetchResponses = [];
    }

    public addFetchNotFoundResponse(): void {
        this.fetchResponses.push(StubResponse.notFound());
    }

    public addFetchResponse(content: string = '', headers: object = {}): void {
        this.fetchResponses.push(StubResponse.success(content, headers));
    }

    public async fetch(): Promise<Response> {
        const response = this.fetchResponses.shift();

        if (!response) {
            return new Promise((_, reject) => reject());
        }

        return response;
    }

}

const instance = new StubFetcher();

jest.spyOn(instance, 'fetch');

export default instance;
