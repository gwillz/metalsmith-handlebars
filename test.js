
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
    .use(handlebars({
        layouts: 'layouts/',
        partials: 'partials/',
        helpers: 'helpers/',
    }))
    .build((err, files) => {
        if (err) {
            assert.fail(err);
            return;
        }
        assert.ok(files['index.html'])
        
        const actual = files['index.html'].contents.toString();
        const expected = fs.readFileSync('test/expected.html', 'utf-8');
        
        assert.equal(expected, actual);
    })
    
    assert.end();
})
