# README
-------------------

## Sublime Config (LSP plugin)

```
{
  "clients":
  {
    "rotoscope":
    {
      "command": ["<path-to-rotoscope-ls>/server/out/server.js", "--stdio"],
      "scopes": ["source.ruby"],
      "syntaxes": ["Packages/Ruby/Ruby.sublime-syntax"],
      "languageId": "ruby",
      "settings": { "maxNumberOfProblems": 25 }
    }
  }
}
```


# How to run locally
* `brew install node npn`
* `npm install -g typescript`
* `npm install` to initialize the extension and the server

**For Sublime Text**
* `npm run standalone`
* `node server/out/server.js --stdio`

**For VS Code**
* `npm run compile` to compile the extension and the server
* open this folder in VS Code. In the Debug viewlet, run 'Launch Client' from drop-down to launch the extension and attach to the extension.
* create a file `test.txt`, and type `typescript`. You should see a validation error.
* to debug the server use the 'Attach to Server' launch config.
* set breakpoints in the client or the server.
