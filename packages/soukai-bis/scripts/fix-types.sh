#!/usr/bin/env bash

sed -i 's/}, Model>;/}, typeof Model>;/g' "dist/soukai-bis.d.ts"
sed -i 's/typeof TypeRegistration, DocumentContainsManyRelation>;/typeof TypeRegistration, typeof DocumentContainsManyRelation>;/g' "dist/soukai-bis.d.ts"
