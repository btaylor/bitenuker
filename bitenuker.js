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

// TODO: Jquery-ize
// TODO: More 30 Rock quotes

function BiteNuker () {
    this._init ();
}

BiteNuker.prototype = {
    _init : function () {
        this.MarkdownTokens = {
            BOL : 0,
            Word : 1,
            Asterisk : 2,
            Hyphen : 3,
            Backslash : 4,
            Backtick : 5,
            Pound : 6,
            Apostrophe : 7,
            Newline : 8,
            Whitespace : 9,
            EOL : 100
        };

        this.maxMultipleTokenCount = [];
        this.maxMultipleTokenCount[this.MarkdownTokens.Word] = -1;
        this.maxMultipleTokenCount[this.MarkdownTokens.Whitespace] = -1;
        this.maxMultipleTokenCount[this.MarkdownTokens.Asterisk] = 3;
        this.maxMultipleTokenCount[this.MarkdownTokens.Pound] = 3;
        this.maxMultipleTokenCount[this.MarkdownTokens.Apostrophe] = 3;

        this.escapableTokens = [];
        this.escapableTokens[this.MarkdownTokens.Asterisk] = true;
        this.escapableTokens[this.MarkdownTokens.Hyphen] = true;
        this.escapableTokens[this.MarkdownTokens.Backslash] = true;
        this.escapableTokens[this.MarkdownTokens.Backtick] = true;
        this.escapableTokens[this.MarkdownTokens.Pound] = true;
        this.escapableTokens[this.MarkdownTokens.Apostrophe] = true;
    },

    _scanMarkdown : function (markdown) {
        var tokens = [];

        // Add a beginning of line marker
        tokens.push ({ type: this.MarkdownTokens.BOL, str: '', count: 1 });

        for (var i = 0; i < markdown.length; i++) {
            var c = markdown.charAt (i);
            var type = this.MarkdownTokens.Word;

            switch (c) {
            case '*':
                type = this.MarkdownTokens.Asterisk;
                break;
            case '-':
                type = this.MarkdownTokens.Hyphen;
                break;
            case '\\':
                type = this.MarkdownTokens.Backslash;
                break;
            case '`':
                type = this.MarkdownTokens.Backtick;
                break;
            case '\n':
                type = this.MarkdownTokens.Newline;
                break;
            case '#':
                type = this.MarkdownTokens.Pound;
                break;
            case '\'':
                type = this.MarkdownTokens.Hyphen;
                break;
            case ' ':
                type = this.MarkdownTokens.Whitespace;
                break;
            }

            if (i > 0) {
                var last = tokens[tokens.length - 1];

                // If the previous token was a backslash (escape
                // character), consider this character as just a word.
                if (last.type == this.MarkdownTokens.Backslash
                    && type in this.escapableTokens) {
                    type = this.MarkdownTokens.Word;
                }

                if (type in this.maxMultipleTokenCount) {
                    var max = this.maxMultipleTokenCount[type];
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
        tokens.push ({ type: this.MarkdownTokens.EOL, str: '', count: 1 });

        return tokens;
    },

    _parseMarkdownRecursive : function (tokens, i, termini) {
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
            case this.MarkdownTokens.Asterisk:
                // When handling bulleted lists, we have a maximum of 2-lookbehind and 1-lookahead.
                // We look backward and should see a newline or beginning of line
                // token.  We could see a block of whitespace before this, and the
                // number relative to other whitespace values indicates our
                // indention level.
                // Ahead of us must be a single whitespace for this to be valid.
                if (i > 0 && tokens.length > 2
                    && (tokens[i - 1].type == this.MarkdownTokens.Newline || tokens[i - 1].type == this.MarkdownTokens.BOL)
                    && tokens[i + 1].type == this.MarkdownTokens.Whitespace) {
                    // Advance twice to eat our character and the next whitespace
                    // character.
                    var ret = this._parseMarkdownRecursive (tokens, i + 2, [
                        { type: token.type, count: token.count },
                        { type: this.MarkdownTokens.Newline, count: 1 },
                    ]);

                    // If we found another asterisk, it's not a list
                    if (ret.token.type != this.MarkdownTokens.Asterisk) {
                        output += '<ul>';

                        // Disregard whether or not we hit the terminus, since EOL is
                        // also a valid terminus.
                        i = ret.index;
                        output += '<li>' + ret.output + '</li>';

                        // Now, recursively search for the two newlines that terminate
                        // the bulleted list
                        ret = this._parseMarkdownRecursive (tokens, i + 1, [
                            { type: this.MarkdownTokens.Newline, count: 2 },
                        ]);

                        i = ret.index;
                        output += ret.output + '</ul>';
                        break;
                    }
                }

                // TODO: Method-ize this duplication
                // Recursively search for the matching set of asterisks
                var ret = this._parseMarkdownRecursive (tokens, i + 1, [
                    { type: token.type, count: token.count },
                    { type: this.MarkdownTokens.Newline, count: 1 },
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
            case this.MarkdownTokens.Hyphen:
                // TODO: Method-ize this duplication
                // Recursively search for the matching set of hyphens
                var ret = this._parseMarkdownRecursive (tokens, i + 1, [
                    { type: token.type, count: token.count },
                    { type: this.MarkdownTokens.Newline, count: 1 },
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
            case this.MarkdownTokens.Backslash:
                // ignore
                break;
            case this.MarkdownTokens.Backtick:
                // TODO: Method-ize this duplication
                // Recursively search for the matching set of backticks
                var ret = this._parseMarkdownRecursive (tokens, i + 1, [
                    { type: token.type, count: token.count },
                    { type: this.MarkdownTokens.Newline, count: 1 },
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
            case this.MarkdownTokens.Pound:
                // TODO: Method-ize this duplication
                // Recursively search for the matching set of pounds
                var ret = this._parseMarkdownRecursive (tokens, i + 1, [
                    { type: token.type, count: token.count },
                    { type: this.MarkdownTokens.Newline, count: 1 },
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
            case this.MarkdownTokens.Apostrophe:
                if (token.count < 3) {
                    output += token.str;
                    break;
                }

                // TODO: Method-ize this duplication
                // Recursively search for the matching set of apostrophes
                var ret = this._parseMarkdownRecursive (tokens, i + 1, [
                    { type: token.type, count: token.count },
                    { type: this.MarkdownTokens.Newline, count: 1 },
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
            case this.MarkdownTokens.Newline:
                output += '<br>' + token.str;
                break;
            case this.MarkdownTokens.Whitespace:
                if (token.count > 1)
                    output += ' ' + new Array (token.count - 1).join ('&nbsp;');
                else
                    output += token.str;
                break;
            case this.MarkdownTokens.Word:
            default:
                output += token.str;
                break;
            }
            i++;
        }

        return {
            output: output, index: i, reachedTerminus: false, token: token,
        };
    },

    convertToHtml : function (markdown) {
        var tokens = this._scanMarkdown (markdown);
        var ret = this._parseMarkdownRecursive (tokens, 0, []);
        return (ret && 'output' in ret) ? ret.output : '';
    }
};

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
