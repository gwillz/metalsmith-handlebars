
const fs = require('fs')
const path = require('path')
const match = require('multimatch')
const Handlebars = require('handlebars')

module.exports = function main(options) {
    options = Object.assign({
        pattern: '**/*.hbs',
        extension: '.hbs',
        partials: null,
        helpers: null,
        layouts: null,
    }, options)
    
    return async function handlebars(files, metalsmith, done) {
        try {
            const validFiles = match(Object.keys(files), options.pattern);
            let layouts = [];
            
            if (validFiles.length === 0) {
                throw new Error(`Pattern '${options.pattern}' did not match any files.`)
            }
            
            if (options.layouts) {
                layouts = await loadLayouts(options.layouts, options.extension);
            }
            
            await Promise.all([
                registerPartials(options.partials, options.extension),
                registerHelpers(options.helpers),
            ])
            
            const settings = {
                metadata: {
                    __dirname: metalsmith._directory,
                    ...metalsmith.metadata(),
                },
                extension: options.extension,
                layouts,
            };
            
            await Promise.all(validFiles.map(filename => (
                render(filename, files[filename], settings))
            ));
            
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


function render(filename, file, settings) {
    return new Promise(resolve => {
        const {contents, ...locals} = file;
        file.contents = new Buffer(compile(
            filename,
            contents.toString(),
            {...settings.metadata, ...locals},
            settings,
        ));
        resolve();
    })
}


function compile(filename, contents, context, settings) {
    const {layout, ...locals} = context;
    
    if (layout) {
        const name = path.basename(layout, settings.extension);
        if (settings.layouts[name]) {
            const template = Handlebars.compile(settings.layouts[name]);
            if (path.extname(filename) === settings.extension) {
                contents = compile(filename, contents, locals, settings);
            }
            return template({ ...context, contents });
        }
    }
    const template = Handlebars.compile(contents);
    return template(locals);
}


function move(files, filename, extension) {
    const newname = path.join(
        path.dirname(filename),
        path.basename(filename, extension) + '.html',
    );
    if (newname !== filename && path.extname(filename) === extension) {
        files[newname] = files[filename];
        delete files[filename];
    }
}


function registerPartials(directory, extension) {
    return loadFiles(directory, extension)
    .then(files => Promise.all(
        files.map(({name, file}) => (
            asyncRead(name, file)
            .then(({name, contents}) => {
                Handlebars.registerPartial(name, contents);
            })
        ))
    ))
}

function registerHelpers(directory) {
    return loadFiles(directory, '.js')
    .then(files => {
        files.forEach(({name, file}) => {
            Handlebars.registerHelper(name, require(file));
        })
    })
}

function loadLayouts(directory, extension) {
    return loadFiles(directory, extension)
    .then(files => Promise.all(
        files.map(({name, file}) => asyncRead(name, file))
    ))
    .then(files => files.filter(file => file))
    .then(files => (
        files.reduce((sum, {name, contents}) => (sum[name] = contents, sum), {})
    ))
}

function loadFiles(directory, extension) {
    return new Promise(resolve => {
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

function asyncRead(name, file) {
    return new Promise(resolve => {
        fs.readFile(file, {encoding: 'utf-8'}, (err, contents) => {
            if (err && err.code === 'EISDIR') {resolve(); return}
            if (err) throw err;
            resolve({name, contents});
        })
    })
}
