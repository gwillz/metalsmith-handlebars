
const fs = require('fs')
const path = require('path')
const match = require('multimatch')
const Handlebars = require('handlebars')

module.exports = function main(options) {
    options = Object.assign({
        pattern: '**/*.hbs', // Only process (layouting, compiling) these files
        extension: '.hbs',   // Only 'compile' these files
        partials: null,      // path to partials (.hbs)
        helpers: null,       // path to helpers (.js)
        layouts: null,       // path to layouts (.hbs)
    }, options)
    
    // plugin export
    return async function handlebars(files, metalsmith, done) {
        try {
            // filter for processing files
            const validFiles = match(Object.keys(files), options.pattern);
            
            if (validFiles.length === 0) {
                throw new Error(`Pattern '${options.pattern}' did not match any files.`)
            }
            
            // add working directory to options
            for (let option of ['partials', 'layouts', 'helpers']) {
                if (!options[option]) continue;
                options[option] = path.resolve(metalsmith._directory, options[option]);
            }
            
            // load layouts, if present (else it returns [])
            const layouts = await loadLayouts(options.layouts, options.extension);
            
            // load partials and helpers concurrently, if present
            await Promise.all([
                registerPartials(options.partials, options.extension),
                registerHelpers(options.helpers),
            ])
            
            // common properties for compiling stage
            const settings = {
                metadata: {
                    __dirname: metalsmith._directory,
                    ...metalsmith.metadata(),
                },
                extension: options.extension,
                layouts,
            };
            
            // compile files concurrently
            await Promise.all(validFiles.map(filename => (
                render(filename, files[filename], settings))
            ));
            
            // rename files (i.e. .hbs -> .html)
            for (let filename of validFiles) {
                move(files, filename, options.extension);
            }
            done();
        }
        catch (err) {
            done(err);
        }
    }
}

/**
 * Render a template into file.contents.
 * TODO: A better name?
 */
function render(filename, file, settings) {
    return new Promise(resolve => {
        // separate 'contents' from context
        const {contents, ...locals} = file;
        
        // rewrite contents from compile()
        file.contents = new Buffer(compile(
            filename,
            contents.toString(),
            {...settings.metadata, ...locals}, // global + local context
            settings,
        ));
        resolve();
    })
}

/**
 * The magical everything.
 * This will compile a _layout_ template, if specified by the context
 * variable 'layout'. It will also compile the contents if it is a '.hbs' file.
 * If it has no layout and is not an '.hbs' file, it will pass through untouched.
 *
 * Expect this to compile() at least once, maybe twice. Hopefully not more.
 */
function compile(filename, contents, context, settings) {
    const {layout, ...locals} = context;
    
    // insert contents into a layout template
    if (layout) {
        const name = path.basename(layout, settings.extension);
        if (!settings.layouts[name]) {
            throw new Error(`Layout '${layout}' doesn't exist. (from '${filename}')`);
        }
        
        // here we compile the _layout_ template instead
        const template = Handlebars.compile(settings.layouts[name]);
        
        // and recursively compile the _contents_ template, if appropriate
        if (path.extname(filename) === settings.extension) {
            contents = compile(filename, contents, locals, settings);
        }
        
        // otherwise just insert contents as usual
        return template({ ...context, contents });
    }
    
    // perform in-place templating of _contents_
    if (path.extname(filename) === settings.extension) {
        const template = Handlebars.compile(contents);
        return template(locals);
    }
    
    // otherwise do nothing
    return contents;
}


/**
 * Rename a file: .hbs -> .html.
 */
function move(files, filename, extension) {
    const newname = path.join(
        path.dirname(filename),
        path.basename(filename, extension) + '.html',
    );
    // don't rename if it's indentical or not applicable
    if (newname !== filename && path.extname(filename) === extension) {
        files[newname] = files[filename];
        delete files[filename];
    }
}

/**
 * Load a directory of partial templates (.hbs) and register with the
 * global 'Handlebars' object.
 */
function registerPartials(directory, extension) {
    return loadFiles(directory, extension)
    // perform file reads concurrently
    .then(files => Promise.all(
        files.map(({name, file}) => (
            asyncRead(name, file)
            .then(({name, contents}) => {
                Handlebars.registerPartial(name, contents);
            })
        ))
    ))
}

/**
 * Load a directory of helpers (.js) and register with the
 * global 'Handlebars' object.
 */
function registerHelpers(directory) {
    return loadFiles(directory, '.js')
    .then(files => {
        files.forEach(({name, file}) => {
            Handlebars.registerHelper(name, require(file));
        })
    })
}

/**
 * Load a directory of layout templates and return a key/value map as:
 * :: basename -> contents.
 */
function loadLayouts(directory, extension) {
    return loadFiles(directory, extension)
    // read files concurrently
    .then(files => Promise.all(
        files.map(({name, file}) => asyncRead(name, file))
    ))
    // this filters directories that were ignored by asyncRead()
    .then(files => files.filter(file => file))
    // convert to a key/value map
    .then(files => (
        files.reduce((sum, {name, contents}) => (sum[name] = contents, sum), {})
    ))
}

/**
 * Load a directory into a list of objects as:
 * :: {name, file}
 */
function loadFiles(directory, extension) {
    return new Promise(resolve => {
        // ignore if falsey (i.e. options not set)
        if (!directory) resolve([]);
        
        fs.readdir(directory, (err, files) => {
            if (err) throw err;
            resolve(files.map(file => ({
                name: path.basename(file, extension),
                file: path.resolve(directory, file),
            })))
        })
    })
}

/**
 * Read a file, resolves with {name, contents}.
 */
function asyncRead(name, file) {
    return new Promise(resolve => {
        fs.readFile(file, {encoding: 'utf-8'}, (err, contents) => {
            // silently fail on directories
            if (err && err.code === 'EISDIR') {resolve(); return;}
            // raise errors otherwise
            if (err) throw err;
            // all good
            resolve({name, contents});
        })
    })
}
