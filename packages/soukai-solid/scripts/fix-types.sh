#!/usr/bin/env bash

sed -i 's/\& SolidModel_2/\& typeof SolidModel/g' "dist/soukai-solid.d.ts"
sed -i 's/\& SolidModel_3/\& typeof SolidModel/g' "dist/soukai-solid.d.ts"
sed -i 's/\Constructor<SolidModel_2>/\Constructor<SolidModel>/g' "dist/soukai-solid.d.ts"
sed -i 's/\Constructor<SolidModel_3>/\Constructor<SolidModel>/g' "dist/soukai-solid.d.ts"
sed -i '/^import { SolidModel as SolidModel_2 } from/d' "dist/soukai-solid.d.ts"
sed -i '/^import { SolidModel as SolidModel_3 } from/d' "dist/soukai-solid.d.ts"
