
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
            done(null, files, metalsmith);
        }
        catch (err) {
            done(err, files, metalsmith);
        }
    }
}

/**
 * Render a template into file.contents.
 * TODO: A better name?
 * 
 * @param {string} filename
 * @param {object} file
 * @param {object} settings
 */
function render(filename, file, settings) {
    return new Promise(resolve => {
        // separate 'contents' from context
        const {contents, ...locals} = file;
        
        // rewrite contents from compile()
        file.contents = Buffer.from(compile(
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
 * 
 * @param {string} filename
 * @param {string} contents
 * @param {object} context
 * @param {object} settings
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
 * 
 * @param {any[]} files
 * @param {string} filename
 * @param {string} extension
 */
function move(files, filename, extension) {
    const { name, dir, ext } = path.parse(filename);
    const newname = path.join(dir, name + '.html');
    
    // don't rename if it's identical or not applicable
    if (newname !== filename && ext === extension) {
        files[newname] = files[filename];
        delete files[filename];
    }
}

/**
 * Load a directory of partial templates (.hbs) and register with the
 * global 'Handlebars' object.
 * 
 * @param {string} directory
 * @param {string} extension
 */
async function registerPartials(directory, extension) {
    const filenames = await loadFiles(directory);
    
    for (let filename of filenames) {
        const { name, ext } = path.parse(filename);
        if (ext !== extension) continue;
        
        const file = await asyncRead(filename);
        if (!file) continue;
        
        Handlebars.registerPartial(name, file);
    }
}

/**
 * Load a directory of helpers (.js) and register with the
 * global 'Handlebars' object.
 */
async function registerHelpers(directory) {
    const filenames = await loadFiles(directory);
    
    for (let filename of filenames) {
        const { name, ext } = path.parse(filename);
        if (ext !== ".js") continue;
        
        const file = require(filename);
        Handlebars.registerHelper(name, file);
    }
}

/**
 * Load a directory of layout templates and return a key/value map as:
 * :: basename -> contents.
 * @param {string} directory
 * @param {string} extension
 * @return {Record<string, string>}
 */
async function loadLayouts(directory, extension) {
    const filenames = await loadFiles(directory);
    
    const map = {};
    
    for (let filename of filenames) {
        const { name, ext } = path.parse(filename);
        if (ext !== extension) continue;
        
        const file = await asyncRead(filename);
        if (!file) continue;
        
        map[name] = file;
    }
    
    return map;
}

/**
 * Load a directory into a list of string paths.
 * @param {string} directory
 * @return {string[]}
 */
async function loadFiles(directory) {
    return new Promise((resolve, reject) => {
        // ignore if falsey (i.e. options not set)
        if (!directory) resolve([]);
        
        fs.readdir(directory, (err, files) => {
            if (err) {
                reject(err);
            }
            else {
                const paths = files.map(file => path.resolve(directory, file));
                resolve(paths);
            }
        });
    });
}

/**
 * Read a file as a string.
 * 
 * @param {string} filename
 * @return {Promise<string|null>}
 */
async function asyncRead(filepath) {
    return new Promise((resolve, reject) => {
        fs.readFile(filepath, {encoding: 'utf-8'}, (err, contents) => {
            // silently fail on directories
            if (err && err.code === 'EISDIR') {
                resolve(null);
            }
            // raise errors otherwise
            else if (err) {
                reject(err);
            }
            // all good
            else {
                resolve(contents);
            }
        })
    })
}

// export utility functions for testing
module.exports.move = move;
module.exports.registerPartials = registerPartials;
module.exports.registerHelpers = registerHelpers;
module.exports.loadLayouts = loadLayouts;
module.exports.asyncRead = asyncRead;
module.exports.Handlebars = Handlebars;
