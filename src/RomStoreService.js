import path, {join} from 'path'
import fs from 'fs'
import crypto from 'crypto'
import {EventBus, LoggerFactory} from 'weplay-common'
import Utils from './Utils'
import RomStoreListeners from './RomStoreListeners'
import memwatch from 'memwatch-next'

process.title = 'weplay-discovery'
const DEFAULT_ROM_NAME = 'default'
const uuid = require('uuid/v1')()
const logger = LoggerFactory.get('weplay-romstore')

const utils = new Utils()

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
    this.romsMap = []
    this.defaultRomHash = undefined
    this.romPath = join('data', 'rom')
    this.romDir = join(process.cwd(), this.romPath)
    this.statePath = join('data', 'state')
    this.stateDir = join(process.cwd(), this.statePath)
    const romListeners = new RomStoreListeners()
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
          this.romsMap.filter(r => r.hash === property)[0].emu = null
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
    this.loadRoms()
  }

  digest(state) {
    const md5 = crypto.createHash('md5')
    return md5.update(state).digest('hex')
  }

  getDefaultRom() {
    return this.romsMap.filter(r => r.basename === DEFAULT_ROM_NAME)[0]
  }

  getRomSelection(emuId) {
    let romSelection = this.romsMap.filter(r => r.basename === DEFAULT_ROM_NAME && (r.emu === null || r.emu === emuId))[0]
    if (!romSelection) romSelection = this.romsMap.filter(r => r.emu === null || r.emu === emuId)[0]
    return romSelection
  }

  loadRoms() {
    this.romsMap = []
    utils.readXml(join(this.romDir, 'gamelist.xml'), (data) => {
      this.gameList = data.game
      // fs.writeFile(join(this.romDir, 'gamelist.json'), JSON.stringify(this.gameList), (err) => {
      //   err && logger.error(err)
      // })
    })
    utils.recursiveloop(this.romDir, (err, roms) => {
      err && logger.error(err)
      roms.forEach((rom) => {
        const ext = path.extname(rom)
        const basename = path.basename(rom).replace(ext, '')
        if (basename && !basename.startsWith('.') && ext in {'.gbc': null, '.gb': null, '.nes': null}) {
          const system = ext.substring(1, ext.length)
          const romData = fs.readFileSync(rom)
          const hash = this.digest(romData).toString()
          const romInfo = {path: rom, hash, emu: null, system}
          if (basename === DEFAULT_ROM_NAME) {
            this.defaultRomHash = hash
            romInfo.default = true
            romInfo.idx = 0
          }
          romInfo.basename = basename
          const filter = this.gameList.filter(g => g.path.includes(basename))[0]
          romInfo.name = filter ? filter.name : basename
          this.romsMap.push(romInfo)
        }
      })

      let idx = 1
      this.romsMap.sort((a, b) => a.rom > b.rom ? 1 : -1)
      this.romsMap.forEach((rom) => {
        if (!rom.default) {
          rom.idx = idx++
        }
      })
      this.romsMap.sort((a, b) => a.idx > b.idx ? 1 : -1)
      this.romsMap.forEach((rom) => {
        logger.info('Rom', rom.idx, rom.name)
      })
      logger.info('Default Rom', this.defaultRomHash)
    })
  }

  destroy() {
    logger.info('destroy')
    this.persistStateData(true)
  }

  persistStateData(force) {
    this.romsMap.forEach((rom) => {
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
