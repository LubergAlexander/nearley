#!/usr/bin/env node

var rr = require('railroad-diagrams');
var fs = require('fs');
var path = require('path');
var nomnom = require('nomnom');


var opts = nomnom
    .script('nearley-railroad')
    .option('file', {
        position: 0,
        help: "A grammar .ne file (default stdin)"
    })
    .option('out', {
        abbr: 'o',
        help: "File to output to (default stdout)."
    })
    .option('version', {
        abbr: 'v',
        flag: true,
        help: "Print version and exit",
        callback: function() {
            return require('../package.json').version;
        }
    }).parse();

var input = opts.file ? fs.createReadStream(opts.file) : process.stdin;
var output = opts.out ? fs.createWriteStream(opts.out) : process.stdout;

function railroad(grm) {
    var rules = {};
    grm.forEach(function(instr) {
        if (instr.rules) {
            if (!rules[instr.name]) {
                rules[instr.name] = [];
            }
            rules[instr.name] = rules[instr.name].concat(instr.rules);
        }
    });
    
    ret = '<style type="text/css">\n';
    ret += fs.readFileSync(
        path.join(
            path.dirname(require.resolve('railroad-diagrams')),
            'railroad-diagrams.css'
        )
    ).toString();
    ret += '\n</style>';

    Object.keys(rules).forEach(function(r) {
        ret += '\n<br/><h1><code>'+ r +'</code></h1><br/>' + (diagram(r).toString());
    });



    function diagram(name) {
        var selectedrules = rules[name];
        var outer = {subexpression: selectedrules};

        function renderTok(tok) {
            // ctx translated to correct position already
            if (tok.subexpression) {
                return new rr.Choice(0, tok.subexpression.map(renderTok));
            } else if (tok.ebnf) {
                switch (tok.modifier) {
                case ":+":
                    return new rr.OneOrMore(renderTok(tok.ebnf));
                    break;
                case ":*":
                    return new rr.ZeroOrMore(renderTok(tok.ebnf));
                    break;
                case ":?":
                    return new rr.Optional(renderTok(tok.ebnf));
                    break;
                }
            } else if (tok.literal) {
                return new rr.Terminal(JSON.stringify(tok.literal));
            } else if (tok.mixin) {
                return new rr.Comment("Pas implementé.");
            } else if (tok.macrocall) {
                return new rr.Comment("Pas implementé.");
            } else if (tok.tokens) {
                return new rr.Sequence(tok.tokens.map(renderTok));
            } else if (typeof(tok) === 'string') {
                return new rr.NonTerminal(tok);
            } else if (tok.constructor === RegExp) {
                return new rr.Terminal(tok.toString());
            } else {
                return new rr.Comment("[Unimplemented]");
            }
        }

        return new rr.Diagram([renderTok(outer)]);
    }
    return ret;
}

var nearley = require('../lib/nearley.js');
var StreamWrapper = require('../lib/stream.js');
var parserGrammar = new require('../lib/nearley-language-bootstrapped.js');
var parser = new nearley.Parser(parserGrammar.ParserRules, parserGrammar.ParserStart);
input
    .pipe(new StreamWrapper(parser))
    .on('finish', function() {
        output.write(railroad(parser.results[0]));
    });
