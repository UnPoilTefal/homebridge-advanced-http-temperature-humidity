.PHONY: build clean lint publish

build:
	npm run build

clean:
	npm run clean

lint:
	npx eslint src/

publish: build
	npm publish --access public
