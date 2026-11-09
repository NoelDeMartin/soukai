import InMemoryEngine from 'soukai-bis/engines/InMemoryEngine';
import { setEngine } from 'soukai-bis/engines/state';
import SoukaiError from 'soukai-bis/errors/SoukaiError';
import { bootModels } from 'soukai-bis/models/registry';
import { hasMany, hasOne } from 'soukai-bis/models/relations/fluent';
import { defineSchema } from 'soukai-bis/models/schema';
import Post from 'soukai-bis/testing/stubs/Post';
import { beforeEach, describe, expect, it } from 'vite-plus/test';
import { url } from 'zod';

describe('Relations', () => {
    const BloggerSchema = defineSchema({
        rdfContext: 'http://xmlns.com/foaf/0.1/',
        rdfClass: 'Person',
        fields: {
            postsContainerUrl: url().rdfProperty('weblog').optional(),
        },
        relations: {
            posts: hasMany('Post', 'authorUrl').from('postsContainerUrl'),
            lastPost: hasOne('Post', 'authorUrl').from('postsContainerUrl'),
            archivedPosts: hasMany('Post', 'authorUrl').from('archiveContainerUrl'),
            typoPosts: hasMany('Post', 'authorUrl').from('postContainerUrl'),
            defaultPosts: hasMany('Post', 'authorUrl'),
        },
    });

    class Blogger extends BloggerSchema {
        public get archiveContainerUrl(): string | undefined {
            return this.postsContainerUrl && `${this.postsContainerUrl}archive/`;
        }
    }

    beforeEach(() => {
        setEngine(new InMemoryEngine());
        bootModels({ Blogger }, { reset: true });
    });

    it('loads has many relations from the parent container', async () => {
        // Arrange
        const blogger = await Blogger.create({ postsContainerUrl: 'https://alice.example/blog/' });
        const blogPost = await Post.createAt('https://alice.example/blog/', {
            title: 'In the blog',
            authorUrl: blogger.url,
        });

        await Post.createAt('https://alice.example/blog/', { title: 'Someone else', authorUrl: 'https://bob.example' });
        await Post.create({ title: 'In the default container', authorUrl: blogger.url });

        // Act
        await blogger.loadRelation('posts');
        await blogger.loadRelation('defaultPosts');

        // Assert
        expect(blogger.posts?.map((post) => post.url)).toEqual([blogPost.url]);
        expect(blogger.defaultPosts?.map((post) => post.title)).toEqual(['In the default container']);
    });

    it('loads has one relations from the parent container', async () => {
        // Arrange
        const blogger = await Blogger.create({ postsContainerUrl: 'https://alice.example/blog/' });
        const blogPost = await Post.createAt('https://alice.example/blog/', {
            title: 'In the blog',
            authorUrl: blogger.url,
        });

        // Act
        await blogger.loadRelation('lastPost');

        // Assert
        expect(blogger.lastPost?.url).toEqual(blogPost.url);
    });

    it('creates related models in the parent container', async () => {
        // Arrange
        const blogger = await Blogger.create({ postsContainerUrl: 'https://alice.example/blog/' });

        await blogger.loadRelation('posts');

        // Act
        const post = await blogger.relatedPosts.create({ title: 'In the blog' });
        const attachedPost = blogger.relatedPosts.attach({ title: 'Attached' }, { mintUrl: true });

        // Assert
        expect(post.url).toMatch(/^https:\/\/alice\.example\/blog\//);
        expect(attachedPost.url).toMatch(/^https:\/\/alice\.example\/blog\//);
    });

    it('falls back to the default container without a container url', async () => {
        // Arrange
        const blogger = await Blogger.create({});
        const post = await Post.create({ title: 'In the default container', authorUrl: blogger.url });

        // Act
        await blogger.loadRelation('posts');

        // Assert
        expect(blogger.posts?.map(({ url }) => url)).toEqual([post.url]);
    });

    it('loads relations from containers given by getters', async () => {
        // Arrange
        const blogger = await Blogger.create({ postsContainerUrl: 'https://alice.example/blog/' });
        const archivedPost = await Post.createAt('https://alice.example/blog/archive/', {
            title: 'Archived',
            authorUrl: blogger.url,
        });

        await Post.createAt('https://alice.example/blog/', { title: 'In the blog', authorUrl: blogger.url });

        // Act
        await blogger.loadRelation('archivedPosts');

        // Assert
        expect(blogger.archivedPosts?.map(({ url }) => url)).toEqual([archivedPost.url]);
    });

    it('fails with unknown container url properties', async () => {
        // Arrange
        const blogger = await Blogger.create({ postsContainerUrl: 'https://alice.example/blog/' });

        // Act
        const promisedPosts = blogger.loadRelation('typoPosts');

        // Assert
        await expect(promisedPosts).rejects.toBeInstanceOf(SoukaiError);
    });
});
