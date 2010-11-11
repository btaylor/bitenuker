/*
 * Copyright (c) 2010 Brad Taylor <brad@getcoded.net>
 *
 * This program is free software: you can redistribute it and/or modify it under
 * the terms of the GNU Affero General Public License as published by the Free
 * Software Foundation, either version 3 of the License, or (at your option) any
 * later version.
 *
 * This program is distributed in the hope that it will be useful, but WITHOUT
 * ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS
 * FOR A PARTICULAR PURPOSE.  See the GNU Affero General Public License for more
 * details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 */

// TODO: Class-ize
// TODO: Jquery-ize
// TODO: More 30 Rock quotes


CKEDITOR.config.toolbar_None = [];
// Enabling this will remove the ugly theme
//CKEDITOR.config.plugins = 'wysiwygarea,htmldataprocessor';
CKEDITOR.config.toolbarCanCollapse = false;

CKEDITOR.replace ('editor', {
    skin : 'v2',
});

CKEDITOR.htmlDataProcessor = function (editor) {
    this.editor = editor;
    this.writer = new CKEDITOR.htmlWriter ();
    this.dataFilter = new CKEDITOR.htmlParser.filter ();
    this.htmlFilter = new CKEDITOR.htmlParser.filter ();
};

// TODO: Replace with singleton class
var TokenBOL = 0;
var TokenWord = 1;
var TokenAsterisk = 2;
var TokenHyphen = 3;
var TokenBackslash = 4;
var TokenBacktick = 5;
var TokenPound = 6;
var TokenApostrophe = 7;
var TokenNewline = 8;
var TokenWhitespace = 9;
var TokenEOL = 100;

// TODO: Refactor
var MaxMultipleTokenCount = { };
MaxMultipleTokenCount[TokenWord] = -1;
MaxMultipleTokenCount[TokenWhitespace] = -1;
MaxMultipleTokenCount[TokenAsterisk] = 3;
MaxMultipleTokenCount[TokenPound] = 3;
MaxMultipleTokenCount[TokenApostrophe] = 3;

var EscapableTokens = { };
EscapableTokens[TokenAsterisk] = true;
EscapableTokens[TokenHyphen] = true;
EscapableTokens[TokenBackslash] = true;
EscapableTokens[TokenBacktick] = true;
EscapableTokens[TokenPound] = true;
EscapableTokens[TokenApostrophe] = true;

function scanMarkdown (markdown) {
    var tokens = [];

    // Add a beginning of line marker
    tokens.push ({ type: TokenBOL, str: '', count: 1 });

    for (var i = 0; i < markdown.length; i++) {
        var c = markdown.charAt (i);
        var type = TokenWord;

        switch (c) {
        case '*':
            type = TokenAsterisk;
            break;
        case '-':
            type = TokenHyphen;
            break;
        case '\\':
            type = TokenBackslash;
            break;
        case '`':
            type = TokenBacktick;
            break;
        case '\n':
            type = TokenNewline;
            break;
        case '#':
            type = TokenPound;
            break;
        case '\'':
            type = TokenHyphen;
            break;
        case ' ':
            type = TokenWhitespace;
            break;
        }

        if (i > 0) {
            var last = tokens[tokens.length - 1];

            // If the previous token was a backslash (escape
            // character), consider this character as just a word.
            if (last.type == TokenBackslash
                && type in EscapableTokens) {
                type = TokenWord;
            }

            if (type in MaxMultipleTokenCount) {
                var max = MaxMultipleTokenCount[type];
                if (last.type == type
                    && (max < 0 || last.count < max)) {
                    last.str += c;
                    last.count++;

                    tokens[tokens.length - 1] = last;
                    continue;
                }
            }
        }

        tokens.push ({ type: type, str: c, count: 1 });
    }

    // Add an end of line marker
    tokens.push ({ type: TokenEOL, str: '', count: 1 });

    return tokens;
}

function parseMarkdown (tokens) {
    var ret = parseMarkdownRecursive (tokens, 0, []);
    return 'output' in ret ? ret.output : '';
}

