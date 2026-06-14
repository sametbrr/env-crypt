'use strict';

function readPassword(prompt) {
  return new Promise((resolve) => {
    process.stdout.write(prompt);

    if (!process.stdin.isTTY || !process.stdin.setRawMode) {
      // Non-interactive (piped input / CI) — read plain line
      const readline = require('readline');
      const rl = readline.createInterface({ input: process.stdin });
      rl.once('line', line => { rl.close(); resolve(line); });
      return;
    }

    const stdin = process.stdin;
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding('utf8');

    let password = '';
    function onData(ch) {
      if (ch === '\r' || ch === '\n') {
        stdin.setRawMode(false);
        stdin.pause();
        stdin.removeListener('data', onData);
        process.stdout.write('\n');
        resolve(password);
      } else if (ch === '') {
        process.stdout.write('\n');
        process.exit(1);
      } else if (ch === '' || ch === '') {
        if (password.length > 0) {
          password = password.slice(0, -1);
          process.stdout.write('\b \b');
        }
      } else {
        password += ch;
        process.stdout.write('*');
      }
    }

    stdin.on('data', onData);
  });
}

module.exports = { readPassword };
