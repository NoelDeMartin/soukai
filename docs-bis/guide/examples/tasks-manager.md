# Tasks Manager (using Solid)

A classic example of using this library to make a Solid App is a full fledged Task Manager (albeit a simple one).

This example follows the same idea as the [0data Hello World](https://hello.0data.app/), but using Soukai and the newer ESM modules syntax. This also assumes that you'll be installing `soukai-bis`, `zod`, and `@inrupt/solid-client-authn-browser` using a package manager, and serving the app with a bundler that supports TypeScript (such as [Vite](https://vite.dev/)).

Without further ado, here's the code:

::: code-group

```html [index.html]
<!doctype html>
<html lang="en">
    <head>
        <meta charset="UTF-8" />
        <link rel="stylesheet" href="https://cdn.simplecss.org/simple.min.css" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>Soukai Hello World</title>
    </head>
    <body>
        <script type="module" src="./main.ts"></script>
        <main>
            <h1>Solid Hello World<br /><small>(REST API)</small></h1>

            <div id="loading">
                <p>Loading...</p>
            </div>

            <div id="auth-guest" hidden>
                <p>Hi there!</p>
                <p>
                    This page is a showcase of a simple
                    <a href="https://solidproject.org/" target="_blank">Solid application</a>
                    built using JavaScript, CSS and HTML. You can look at the source code and learn how to use it in
                    <a href="https://github.com/0dataapp/hello/tree/main/solid/solid-rest-api" target="_blank"
                        >the repository</a
                    >.
                </p>

                <p>
                    If you want to see other examples, you can find them here:
                    <a href="../">Solid Hello World Examples</a>.
                </p>

                <button id="login-button" type="button" onclick="login()">Log in with Solid</button>

                <p>
                    <small
                        >If you don't have one, you can
                        <a href="https://solidproject.org/users/get-a-pod">get a Solid Pod</a>.</small
                    >
                </p>
            </div>

            <div id="auth-user" hidden>
                <p>Hello, <span id="username"></span>!</p>
                <button id="logout-button" type="button" onclick="logout()">Log out</button>

                <h2>Your tasks</h2>
                <ul id="tasks"></ul>
                <button type="button" onclick="createTask()">Create new task</button>
            </div>
        </main>
    </body>
</html>
```

```ts [main.ts]
import 'soukai-bis/patch-zod';
import { SolidEngine, bootCoreModels, bootModels, setEngine } from 'soukai-bis';

import {
    restoreSession,
    getLoginUrl,
    performLogin,
    performLogout,
    performTaskCreation,
    performTaskDeletion,
    performTaskUpdate,
    loadTasks,
    getAuthenticatedFetch,
} from './solid';
import Task from './Task';
import TasksList from './TasksList';
import User from './User';

async function main(): Promise<void> {
    bootCoreModels();
    bootModels({ Task, TasksList, User });
    setEngine(new SolidEngine({ fetch: getAuthenticatedFetch() }));

    const user = await restoreSession();

    getElement('loading').setAttribute('hidden', '');

    if (!user) {
        getElement('auth-guest').removeAttribute('hidden');

        return;
    }

    getElement('username').innerHTML = `<a href="${user.url}" target="_blank">${user.name}</a>`;
    getElement('auth-user').removeAttribute('hidden');

    const tasks = await loadTasks();

    for (const task of tasks) {
        appendTaskItem(task);
    }
}

function getElement(id: string): HTMLElement {
    const element = document.getElementById(id);

    if (!element) {
        throw new Error(`Element with id "${id}" not found`);
    }

    return element;
}

function login(): void {
    const loginUrl = getLoginUrl();

    if (!loginUrl) return;

    performLogin(loginUrl);
}

async function logout(): Promise<void> {
    getElement('logout-button').setAttribute('disabled', '');

    await performLogout();

    getElement('auth-guest').removeAttribute('hidden');
    getElement('auth-user').setAttribute('hidden', '');
    getElement('logout-button').removeAttribute('disabled');
}

async function createTask(): Promise<void> {
    const description = prompt('Task description');

    if (!description) return;

    const task = await performTaskCreation(description);

    appendTaskItem(task);
}

async function updateTask(taskUrl: string, button: HTMLButtonElement): Promise<void> {
    const done = button.innerText === 'Complete';
    button.setAttribute('disabled', '');

    await performTaskUpdate(taskUrl, done);

    button.removeAttribute('disabled');
    button.innerText = done ? 'Undo' : 'Complete';
}

async function deleteTask(taskUrl: string, taskElement: HTMLElement, button: HTMLButtonElement): Promise<void> {
    button.setAttribute('disabled', '');

    await performTaskDeletion(taskUrl);

    taskElement.remove();
}

function appendTaskItem(task: Task): void {
    const taskItem = document.createElement('li');

    taskItem.innerHTML = `
        <button
            type="button"
            onclick="deleteTask('${task.url}', this.parentElement, this)"
        >
            Delete
        </button>
        <button
            type="button"
            onclick="updateTask('${task.url}', this)"
            style="width:100px"
        >
            ${task.done ? 'Undo' : 'Complete'}
        </button>
        <span>${task.description}</span>
    `;

    getElement('tasks').appendChild(taskItem);
}

main();

// Expose functions used in inline event handlers.
Object.assign(window, { login, logout, createTask, updateTask, deleteTask });

window.onunhandledrejection = (event) => alert(`Error: ${event.reason?.message}`);
```

```ts [solid.ts]
import { fetch, getDefaultSession, handleIncomingRedirect, login, logout } from '@inrupt/solid-client-authn-browser';

import type Task from './Task';
import TasksList from './TasksList';
import User from './User';

interface UserProfile {
    url: string;
    name: string;
    storageUrl: string;
}

let list: TasksList | null = null;
let user: UserProfile | null = null;

export async function restoreSession(): Promise<UserProfile | null> {
    // This function uses Inrupt's authentication library to restore a previous session. If you were
    // already logged into the application last time that you used it, this will trigger a redirect that
    // takes you back to the application. This usually happens without user interaction, but if you hadn't
    // logged in for a while, your identity provider may ask for your credentials again.
    //
    // After a successful login, this will also read the profile from your POD.
    //
    // @see https://docs.inrupt.com/developer-tools/javascript/client-libraries/tutorial/authenticate-browser/

    try {
        await handleIncomingRedirect({ restorePreviousSession: true });

        const session = getDefaultSession();

        if (!session.info.isLoggedIn || !session.info.webId) return null;

        user = await fetchUserProfile(session.info.webId);

        return user;
    } catch (error) {
        alert(error instanceof Error ? error.message : String(error));

        return null;
    }
}

export function getLoginUrl(): string | null {
    // Asking for a login url in Solid is kind of tricky. In a real application, you should be
    // asking for a user's webId, and reading the user's profile you would be able to obtain
    // the url of their identity provider. However, most users may not know what their webId is,
    // and they introduce the url of their issue provider directly. In order to simplify this
    // example, we just use the base domain of the url they introduced, and this should work
    // most of the time.
    const url = prompt('Introduce your Solid login url');

    if (!url) return null;

    const loginUrl = new URL(url);
    loginUrl.hash = '';
    loginUrl.pathname = '';

    return loginUrl.href;
}

export function performLogin(loginUrl: string): void {
    login({
        oidcIssuer: loginUrl,
        redirectUrl: window.location.href,
        clientName: 'Hello World',
    });
}

export async function performLogout(): Promise<void> {
    await logout();
}

export async function performTaskCreation(description: string): Promise<Task> {
    // Data discovery mechanisms are still being defined in Solid, but so far it is clear that
    // applications should not hard-code the url of their containers like we are doing in this
    // example.
    //
    // In a real application, you should use one of these two alternatives:
    //
    // - The Type index. This is the one that most applications are using in practice today:
    //   https://soukai.js.org/guide/advanced/interoperability.html#type-indexes
    //
    // - SAI, or Solid App Interoperability. This one is still being defined:
    //   https://solid.github.io/data-interoperability-panel/specification/

    if (!user) {
        throw new Error('You must be logged in to create tasks');
    }

    if (!list) {
        list = await TasksList.createAt(user.storageUrl, { name: 'Tasks' });
    }

    const task = await list.relatedTasks.create({ description });

    return task;
}

export async function performTaskUpdate(taskUrl: string, done: boolean): Promise<void> {
    const task = list?.tasks?.find((task) => task.url === taskUrl);

    await task?.toggle(done);
}

export async function performTaskDeletion(taskUrl: string): Promise<void> {
    const task = list?.tasks?.find((task) => task.url === taskUrl);

    if (!task) return;

    await list?.relatedTasks.delete(task);
}

export async function loadTasks(): Promise<Task[]> {
    if (!user) return [];

    // In a real application, you shouldn't hard-code the path to the container like we're doing here.
    // Read more about this in the comments on the performTaskCreation function.
    list = await TasksList.find(`${user.storageUrl}tasks/`);

    if (!list) {
        return [];
    }

    return list.relatedTasks.load();
}

export function getAuthenticatedFetch(): typeof fetch {
    return fetch;
}

async function fetchUserProfile(webId: string): Promise<UserProfile> {
    const user = await User.find(webId);

    return {
        url: webId,
        name: user?.name || 'Anonymous',

        // WebIds may declare more than one storage url, so in a real application you should
        // ask which one to use if that happens. In this app, in order to keep it simple, we'll
        // just use the first one. If none is declared in the profile, we'll search for it.
        storageUrl: user?.storageUrl || (await findUserStorage(webId)),
    };
}

async function findUserStorage(webId: string): Promise<string> {
    let url = webId.replace(/#.*$/, '');
    url = url.endsWith('/') ? url + '../' : url + '/../';

    const parentUrl = new URL(url);
    const response = await fetch(parentUrl.href);

    if (response.headers.get('Link')?.includes('<http://www.w3.org/ns/pim/space#Storage>; rel="type"')) {
        return parentUrl.href;
    }

    if (parentUrl.pathname === '/') return parentUrl.href;

    return findUserStorage(parentUrl.href);
}
```

```ts [Task.ts]
import Model from './Task.schema';

const STATUS_COMPLETED = 'https://schema.org/CompletedActionStatus';
const STATUS_POTENTIAL = 'https://schema.org/PotentialActionStatus';

export default class Task extends Model {
    public get done(): boolean {
        return this.status === STATUS_COMPLETED;
    }

    public async toggle(done?: boolean): Promise<void> {
        const markAsDone = done ?? !this.done;

        await this.update({ status: markAsDone ? STATUS_COMPLETED : STATUS_POTENTIAL });
    }
}
```

```ts [Task.schema.ts]
import { defineSchema } from 'soukai-bis';
import { string, url } from 'zod';

export default defineSchema({
    rdfContext: 'https://schema.org/',
    rdfClass: 'Action',
    fields: {
        description: string(),
        status: url().rdfProperty('actionStatus').optional(),
    },
});
```

```ts [TasksList.ts]
import type { ContainsRelation } from 'soukai-bis';

import type Task from './Task';
import Model from './TasksList.schema';

export default class TasksList extends Model {
    declare public readonly relatedTasks: ContainsRelation<this, Task, typeof Task>;
}
```

```ts [TasksList.schema.ts]
import { contains, defineContainerSchema } from 'soukai-bis';

import Task from './Task';

export default defineContainerSchema({
    relations: {
        tasks: contains(() => Task),
    },
});
```

```ts [User.ts]
import Model from './User.schema';

export default class User extends Model {}
```

```ts [User.schema.ts]
import { defineSchema } from 'soukai-bis';
import { string, url } from 'zod';

export default defineSchema({
    rdfContexts: {
        default: 'http://xmlns.com/foaf/0.1/',
        pim: 'http://www.w3.org/ns/pim/space#',
    },
    rdfClass: 'Person',
    timestamps: false,
    fields: {
        name: string().optional(),
        storageUrl: url().rdfProperty('pim:storage').optional(),
    },
});
```

:::

> [!TIP]
> Instead of declaring your own `User` model, you could also use the built-in `Person` model. You can learn more about it in the [Interoperability](../advanced/interoperability.md#type-indexes) section.
