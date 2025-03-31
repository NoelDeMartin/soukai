# Tasks Manager (using Solid)

A classic example of using this library to make a Solid App is a full fledged Task Manager (albeit a simple one).

This example follows the same idea as the [0data Hello World](https://hello.0data.app/), but using Soukai and the newer ESM modules syntax. This also assumes that you'll be installing `soukai`, `soukai-solid`, and `@inrupt/solid-client-authn-browser` using npm. It's not impossible to use this library from a CDN, but the far more common use-case is to use a package manager.

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
        <script type="module" src="./main.js"></script>
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

```js [main.js]
import { bootSolidModels, SolidEngine } from 'soukai-solid';
import { setEngine } from 'soukai';

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

async function main() {
    bootSolidModels();
    setEngine(new SolidEngine(getAuthenticatedFetch()));

    const user = await restoreSession();

    document.getElementById('loading').setAttribute('hidden', '');

    if (!user) {
        document.getElementById('auth-guest').removeAttribute('hidden');

        return;
    }

    document.getElementById('username').innerHTML = `<a href="${user.url}" target="_blank">${user.name}</a>`;
    document.getElementById('auth-user').removeAttribute('hidden');

    const tasks = await loadTasks();

    for (const task of tasks) {
        appendTaskItem(task);
    }
}

function login() {
    const loginUrl = getLoginUrl();

    if (!loginUrl) return;

    performLogin(loginUrl);
}

async function logout() {
    document.getElementById('logout-button').setAttribute('disabled', '');

    await performLogout();

    document.getElementById('auth-guest').removeAttribute('hidden');
    document.getElementById('auth-user').setAttribute('hidden', '');
    document.getElementById('logout-button').removeAttribute('disabled');
}

async function createTask() {
    const description = prompt('Task description');

    if (!description) return;

    const task = await performTaskCreation(description);

    appendTaskItem(task);
}

async function updateTask(taskUrl, button) {
    const done = button.innerText === 'Complete';
    button.setAttribute('disabled', '');

    await performTaskUpdate(taskUrl, done);

    button.removeAttribute('disabled');
    button.innerText = done ? 'Undo' : 'Complete';
}

async function deleteTask(taskUrl, taskElement, button) {
    button.setAttribute('disabled', '');

    await performTaskDeletion(taskUrl);

    taskElement.remove();
}

function appendTaskItem(task) {
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

    document.getElementById('tasks').appendChild(taskItem);
}

main();

window.login = login;
window.logout = logout;
window.createTask = createTask;
window.updateTask = updateTask;
window.deleteTask = deleteTask;
window.onunhandledrejection = (error) => alert(`Error: ${error.reason?.message}`);
```

```js [solid.js]
import { fetch, getDefaultSession, handleIncomingRedirect, login, logout } from '@inrupt/solid-client-authn-browser';

import User from './User';
import TasksList from './TasksList';

let list, user;

export async function restoreSession() {
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

        if (!session.info.isLoggedIn) return false;

        user = await fetchUserProfile(session.info.webId);

        return user;
    } catch (error) {
        alert(error.message);

        return false;
    }
}

export function getLoginUrl() {
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

export function performLogin(loginUrl) {
    login({
        oidcIssuer: loginUrl,
        redirectUrl: window.location.href,
        clientName: 'Hello World',
    });
}

export async function performLogout() {
    await logout();
}

export async function performTaskCreation(description) {
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

    if (!list) {
        list = await TasksList.at(user.storageUrl).create({ url: `${user.storageUrl}tasks/` });
    }

    const task = list.relatedTasks.create({ description });

    return task;
}

export async function performTaskUpdate(taskUrl, done) {
    const task = list?.tasks.find((task) => task.url === taskUrl);

    await task.toggle(done);
}

export async function performTaskDeletion(taskUrl) {
    await list?.relatedTasks.delete(taskUrl);
}

export async function loadTasks() {
    // In a real application, you shouldn't hard-code the path to the container like we're doing here.
    // Read more about this in the comments on the performTaskCreation function.
    list = await TasksList.find(`${user.storageUrl}tasks/`);

    if (!list) {
        return [];
    }

    await list.loadRelation('tasks');

    return list.tasks;
}

export function getAuthenticatedFetch() {
    return fetch;
}

async function fetchUserProfile(webId) {
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

async function findUserStorage(url) {
    url = url.replace(/#.*$/, '');
    url = url.endsWith('/') ? url + '../' : url + '/../';
    url = new URL(url);

    const response = await fetch(url.href);

    if (response.headers.get('Link')?.includes('<http://www.w3.org/ns/pim/space#Storage>; rel="type"')) return url.href;

    if (url.pathname === '/') return url.href;

    return findUserStorage(url.href);
}
```

```js [Task.js]
import { FieldType } from 'soukai';
import { SolidModel } from 'soukai-solid';

const STATUS_COMPLETED = 'https://schema.org/CompletedActionStatus';
const STATUS_POTENTIAL = 'https://schema.org/PotentialActionStatus';

export default class Task extends SolidModel {
    static rdfContext = 'https://schema.org/';
    static rdfsClass = 'Action';
    static fields = {
        description: {
            required: true,
            type: FieldType.String,
        },
        status: {
            type: FieldType.Key,
            rdfProperty: 'actionStatus',
        },
    };

    get done() {
        return this.status === STATUS_COMPLETED;
    }

    async toggle(done) {
        if (typeof done === 'boolean') {
            done = !done;
        }

        if (done ?? this.done) {
            await this.update({ status: STATUS_POTENTIAL });

            return;
        }

        await this.update({ status: STATUS_COMPLETED });
    }
}
```

```js [TaskList.js]
import { SolidContainer } from 'soukai-solid';

import Task from './Task';

export default class TasksList extends SolidContainer {
    tasksRelationship() {
        return this.contains(Task);
    }
}
```

```js [User.js]
import { FieldType } from 'soukai';
import { SolidModel } from 'soukai-solid';

export default class User extends SolidModel {
    static rdfContexts = {
        default: 'http://xmlns.com/foaf/0.1/',
        pim: 'http://www.w3.org/ns/pim/space#',
    };
    static rdfsClass = 'Person';
    static fields = {
        name: FieldType.String,
        storageUrl: {
            type: FieldType.Key,
            rdfProperty: 'pim:storage',
        },
    };
}
```

:::
