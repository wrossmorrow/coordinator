#!/bin/bash

jsdoc src/coordinator.js -R README.md -d docs

for f in docs/*.html ; do 
	sed -i.bak '/^[ \s\t]*$/d' $f
	sed -Ei.bak 's/\[([^]]*)\]\(([^)]*)\)/<a href="\2">\1<\/a>/g' $f
done

for v in "$@" ; do
    if [[ ${v} =~ "deploy" ]] ; then 
		echo "DEPLOY: copying docs to remote hosted directory"
		scp -r docs/* me:/var/www/html/coordinator/
    fi
done