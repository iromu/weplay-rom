const join = require('path').join
const fs = require('fs')
const logger = require('weplay-common').logger('weplay-romstore', this.uuid)
const msgpack = require('msgpack')

class RomStoreListeners {

  /** Frees current connection */
  free(socket, request) {
    if (!request || !socket.hash) {
      logger.error('RomStoreService < free', {socket: socket.id, hash: socket.hash, request: request})
    } else {
      logger.info('RomStoreService < free', {socket: socket.id, hash: socket.hash, request: request})
    }
    this.unbindRomEmu(socket, request)
  }

  defaulthash(socket, request) {
    logger.info('RomStoreService < default:hash', {socket: socket.id, hash: socket.hash, request: request})
    var romSelection = this.getDefaultRom()
    if (romSelection !== undefined) {
      logger.info('default:hash > hash', {
        socket: socket.id,
        name: romSelection.name,
        hash: romSelection.hash
      })
      socket.emit('hash', {name: romSelection.name, defaultRom: true, hash: romSelection.hash})
    }
  }

  list(socket, request) {
    logger.info('RomStoreService < list', {socket: socket.id, hash: socket.hash, request: request})
    this.romsMap.forEach((romMap) => {
        const info = {idx: romMap.idx, name: romMap.name, hash: romMap.hash}
        logger.info('RomStoreService < info', info)
        socket.emit('data', info)
      }
    )
  }

  image(socket, request) {
    logger.info('RomStoreService < image', {socket: socket.id, hash: socket.hash, request: request})
    if (request) {
      var romSelection = this.romsMap.filter(r => r.hash === request)[0]
      if (romSelection) {
        if (!romSelection.image) {
          fs.readFile(join(this.romDir, 'images', [romSelection.basename, '-image.jpg'].join('')), (err, image) => {
            err && logger.error(err)
            if (image) {
              romSelection.image = image
              socket.emit('image', {name: romSelection.name, hash: romSelection.hash, image: image})
            }
          })
        } else {
          socket.emit('image', {name: romSelection.name, hash: romSelection.hash, image: romSelection.image})
        }
      }
    }
  }

  query(socket, request) {
    logger.info('RomStoreService < query', {socket: socket.id, hash: socket.hash, request: request})
    if (request) {
      var romSelection = this.romsMap.filter(r => r.hash === request)[0]
      if (romSelection) {
        socket.emit('response', {name: romSelection.name, hash: romSelection.hash, emu: romSelection.emu})

        if (!romSelection.emu) {
          this.bindRomEmu(romSelection, socket)
          this.emitBinDataforRom(romSelection, socket)
          logger.info(`RomStoreService > emu:${socket.id}:rom:hash`, romSelection.hash)
          socket.emit('hash', {name: romSelection.name, hash: romSelection.hash, system: romSelection.system})
        }
      }
    }
  }

  request(socket, request) {
    logger.info('RomStoreService < request', {socket: socket.id, hash: socket.hash, request: request})
    var romSelection = this.getRomSelection(socket.id)
    this.bindRomEmu(romSelection, socket)
    this.emitBinDataforRom(romSelection, socket)
    logger.info(`RomStoreService > emu:${socket.id}:rom:hash`, romSelection.hash)
    socket.emit('hash', {name: romSelection.name, hash: romSelection.hash, system: romSelection.system})
  }

  state(socket, stateInfoPacked) {
    const stateInfo = msgpack.unpack(stateInfoPacked)
    const stateHash = stateInfo.hash
    const statePacked = stateInfo.snapshot
    const hash = stateHash || socket.hash || this.hashesBySocketId[socket.id]
    if (hash) {
      logger.info('RomStoreService.onState', {socket: socket.id, hash: hash})
      // Only the active emu can update the state
      const filter = this.romsMap.filter(r => r.hash === hash && r.emu === socket.id)[0]
      if (filter !== undefined) {
        filter.statePacked = statePacked
        filter.statePackedPersisted = false
        this.persistStateData()
        delete filter.rom
      } else {
        logger.error('RomStoreService.onState(no found)', {socket: socket.id, hash: hash})
      }
    } else {
      logger.error('RomStoreService.onState (no hash)', {socket: socket.id, hash: hash})
    }
  }

  disconnect(socket) {
    logger.info('RomStoreService < disconnect', {socket: socket.id, hash: socket.hash})
    for (var property in this.hashes) {
      if (this.hashes.hasOwnProperty(property)) {
        if (this.hashes[property] === socket.id) {
          this.romsMap.filter(r => r.hash === property)[0].emu = null
          delete this.hashes[property]
        }
      }
    }
    const hash = socket.hash || this.hashesBySocketId[socket.id]
    if (hash) {
      this.romsMap.filter(r => r.hash === hash)[0].emu = null
      delete this.hashesBySocketId[socket.id]
    }
    socket.hash = null
  }
}

module.exports = RomStoreListeners
