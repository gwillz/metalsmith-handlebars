
import fs from 'fs';
import path from 'path';
import match from 'multimatch';
import Handlebars from 'handlebars';
import type { Plugin, Files } from 'metalsmith';

interface Options {
    pattern: string;    // Only process (layouting, compiling) these files
    extension: string;  // Only 'compile' these files
    partials?: string;    // path to partials (.hbs)
    helpers?: string;    // path to helpers (.js)
    layouts?: string;    // path to layouts (.hbs)
}

export = main;

function main(opts: Partial<Options>): Plugin {
    
    // plugin export
    return async function handlebars(files, metalsmith, done) {
        const options: Options = {
            pattern: '**/*.hbs',
            extension: '.hbs',
            ...opts,
        };
        
        try {
            // filter for processing files
            const validFiles = match(Object.keys(files), options.pattern);
            
            if (validFiles.length === 0) {
                throw new Error(`Pattern '${options.pattern}' did not match any files.`)
            }
            
            let layouts = {} as Record<string, string>;
            
            // load partials and helpers concurrently, if present
            const tasks: Promise<any>[] = [];
            
            if (options.layouts) {
                options.layouts = path.resolve(metalsmith.directory(), options.layouts);
                
                tasks.push((async () => {
                    layouts = await loadLayouts(options.layouts!, options.extension);
                })());
            }
            
            if (options.partials) {
                options.partials = path.resolve(metalsmith.directory(), options.partials);
                tasks.push(registerPartials(options.partials, options.extension));
            }
            
            if (options.helpers) {
                options.helpers = path.resolve(metalsmith.directory(), options.helpers);
                tasks.push(registerHelpers(options.helpers));
            }
            
            await Promise.all(tasks);
            
            // common properties for compiling stage
            const settings = {
                metadata: {
                    __dirname: metalsmith.directory(),
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
 */
function render(filename: string, file: any, settings: any) {
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
 */
function compile(filename: string, contents: string, context: any, settings: any) {
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
function move(files: Files, filename: string, extension: string) {
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
 */
async function registerPartials(directory: string, extension: string) {
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
async function registerHelpers(directory: string) {
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
 */
async function loadLayouts(directory: string, extension: string) {
    const filenames = await loadFiles(directory);
    
    const map = {} as Record<string, string>;
    
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
async function loadFiles(directory: string): Promise<string[]> {
    return new Promise((resolve, reject) => {
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
 */
async function asyncRead(filepath: string): Promise<string|null> {
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
main.move = move;
main.registerPartials = registerPartials;
main.registerHelpers = registerHelpers;
main.loadLayouts = loadLayouts;
main.asyncRead = asyncRead;
main.Handlebars = Handlebars;
