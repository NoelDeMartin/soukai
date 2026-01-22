#!/usr/bin/env bash

sed -i 's/SchemaRelations, Model>;/SchemaRelations, typeof Model>;/g' "dist/soukai-bis.d.ts"
