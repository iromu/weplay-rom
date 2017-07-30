const join = require('path').join
const path = require('path')
const fs = require('fs')
const crypto = require('crypto')
const EventBus = require('weplay-common').EventBus
const DEFAULT_ROM_NAME = 'default.gbc'

// Asynchronous function to read folders and files recursively
function recursiveloop(dir, done) {
  var results = []
  fs.readdir(dir, (err, list) => {
    if (err) return done(err)
    var i = 0;
    (function next() {
      var file = list[i++]
      if (!file) return done(null, results)
      file = dir + '/' + file
// eslint-disable-next-line handle-callback-err
      fs.stat(file, (err, stat) => {
        if (stat && stat.isDirectory()) {
// eslint-disable-next-line handle-callback-err
          recursiveloop(file, (err, res) => {
            results = results.concat(res)
            next()
          })
        } else {
          results.push(file)
          next()
        }
      })
    })()
  })
}

class RomStoreService {
  constructor(discoveryUrl, discoveryPort, statusPort) {
    this.uuid = require('node-uuid').v4()
    this.logger = require('weplay-common').logger('weplay-romstore', this.uuid)
    this.hashes = {}
    this.romsMap = []
    this.defaultRomHash = undefined
    this.romPath = join('data', 'rom')
    this.romDir = join(process.cwd(), this.romPath)
    this.statePath = join('data', 'state')

    const listeners = {
      'free': (socket, request) => {
        this.logger.info('RomStoreService < free', {socket: socket.id, hash: socket.hash, request: request})
        for (var property in this.hashes) {
          if (this.hashes.hasOwnProperty(property)) {
            if (this.hashes[property] === socket.id) {
              this.romsMap.filter(r => r.hash === property)[0].emu = null
              delete this.hashes[property]
            }
          }
        }
        socket.hash = null
      },
      'defaulthash': (socket, request) => {
        this.logger.info('RomStoreService < default:hash', {socket: socket.id, hash: socket.hash, request: request})
        var romSelection = this.getDefaultRom()
        if (romSelection !== undefined) {
          this.logger.info('default:hash > hash', {
            socket: socket.id,
            name: romSelection.name,
            hash: romSelection.hash
          })
          socket.emit('hash', {name: romSelection.name, defaultRom: true, hash: romSelection.hash})
        }
      },
      'list': (socket, request) => {
        this.logger.info('RomStoreService < list', {socket: socket.id, hash: socket.hash, request: request})
        this.romsMap.forEach((romMap) => {
          const info = {idx: romMap.idx, name: romMap.name, hash: romMap.hash}
          this.logger.info('RomStoreService < info', info)
          socket.emit('data', info)
        })
      },
      'query': (socket, request) => {
        this.logger.info('RomStoreService < query', {socket: socket.id, hash: socket.hash, request: request})
        var romSelection = this.romsMap.filter(r => r.hash === request)[0]
        socket.emit('response', {name: romSelection.name, hash: romSelection.hash, emu: romSelection.emu})
        romSelection.emu = socket.id
        socket.hash = romSelection.hash
        this.hashes[romSelection.hash] = socket.id

        if (romSelection.statePacked) {
          this.logger.info(`RomStoreService > emu:${socket.id}:rom:state`, this.digest(romSelection.statePacked))
          socket.emit('state', romSelection.statePacked)
        } else {
          fs.readFile(romSelection.path, (err, romData) => {
            if (err) {
              this.logger.error(err)
            }
            this.logger.info(`RomStoreService > emu:${socket.id}:rom:data`)
            socket.emit('data', romData)
          })
        }

        this.logger.info(`RomStoreService > emu:${socket.id}:rom:hash`, romSelection.hash)
        socket.emit('hash', {name: romSelection.name, hash: romSelection.hash})
      },
      'request': (socket, request) => {
        this.logger.info('RomStoreService < request', {socket: socket.id, hash: socket.hash, request: request})
        var romSelection = this.getRomSelection(socket.id)
        romSelection.emu = socket.id
        socket.hash = romSelection.hash
        this.hashes[romSelection.hash] = socket.id

        if (romSelection.statePacked) {
          this.logger.info(`RomStoreService > emu:${socket.id}:rom:state`, this.digest(romSelection.statePacked))
          socket.emit('state', romSelection.statePacked)
        } else {
          fs.readFile(romSelection.path, (err, romData) => {
            if (err) {
              this.logger.error(err)
            }
            this.logger.info(`RomStoreService > emu:${socket.id}:rom:data`)
            socket.emit('data', romData)
          })
        }

        this.logger.info(`RomStoreService > emu:${socket.id}:rom:hash`, romSelection.hash)
        socket.emit('hash', {name: romSelection.name, hash: romSelection.hash})
      },
      'state': (socket, state) => {
        if (socket.hash) {
          this.logger.info('RomStoreService < state', {socket: socket.id, hash: socket.hash, state: this.digest(state)})
          const filter = this.romsMap.filter(r => r.hash === socket.hash && r.emu === socket.id)[0]
          if (filter !== undefined) {
            filter.statePacked = state
          } else {
            this.logger.error('RomStoreService < state (no found)')
          }
        } else {
          this.logger.error('RomStoreService < state (no hash)')
        }
      },
      'disconnect': (socket) => {
        this.logger.info('RomStoreService < disconnect', {socket: socket.id, hash: socket.hash})
        for (var property in this.hashes) {
          if (this.hashes.hasOwnProperty(property)) {
            if (this.hashes[property] === socket.id) {
              this.romsMap.filter(r => r.hash === property)[0].emu = null
              delete this.hashes[property]
            }
          }
        }
        if (socket.hash) {
          this.romsMap.filter(r => r.hash === socket.hash)[0].emu = null
        }
        socket.hash = null
      }
    }

    this.bus = new EventBus({
      url: discoveryUrl,
      port: discoveryPort,
      statusPort: statusPort,
      name: 'rom',
      id: this.uuid,
      serverListeners: listeners
    }, () => {
      this.logger.info('RomStoreService connected to discovery server', {
        discoveryUrl: discoveryUrl,
        uuid: this.uuid
      })
      this.onConnect()
    })
  }

