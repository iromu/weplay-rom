const join = require('path').join;
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const redis = require('weplay-common').redis();
const EventBus = require('weplay-common').EventBus;

// Asynchronous function to read folders and files recursively
function recursiveloop(dir, done) {
    var results = [];
    fs.readdir(dir, function (err, list) {
        if (err) return done(err);
        var i = 0;
        (function next() {
            var file = list[i++];
            if (!file) return done(null, results);
            file = dir + '/' + file;
            fs.stat(file, function (err, stat) {
                if (stat && stat.isDirectory()) {
                    recursiveloop(file, function (err, res) {
                        results = results.concat(res);
                        next();
                    });
                } else {
                    results.push(file);
                    next();
                }
            });
        })();
    });
}

class RomStoreService {

    constructor(discoveryUrl, discoveryPort) {
        this.uuid = require('node-uuid').v4();
        this.logger = require('weplay-common').logger('weplay-romstore', this.uuid);
        this.romsMap = [];
        this.defaultRomHash = undefined;
        this.romPath = join('data', 'rom');
        this.romDir = join(process.cwd(), this.romPath);
        this.statePath = join('data', 'state');

        const listeners = {
            'default:hash': (socket, request)=> {
                this.logger.info('< request', {socket: socket.id, request: request});
                var romSelection = this.getDefaultRom();

                this.logger.info('> hash', {socket: socket.id, hash: romSelection.hash});
                socket.emit('hash', {name: romSelection.name, hash: romSelection.hash});
            },
            'request': (socket, request)=> {
                this.logger.info('< request', {socket: socket.id, request: request});
                var romSelection = this.getRomSelection(socket.id);
                romSelection.emu = socket.id;
                socket.hash = romSelection.hash;

                this.logger.info(`> emu:${socket.id}:rom:hash`, romSelection.hash);
                socket.emit('hash', {name: romSelection.name, hash: romSelection.hash});

                if (romSelection.statePacked) {
                    this.logger.info(`> emu:${socket.id}:rom:state`, this.digest(romSelection.statePacked));
                    socket.emit('state', romSelection.statePacked);
                }
                else {
                    fs.readFile(romSelection.path, (err, romData) => {
                        if (err) {
                            logger.error(err);
                        }
                        this.logger.info(`> emu:${socket.id}:rom:data`);
                        socket.emit('data', romData);
                    });
                }
            },
            'state': (socket, state)=> {
                if (socket.hash) {
                    this.logger.info('< state', socket.hash, this.digest(state));
                    this.romsMap.filter(r=>r.hash === socket.hash && r.emu === socket.id)[0].statePacked = state;
                } else {

                    this.logger.error('< state (no hash)');
                }
            },
            'disconnect': (socket)=> {
                if (socket.hash) {
                    this.romsMap.filter(r=>r.hash === socket.hash)[0].emu = null;
                }
            }
        };

        this.bus = new EventBus({
            url: discoveryUrl,
            port: discoveryPort,
            name: 'rom',
            id: this.uuid,
            serverListeners: listeners
        }, ()=> {
            this.logger.info('RomStoreService connected to discovery server', {
                discoveryUrl: discoveryUrl,
                uuid: this.uuid
            });
            this.init();
        });
    }

    init() {
        this.loadRoms();
    }

    digest(state) {
        var md5 = crypto.createHash('md5');
        return md5.update(state).digest('hex');
    }

    getDefaultRom() {
        return this.romsMap.filter(r=>r.name !== 'default')[0];
    }

    getRomSelection(emuId) {
        var romSelection = this.romsMap.filter(r=>r.name === 'default' && (r.emu === null || r.emu === emuId))[0];
        if (!romSelection)  romSelection = this.romsMap.filter(r=>r.emu === null || r.emu === emuId)[0];
        return romSelection;
    }

    loadRoms() {
        recursiveloop(this.romDir, (err, roms) => {
            if (err) {
                this.logger.error(err);
            }
            var count = 1;
            roms.forEach((rom)=> {
                var name = path.basename(rom);
                var ext = path.extname(rom);
                if (name && ext in {'.gbc': null, '.gb': null, '.nes': null}) {
                    var romData = fs.readFileSync(rom);
                    var hash = this.digest(romData).toString();
                    var romInfo = {name: name, path: rom, hash: hash, emu: null};
                    if (romInfo.name === 'default.gbc') {
                        this.defaultRomHash = hash;
                        redis.set('weplay:rom:default', this.defaultRomHash);
                        redis.set('weplay:rom:0', this.defaultRomHash);
                    } else {
                        redis.set(`weplay:rom:${count}`, hash);
                    }
                    count++;
                    this.romsMap.push(romInfo);
                }
            });

        });
    }

    destroy() {
    }
}

module.exports = RomStoreService;