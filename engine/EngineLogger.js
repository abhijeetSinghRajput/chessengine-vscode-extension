const fs = require("fs");
const path = require("path");

class EngineLogger {
    constructor(file) {
        this.file = file;

        fs.mkdirSync(path.dirname(file), { recursive: true });
    }

    log(prefix, text) {
        const time = new Date().toISOString();
        fs.appendFileSync(
            this.file,
            `[${time}] ${prefix} ${text}\n`
        );
    }

    send(cmd) {
        this.log(">>>", cmd);
    }

    recv(line) {
        this.log("<<<", line);
    }

    error(line) {
        this.log("ERR", line);
    }

    event(line) {
        this.log("!!!", line);
    }
}

module.exports = { EngineLogger };