  onConnect() {
    this.loadRoms()
  }

  digest(state) {
    var md5 = crypto.createHash('md5')
    return md5.update(state).digest('hex')
  }

  getDefaultRom() {
    return this.romsMap.filter(r => r.name === DEFAULT_ROM_NAME)[0]
  }

  getRomSelection(emuId) {
    var romSelection = this.romsMap.filter(r => r.name === DEFAULT_ROM_NAME && (r.emu === null || r.emu === emuId))[0]
    if (!romSelection) romSelection = this.romsMap.filter(r => r.emu === null || r.emu === emuId)[0]
    return romSelection
  }

  loadRoms() {
    this.romsMap = []
    recursiveloop(this.romDir, (err, roms) => {
      if (err) {
        this.logger.error(err)
      }
      roms.forEach((rom) => {
        var name = path.basename(rom)
        var ext = path.extname(rom)
        if (name && ext in {'.gbc': null, '.gb': null, '.nes': null}) {
          var romData = fs.readFileSync(rom)
          var hash = this.digest(romData).toString()
          var romInfo = {name: name, path: rom, hash: hash, emu: null}
          if (romInfo.name === 'default.gbc') {
            this.defaultRomHash = hash
            romInfo.default = true
            romInfo.idx = 0
          }
          this.romsMap.push(romInfo)
        }
      })

      var idx = 1
      this.romsMap.sort((a, b) => a.name > b.name)
      this.romsMap.forEach((rom) => {
        if (rom.name !== 'default.gbc') {
          rom.idx = idx++
        }
      })
      this.romsMap.sort((a, b) => a.idx > b.idx)
      this.logger.info('Roms loaded', this.romsMap)
      this.logger.info('Default Rom', this.defaultRomHash)
    })
  }

  destroy() {
  }
}

module.exports = RomStoreService
