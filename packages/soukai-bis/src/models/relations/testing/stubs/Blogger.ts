import Model from './Blogger.schema';

export default class Blogger extends Model {
    public get archiveContainerUrl(): string | undefined {
        return this.postsContainerUrl && `${this.postsContainerUrl}archive/`;
    }
}
