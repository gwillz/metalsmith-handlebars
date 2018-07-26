
const test = require('tape')
const path = require('path')
const fs = require('fs')
const Metalsmith = require('metalsmith')
const handlebars = require('./index')

test("Empty pattern", assert => {
    create()
    .use(handlebars({
        pattern: "foo.bar"
    }))
    .build((err, files) => {
        assert.ok(!!err, "error for bad pattern");
        assert.end();
    })
})

test("Missing layout", assert => {
    create()
    // our plugin
    .use(handlebars({
        pattern: 'index.hbs',
        layouts: '.',
        partial: 'partials/',
        helpesr: 'helpers/',
    }))
    .build((err, files) => {
        assert.ok(err, "missing layout [main.hbs] should raise an error");
        assert.end();
    })
})

test("Execute example project", assert => {
    create()
    // our plugin
    .use(handlebars({
        pattern: '*.{html,hbs}',
        extension: '.hbs',
        layouts: 'layouts/',
        partials: 'partials/',
        helpers: 'helpers/',
    }))
    .build((err, files) => {
        if (err) assert.fail(err);
        
        assert.ok(files['index.html'], 'verify output [index.html]')
        assert.ok(files['page-1.html'], 'verify output [page-1.html]')
        assert.ok(files['page-2.html'], 'verify output [page-2.html]')
        
        {
            const actual = files['index.html'].contents.toString();
            const expected = fs.readFileSync('test/expected-index.html', 'utf-8');
            assert.equal(actual, expected, 'output matches [expected-index.html]');
        }
        {
            const actual = files['page-1.html'].contents.toString();
            const expected = fs.readFileSync('test/expected-page-1.html', 'utf-8');
            assert.equal(actual, expected, 'output matches [expected-page-1.html]');
        }
        {
            const actual = files['page-2.html'].contents.toString();
            const expected = fs.readFileSync('test/expected-page-2.html', 'utf-8');
            assert.equal(actual, expected, 'output matches [expected-page-2.html]');
        }
        
        assert.end();
    })
})

test("move()", assert => {
    const files = {
        'foo.html': '1234',
        'foobar.md': 'abcd',
        'bar.hbs': '5678',
    }
    
    for (let file in files) {
        handlebars.move(files, file, '.hbs');
    }
    
    assert.equal(files['foo.html'], '1234', "[foo.html] is unchanged");
    assert.equal(files['foobar.md'], 'abcd', "[foobar.md] is unchanged");
    assert.equal(files['bar.html'], '5678', "[bar.html] now exists");
    assert.notOk(files['bar.hbs'], "[bar.hbs] should not exist");
    
    assert.end();
})


// shorthand
function create() {
    return new Metalsmith(path.resolve(__dirname, 'test/'))
    .clean(true)
    .source('src')
    .destination('dest')
    .metadata({
        author: 'Me.',
    })
}
