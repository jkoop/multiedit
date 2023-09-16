#! /bin/bash

cp -v ./src/{favicon.png,index.{html,css},app.{html,css}} ./build/
bun build --watch --target=browser --outdir=build ./src/{app,index,background}.ts
