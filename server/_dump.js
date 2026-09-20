const fs = require('fs');
const L = fs.readFileSync('controllers/userController.js', 'utf8').split(/\r?\n/);
fs.writeFileSync('_g.txt', L.slice(190, 270).join('\n'));
console.log('DONE');
