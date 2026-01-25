#!/usr/bin/env bash

sed -i 's/}, Model>;/}, typeof Model>;/g' "dist/soukai-bis.d.ts"
sed -i 's/typeof TypeRegistration, BelongsToManyRelation>;/typeof TypeRegistration, typeof BelongsToManyRelation>;/g' "dist/soukai-bis.d.ts"
