# Tasks Manager (using Solid)

A classic example of using this library to make a Solid App is a full fledged Task Manager (albeit a simple one).

This example follows the same idea as the [0data Hello World](https://hello.0data.app/), but using Soukai and the newer ESM modules syntax. This also assumes that you'll be installing `soukai-bis`, `zod`, `@noeldemartin/solid-utils`, and `@inrupt/solid-client-authn-browser` using a package manager, and serving the app with a bundler that supports TypeScript (such as [Vite](https://vite.dev/)).

Without further ado, here's the code:

::: code-group

```html [index.html]
<!doctype html>
<html lang="en">
    <head>
        <meta charset="UTF-8" />
        <link rel="stylesheet" href="https://cdn.simplecss.org/simple.min.css" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>Soukai Tasks Manager</title>
    </head>
    <body>
        <script type="module" src="./main.ts"></script>
        <main>
            <h1>Tasks Manager</h1>

            <div id="loading">
                <p>Loading...</p>
            </div>

            <div id="auth-guest" hidden>
                <p>Hi there!</p>
                <p>
                    This page is a showcase of a simple
                    <a href="https://solidproject.org/" target="_blank">Solid application</a>
                    built using <a href="https://soukai.js.org/" target="_blank">Soukai</a>. You can learn how it works
                    in
                    <a href="https://soukai.js.org/guide/examples/tasks-manager.html" target="_blank"
                        >the documentation</a
                    >.
                </p>

                <button id="login-button" type="button">Log in with Solid</button>

                <p>
                    <small
                        >If you don't have one, you can
                        <a href="https://solidproject.org/users/get-a-pod">get a Solid Pod</a>.</small
                    >
                </p>
            </div>

            <div id="auth-user" hidden>
                <p>Hello, <span id="username"></span>!</p>
                <button id="logout-button" type="button">Log out</button>

                <h2>Your tasks</h2>
                <ul id="tasks"></ul>
                <button id="create-task-button" type="button">Create new task</button>
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

async function main(): Promise<void> {
    bootCoreModels();
    bootModels({ Task, TasksList });
    setEngine(new SolidEngine({ fetch: getAuthenticatedFetch() }));

    getElement('login-button').addEventListener('click', login);
    getElement('logout-button').addEventListener('click', logout);
    getElement('create-task-button').addEventListener('click', createTask);

    const user = await restoreSession();

    getElement('loading').setAttribute('hidden', '');

    if (!user) {
        getElement('auth-guest').removeAttribute('hidden');

        return;
    }

    const userLink = document.createElement('a');

    userLink.href = user.requireUrl();
    userLink.target = '_blank';
    userLink.textContent = user.name ?? 'Anonymous';

    getElement('username').replaceChildren(userLink);
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

function createButton(text: string, onClick: () => unknown): HTMLButtonElement {
    const button = document.createElement('button');

    button.type = 'button';
    button.textContent = text;
    button.addEventListener('click', onClick);

    return button;
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

async function updateTask(task: Task, button: HTMLButtonElement): Promise<void> {
    button.setAttribute('disabled', '');

    await performTaskUpdate(task, !task.done);

    button.removeAttribute('disabled');
    button.textContent = task.done ? 'Undo' : 'Complete';
}

async function deleteTask(task: Task, taskItem: HTMLElement, button: HTMLButtonElement): Promise<void> {
    button.setAttribute('disabled', '');

    await performTaskDeletion(task);

    taskItem.remove();
}

function appendTaskItem(task: Task): void {
    const taskItem = document.createElement('li');
    const description = document.createElement('span');
    const deleteButton = createButton('Delete', () => deleteTask(task, taskItem, deleteButton));
    const toggleButton = createButton(task.done ? 'Undo' : 'Complete', () => updateTask(task, toggleButton));

    toggleButton.style.width = '100px';

    // Task descriptions come from the POD, so we use textContent instead of innerHTML to make sure
    // that they are displayed as text rather than being interpreted as HTML.
    description.textContent = task.description;

    taskItem.append(deleteButton, toggleButton, description);
    getElement('tasks').appendChild(taskItem);
}

main();

window.onunhandledrejection = (event) => alert(`Error: ${event.reason?.message}`);
```

```ts [solid.ts]
import { fetch, getDefaultSession, handleIncomingRedirect, login, logout } from '@inrupt/solid-client-authn-browser';
import { fetchLoginUserProfile } from '@noeldemartin/solid-utils';
import type { CompleteSolidUserProfile } from '@noeldemartin/solid-utils';
import { Person, TypeIndex } from 'soukai-bis';

import Task from './Task';
import TasksList from './TasksList';

let list: TasksList | null = null;
let profile: CompleteSolidUserProfile | null = null;
let user: Person | null = null;

export async function restoreSession(): Promise<Person | null> {
    // This function uses Inrupt's authentication library to restore a previous session. If you were
    // already logged into the application last time that you used it, this will trigger a redirect that
    // takes you back to the application. This usually happens without user interaction, but if you hadn't
    // logged in for a while, your identity provider may ask for your credentials again.
    //
    // After a successful login, this will also read the profile from your POD. Using fetchLoginUserProfile
    // instead of reading the WebId document directly will also find private data such as the private type
    // index, and discover the storage url if the profile doesn't declare one.
    //
    // @see https://docs.inrupt.com/developer-tools/javascript/client-libraries/tutorial/authenticate-browser/

    try {
        await handleIncomingRedirect({ restorePreviousSession: true });

        const session = getDefaultSession();

        if (!session.info.isLoggedIn || !session.info.webId) return null;

        profile = await fetchLoginUserProfile(session.info.webId, { required: true, fetch });
        user = Person.createFromProfile(profile);

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
    // and they introduce the url of their identity provider directly. In order to simplify this
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
        clientName: 'Tasks Manager',
    });
}

export async function performLogout(): Promise<void> {
    await logout();
}

export async function performTaskCreation(description: string): Promise<Task> {
    if (!user || !profile) {
        throw new Error('You must be logged in to create tasks');
    }

    if (!list) {
        // Applications should not hard-code the url of their containers, because users may have
        // their data anywhere in their POD. Instead, we register the container in the private type
        // index, so that it can be found the next time (by this or any other application).
        //
        // WebIds may declare more than one storage url, so in a real application you should ask
        // which one to use if that happens. In this app, in order to keep it simple, we'll just
        // use the first one.
        //
        // @see https://soukai.js.org/guide/advanced/interoperability.html#type-indexes
        const [privateTypeIndex] = await user.findPrivateTypeIndexes();
        const typeIndex = privateTypeIndex ?? (await TypeIndex.createPrivate(profile));

        list = await TasksList.createAt(profile.storageUrls[0], { name: 'Tasks' });

        await list.register(typeIndex, Task);
    }

    return list.relatedTasks.create({ description });
}

export async function performTaskUpdate(task: Task, done: boolean): Promise<void> {
    await task.toggle(done);
}

export async function performTaskDeletion(task: Task): Promise<void> {
    await list?.relatedTasks.delete(task);
}

export async function loadTasks(): Promise<Task[]> {
    if (!user) return [];

    // Users may have more than one container registered for tasks, so in a real application you
    // should handle that as well. In this app, in order to keep it simple, we'll just use the first one.
    const [tasksList] = await user.findRegisteredContainers(Task, { containerModelClass: TasksList });

    list = tasksList ?? null;

    if (!list) {
        return [];
    }

    return list.relatedTasks.load();
}

export function getAuthenticatedFetch(): typeof fetch {
    return fetch;
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
import Model from './TasksList.schema';

export default class TasksList extends Model {}
```

```ts [TasksList.schema.ts]
import { contains, defineContainerSchema } from 'soukai-bis';

export default defineContainerSchema({
    relations: {
        tasks: contains('Task'),
    },
});
```

```ts [models.d.ts]
import type Task from './Task';
import type TasksList from './TasksList';

declare module 'soukai-bis' {
    interface ModelsRegistry {
        Task: typeof Task;
        TasksList: typeof TasksList;
    }
}
```

:::
