#!/bin/bash
jsdoc src/coordinator.js -R README.md -d docs
for v in "$@" ; do
    if [[ ${v} =~ "deploy" ]] ; then 
	echo "DEPLOY: copying docs to remote hosted directory"
	scp -r docs/* me:/var/www/html/coordinator/
    fi
done