/* TODO: Use this code to methodize duplication
var recurisveTokenHandlers = {
    TokenAsterisk: {
        handler: function (token, ret) {
            if (token.count == 1)
                return '<em>' + ret.output + '</em>';
            else if (token.count == 2)
                return '<strong>' + ret.output + '</strong>';
            else if (token.count == 3)
                return '<em><strong>' + ret.output + '</strong></em>';
            return ret.output;
        }
    },
    TokenHyphen: {
        handler: function (token, ret) {
            return '<strike>' + ret.output + '</strike>';
        }
    },
    TokenBacktick: {
        handler: function (token, ret) {
            return '<tt>' + ret.output + '</tt>';
        }
    },
    TokenPound: {
        handler: function (token, ret) {
            if (token.count == 1)
                return '<h1>' + ret.output + '</h1>';
            else if (token.count == 2)
                return '<h2>' + ret.output + '</h2>';
            else if (token.count == 3)
                return '<small>' + ret.output + '</small>';
            return ret.output;
        }
    },
    TokenApostrophe: {
        handler: function (token, ret) {
            return '<span style="background-color: rgb(255, 255, 0);">'
                   + ret.output + '</span>';
        }
    },
};
*/

function parseMarkdownRecursive (tokens, i, termini) {
    var output = '';
    var token = null;

    var insideAsterisk = false;
    var insideHyphen = false;
    var insideBacktick = false;
    var insidePound = false;
    var insideApostrophe = false;

    while (i < tokens.length) {
        token = tokens[i];

        for (var key in termini) {
            var terminus = termini[key];
            if (token.type == terminus.type
                && token.count == terminus.count) {
                return {
                    output: output, index: i, reachedTerminus: true, token: token,
                };
            }
        }

        switch (token.type) {
        case TokenAsterisk:
            // When handling bulleted lists, we have a maximum of 2-lookbehind and 1-lookahead.
            // We look backward and should see a newline or beginning of line
            // token.  We could see a block of whitespace before this, and the
            // number relative to other whitespace values indicates our
            // indention level.
            // Ahead of us must be a single whitespace for this to be valid.
            // TODO: Bounds-checking
            if ((tokens[i - 1].type == TokenNewline || tokens[i - 1].type == TokenBOL)
                && tokens[i + 1].type == TokenWhitespace) {
                // Advance twice to eat our character and the next whitespace
                // character.
                var ret = parseMarkdownRecursive (tokens, i + 2, [
                    { type: token.type, count: token.count },
                    { type: TokenNewline, count: 1 },
                ]);

                // If we found another asterisk, it's not a list
                if (ret.token.type != TokenAsterisk) {
                    output += '<ul>';

                    // Disregard whether or not we hit the terminus, since EOL is
                    // also a valid terminus.
                    i = ret.index;
                    output += '<li>' + ret.output + '</li>';

                    // Now, recursively search for the two newlines that terminate
                    // the bulleted list
                    ret = parseMarkdownRecursive (tokens, i + 1, [
                        { type: TokenNewline, count: 2 },
                    ]);

                    i = ret.index;
                    output += ret.output + '</ul>';
                    break;
                }
            }

            // TODO: Method-ize this duplication
            // Recursively search for the matching set of asterisks
            var ret = parseMarkdownRecursive (tokens, i + 1, [
                { type: token.type, count: token.count },
                { type: TokenNewline, count: 1 },
            ]);

            // Either we reached the end of the file, in which case
            // we ignore the tag, or we hit a newline before we
            // found our matching asterisk.

            if (ret.token.type != token.type || !ret.reachedTerminus) {
                output += token.str + ret.output;
                i = ret.index - 1; // ensure the last token is reparsed
                break;
            }

            i = ret.index;
            if (token.count == 1)
                output += '<em>' + ret.output + '</em>';
            else if (token.count == 2)
                output += '<strong>' + ret.output + '</strong>';
            else if (token.count == 3)
                output += '<em><strong>' + ret.output + '</strong></em>';
            break;
        case TokenHyphen:
            // TODO: Method-ize this duplication
            // Recursively search for the matching set of hyphens
            var ret = parseMarkdownRecursive (tokens, i + 1, [
                { type: token.type, count: token.count },
                { type: TokenNewline, count: 1 },
            ]);

            // Either we reached the end of the file, in which case
            // we ignore the tag, or we hit a newline before we
            // found our matching hyphen.

            if (ret.token.type != token.type || !ret.reachedTerminus) {
                output += token.str + ret.output;
                i = ret.index - 1; // ensure the last token is reparsed
                break;
            }

            i = ret.index;
            output += '<strike>' + ret.output + '</strike>';
            break;
        case TokenBackslash:
            // ignore
            break;
        case TokenBacktick:
            // TODO: Method-ize this duplication
            // Recursively search for the matching set of backticks
            var ret = parseMarkdownRecursive (tokens, i + 1, [
                { type: token.type, count: token.count },
                { type: TokenNewline, count: 1 },
            ]);

            // Either we reached the end of the file, in which case
            // we ignore the tag, or we hit a newline before we
            // found our matching backticks.

            if (ret.token.type != token.type || !ret.reachedTerminus) {
                output += token.str + ret.output;
                i = ret.index - 1; // ensure the last token is reparsed
                break;
            }

            i = ret.index;
            output += '<tt>' + ret.output + '</tt>';
            break;
        case TokenPound:
            // TODO: Method-ize this duplication
            // Recursively search for the matching set of pounds
            var ret = parseMarkdownRecursive (tokens, i + 1, [
                { type: token.type, count: token.count },
                { type: TokenNewline, count: 1 },
            ]);

            // Either we reached the end of the file, in which case
            // we ignore the tag, or we hit a newline before we
            // found our matching pounds.

            if (ret.token.type != token.type || !ret.reachedTerminus) {
                output += token.str + ret.output;
                i = ret.index - 1; // ensure the last token is reparsed
                break;
            }

            i = ret.index;
            if (token.count == 1)
                output += '<h1>' + ret.output + '</h1>';
            else if (token.count == 2)
                output += '<h2>' + ret.output + '</h2>';
            else if (token.count == 3)
                output += '<small>' + ret.output + '</small>';
            break;
        case TokenApostrophe:
            if (token.count < 3) {
                output += token.str;
                break;
            }

            // TODO: Method-ize this duplication
            // Recursively search for the matching set of apostrophes
            var ret = parseMarkdownRecursive (tokens, i + 1, [
                { type: token.type, count: token.count },
                { type: TokenNewline, count: 1 },
            ]);

            // Either we reached the end of the file, in which case
            // we ignore the tag, or we hit a newline before we
            // found our matching apostrophes.

            if (ret.token.type != token.type || !ret.reachedTerminus) {
                output += token.str + ret.output;
                i = ret.index - 1; // ensure the last token is reparsed
                break;
            }

            i = ret.index;
            output += '<span style="background-color: rgb(255, 255, 0);">'
                      + ret.output + '</span>';
            break;
        case TokenNewline:
            output += '<br>' + token.str;
            break;
        case TokenWhitespace:
            if (token.count > 1)
                output += ' ' + new Array (token.count - 1).join ('&nbsp;');
            else
                output += token.str;
            break;
        case TokenWord:
        default:
            output += token.str;
            break;
        }
        i++;
    }

    return {
        output: output, index: i, reachedTerminus: false, token: token,
    };
}

