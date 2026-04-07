const fs = require('fs');

const currentStr = fs.readFileSync('public/index.html', 'utf8');
const v4Str = fs.readFileSync('/Users/louis/esade i2p/index_edit_example_v4.html', 'utf8');

function getBlock(html, startTag, endTag) {
    const s = html.indexOf(startTag);
    const e = html.indexOf(endTag, s);
    if (s === -1 || e === -1) return null;
    return html.substring(s, e + endTag.length);
}

const currentScript = getBlock(currentStr, '<script>', '</script>');
const v4Script = getBlock(v4Str, '<script>', '</script>');

// We want v4 HTML & CSS, but with current JavaScript.
// Wait, are there differences inside the HTML rendered by JS?
// Let's replace the script block of v4 with current script block.
let merged = v4Str.replace(v4Script, currentScript);

// Also check if there's any `<script src=` we need to preserve, but both probably use standard fetch.
fs.writeFileSync('public/index.html', merged);
console.log("Merge complete");
