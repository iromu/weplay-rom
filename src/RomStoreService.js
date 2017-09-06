import {join} from 'path'
import fs from 'fs'
import crypto from 'crypto'
import {EventBus, LoggerFactory} from 'weplay-common'
import RomStoreListeners from './RomStoreListeners'
import memwatch from 'memwatch-next'
import GameList from './GameList'

const DEFAULT_ROM_NAME = 'default'

const logger = LoggerFactory.get('weplay-romstore')

memwatch.on('stats', (stats) => {
  logger.info('RomStoreService stats', stats)
})
memwatch.on('leak', (info) => {
  logger.error('RomStoreService leak', info)
})

class RomStoreService {
  constructor(discoveryUrl, discoveryPort, statusPort) {
    this.uuid = require('uuid/v1')()
    this.hashes = {}
    this.hashesBySocketId = {}
    this.defaultRomHash = undefined
    this.romPath = join('data', 'rom')
    this.romDir = join(process.cwd(), this.romPath)
    this.statePath = join('data', 'state')
    this.stateDir = join(process.cwd(), this.statePath)
    const romListeners = new RomStoreListeners()
    this.gameList = new GameList(DEFAULT_ROM_NAME, this.romDir)
    const listeners = {
      'free': romListeners.free.bind(this),
      'defaulthash': romListeners.defaulthash.bind(this),
      'list': romListeners.list.bind(this),
      'image': romListeners.image.bind(this),
      'query': romListeners.query.bind(this),
      'request': romListeners.request.bind(this),
      'state': romListeners.state.bind(this),
      'disconnect': romListeners.disconnect.bind(this)
    }

    this.bus = new EventBus({
      url: discoveryUrl,
      port: discoveryPort,
      statusPort,
      name: 'rom',
      id: this.uuid,
      serverListeners: listeners
    }, () => {
      logger.info('RomStoreService connected to discovery server', {
        discoveryUrl,
        uuid: this.uuid
      })
      this.onConnect()
    })
  }

  emitBinDataforRom(romSelection, socket) {
    if (romSelection.statePacked) {
      logger.info('RomStoreService.emitBinDataforRom. statePacked', {
        name: romSelection.name,
        hash: romSelection.hash,
        digest: this.digest(romSelection.statePacked)
      })
      socket.emit('state', romSelection.statePacked)
    } else {
      fs.readFile(join(this.stateDir, [romSelection.hash, '.state'].join('')), (err, stateData) => {
        err && logger.error(err)
        if (stateData) {
          logger.info('RomStoreService.emitBinDataforRom. fs stateData', {
            name: romSelection.name,
            hash: romSelection.hash,
            digest: this.digest(stateData)
          })
          romSelection.statePacked = stateData
          romSelection.statePackedPersisted = true
          socket.emit('state', romSelection.statePacked)
        } else if (romSelection.romData) {
          logger.info('RomStoreService.emitBinDataforRom. romData', {
            name: romSelection.name,
            hash: romSelection.hash
          })
          socket.emit('data', romSelection.romData)
        } else {
          fs.readFile(romSelection.path, (err, romData) => {
            err && logger.error(err)
            if (romData) {
              logger.info('RomStoreService.emitBinDataforRom. fs romData', {
                name: romSelection.name,
                hash: romSelection.hash
              })
              romSelection.data = romData
              socket.emit('data', romData)
            }
          })
        }
      })
    }
  }

  unbindRomEmu(socket, hash) {
    for (const property in this.hashes) {
      if (this.hashes.hasOwnProperty(property)) {
        if (this.hashes[property] === socket.id) {
          this.gameList.map.filter(r => r.hash === property)[0].emu = null
          delete this.hashes[property]
        }
      }
    }
    socket.hash = null
  }

  bindRomEmu(romSelection, socket) {
    romSelection.emu = socket.id
    socket.hash = romSelection.hash
    this.hashes[romSelection.hash] = socket.id
    this.hashesBySocketId[socket.id] = romSelection.hash
  }

  onConnect() {
    this.gameList.init()
  }

  digest(state) {
    const md5 = crypto.createHash('md5')
    return md5.update(state).digest('hex')
  }

  getRomSelection(emuId) {
    let romSelection = this.gameList.map.filter(r => r.basename === DEFAULT_ROM_NAME && (r.emu === null || r.emu === emuId))[0]
    if (!romSelection) romSelection = this.gameList.map.filter(r => r.emu === null || r.emu === emuId)[0]
    return romSelection
  }

  destroy() {
    logger.info('destroy')
    this.persistStateData(true)
  }

  persistStateData(force) {
    this.gameList.map.forEach((rom) => {
      if (rom.statePacked && !rom.statePackedPersisted) {
        logger.info('Saving state for Rom', rom.hash)
        fs.writeFile(join(this.stateDir, [rom.hash, '.state'].join('')), rom.statePacked, (err) => {
          err && logger.error(err)
          rom.statePackedPersisted = true
        })
      }
    })
  }
}

export default RomStoreService
