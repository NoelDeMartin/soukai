#!/usr/bin/env bash

sed -i 's/Constructor<SolidModel> & SolidModel;/Constructor<SolidModel> \& typeof SolidModel;/g' "dist/soukai-solid.d.ts"
