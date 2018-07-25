
const test = require('tape')
const path = require('path')
const fs = require('fs')
const Metalsmith = require('metalsmith')
const handlebars = require('./index')

test("Execute example project", assert => {
    new Metalsmith(path.resolve(__dirname, 'test/'))
    .clean(true)
    .source('src')
    .destination('dest')
    .metadata({
        author: 'Me.',
    })
    
    // our plugin
    .use(handlebars({
        layouts: 'layouts/',
        partials: 'partials/',
        helpers: 'helpers/',
    }))
    
    // asserts performed in async
    .build((err, files) => {
        if (err) assert.fail(err);
        
        // fail on missing outputs
        assert.ok(files['index.html'], 'verify output [index.html]')
        
        const actual = files['index.html'].contents.toString();
        const expected = fs.readFileSync('test/expected.html', 'utf-8');
        
        // verify
        assert.equal(actual, expected, 'output matches [expected.html]');
        assert.end();
    })
})

// TODO test empty pattern

// TODO test compile() of non matching extensions

// TODO test move()

// TODO test registerPartials()

// TODO test registerHelpers()

// TODO test loadLayouts()

// TODO test loadFiles()

// TODO test asyncRead()