CKEDITOR.htmlDataProcessor.prototype = {
    /*
     * Returns a string representing the HTML format of "data". The returned
     * value will be loaded in the editor.
     * The HTML must be from <html> to </html>, eventually including
     * the DOCTYPE.
     *     @param {String} data The data to be converted in the
     *            DataProcessor specific format.
     */
    toHtml: function (data, fixForBody) {
        var tokens = scanMarkdown (data);
        var html = parseMarkdown (tokens);

        alert (html);
        return html;

//        return data.replace (/\n/g, '<br />')
//                   .replace (/\*\*\*(\w+)\*\*\*/g, '<span style="background-color: rgb\(255, 255, 0\);">$1</span>')
//                   .replace (/\*\*(\w+)\*\*/g, '<strong>$1</strong>')
//                   .replace (/\*(\w+)\*/g, '<em>$1</em>')
//                   .replace (/`([^\n`]+)`/g, '<tt>$1</tt>')
//                   .replace (/-([^\n-]+)-/g, '<strike>$1</strike>')
//                   .replace (/###([^\n]+)###/g, '<small>$1</small>')
//                   .replace (/##([^\n]+)##/g, '<h2>$1</h2>')
//                   .replace (/#([^\n]+)#/g, '<h1>$1</h1>')
//        ;
    },

    /*
     * Converts a DOM (sub-)tree to a string in the data format.
     *     @param {Object} rootNode The node that contains the DOM tree to be
     *            converted to the data format.
     *     @param {Boolean} excludeRoot Indicated that the root node must not
     *            be included in the conversion, only its children.
     */
    toDataFormat: function (html, fixForBody) {
        // XXX: This needs to be done with an actual parser, not regex.
        return html.replace (/<br ?\/?>/g, '\n')
                   .replace (/<span style="background-color: rgb\(255, 255, 0\);">([^>]*)<\/span>/, '***$1***')
                   .replace (/<\/?strong>/g, '**')
                   .replace (/<\/?em>/g, '*')
                   .replace (/<\/?tt>/g, '`')
                   .replace (/<\/?strike>/g, '-')
                   .replace (/<\/?small>/g, '###')
                   .replace (/<\/?h2>/g, '##')
                   .replace (/<\/?h1>/g, '#')
        ;
    },
};
