const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'src', 'Template.html');

try {
  // Read the file
  const fileContent = fs.readFileSync(filePath, 'utf8');
  
  // Extract content between <script> and </script> tags
  const scriptRegex = /<script[^>]*>([\s\S]*?)<\/script>/i;
  const match = fileContent.match(scriptRegex);
  
  if (!match) {
    console.log('ERROR: No <script> tags found in Template.html');
    process.exit(1);
  }
  
  const scriptContent = match[1];
  
  // Validate syntax using new Function()
  try {
    new Function(scriptContent);
    console.log('PASS: JavaScript syntax is valid');
    process.exit(0);
  } catch (syntaxError) {
    console.log('FAIL: Syntax Error');
    console.log('Error Message:', syntaxError.message);
    // Try to extract line/column info
    const errorStr = syntaxError.toString();
    console.log('Full Error:', errorStr);
    process.exit(1);
  }
} catch (err) {
  console.log('ERROR: Failed to read file:', err.message);
  process.exit(1);
}
