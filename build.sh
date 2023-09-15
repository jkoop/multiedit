#! /bin/bash

cp -v ./src/{favicon.png,{index,invalid-path}.html,app.{html,css}} ./build/
bun build --watch --target=browser --outdir=build ./src/app.ts
