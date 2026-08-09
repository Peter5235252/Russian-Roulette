const fs = require('fs');
const ts = require('typescript');
const content = fs.readFileSync('src/components/Arena3D.tsx', 'utf-8');

function check() {
  try {
    const sourceFile = ts.createSourceFile('Arena3D.tsx', content, ts.ScriptTarget.Latest, true);
    console.log("TS parse completed.");
  } catch (e) {
    console.log(e);
  }
}
check();
