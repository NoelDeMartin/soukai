/// <reference types="webpack-env" />

import { Model } from './model';

export function definitionsFromContext(context: __WebpackModuleApi.RequireContext): { [name: string]: typeof Model };
