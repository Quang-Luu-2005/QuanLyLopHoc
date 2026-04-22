const fs = require('fs');
const path = require('path');

// Files to validate
const files = {
  'src/FormSync.gs': fs.readFileSync('src/FormSync.gs', 'utf8'),
  'src/AppEntry.gs': fs.readFileSync('src/AppEntry.gs', 'utf8'),
  'src/PairingService.gs': fs.readFileSync('src/PairingService.gs', 'utf8')
};

// Extract script from HTML
const htmlContent = fs.readFileSync('src/Template.html', 'utf8');
const scriptMatch = htmlContent.match(/<script>([\s\S]*?)<\/script>/);
const scriptContent = scriptMatch ? scriptMatch[1] : '';
if (scriptContent) {
  files['src/Template.html <script>'] = scriptContent;
}

let passCount = 0;
let failCount = 0;
const results = [];

for (const [name, content] of Object.entries(files)) {
  try {
    new Function(content);
    passCount++;
    results.push('✓ PASS: ' + name);
  } catch (err) {
    failCount++;
    results.push('✗ FAIL: ' + name);
    results.push('  Error: ' + err.message);
  }
}

console.log(results.join('\n'));
console.log('');
console.log('Summary: ' + passCount + ' passed, ' + failCount + ' failed');
process.exit(failCount > 0 ? 1 : 0);
