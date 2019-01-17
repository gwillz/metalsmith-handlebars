# Metalsmith Handlebars

Templating in Metalsmith can get messy with lots of different plugins all sort
of trying to work together.

### Things this plugin will do:

- perform layouting with handlebar templates
- and _recursively_ template the contents
- include partials from a folder
- insert helpers from a folder

### Things this plugin will not do:

- anything but Handlebars (maybe later)
- load lots of unnecessary dependencies
- forget to load partials
- fail to load helpers from a parent directory
- ever give you up, or ever let you down


## In essence

This is a plugin that combines 3 or 4 other plugins and tries to do it right.

It's core capability is perform Handlebar templating on a multi-directory
project. Your layout templates can be `.hbs`, your immediate pages can be
`.hbs`, your extra-fancy plugin that loads pages over rsync can be `.hbs`.

At _each of these levels_ you can use the same global context variables
(provided by Metalsmith metadata and Yaml Front Matter), and the same helpers,
and the same partials.

Enjoy!


## Usage

### Set-up your files something like this:

```
layouts/  - for your master .hbs layouts
partials/ - for your .hbs partials
helpers/  - for your .js helpers
public/   - output directory
src/      - input directory
metadata.json - global context
```

### Write your `build.js` like this:
```js
Metalsmith(__dirname)
.source('./src')
.destination('./public')
.metadata(require('./metadata.json'))
.use(handlebars({
    layouts: 'layouts/',
    partials: 'partials/',
    helpers: 'helpers/',
}))

```


### Write a `metadata.json` file like this:
```json
{
    "siteTitle": "Wassup",
    "author": "Me."
}
```

### Write a layout template like this:

```html
<!DOCTYPE html>
<html>
{{> head }}
<body>
  {{{ contents }}}
</body>
</html>
```

### Write a partial template like this:
```html
<head>
    <title>{{ siteTitle }} - {{ page }}</title>
    <meta name="author" content="{{ author }}"/>
</head>
```

### Write a page template like this:

```html
---
layout: main.hbs
page: 'hey.'
---
<div class='container'>
    {{ titleHelper }}
</div>
```

### Write a helper like this:

```js
// helpers/titleHelper.js
module.exports = titleHelper function() {
    return `
        <h1>${this.page}</h1>
        <h2>By ${this.author}</h2>
    `;
}
```


### After that you're left with a regular old plumbus.

```html
<DOCTYPE html>
<html>
<head>
    <title>Wassup - hey.</title>
    <meta name="author" content="Me."/>
</head>
<body>
    <div class='container'>
        <h1>hey.</h1>
        <h2>By Me.</h2>
    </div>
</body>
</html>
```


## Notes

Not demoed here, but a particular use-case is in conjunction with
the _metalsmith-collections_ plugin. This plugin hoovers up files of a
sub-directory of `src/` and these files also may need templating.

This plugin _will_ template these appropriately. Given that they don't have
a `layout` property in their YAML header, they will instead render in-place
without applying a layout template.
