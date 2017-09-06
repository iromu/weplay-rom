import fs from 'fs'
import xml2js from 'xml2js'
import {LoggerFactory} from 'weplay-common'
import path, {join} from 'path'
import crypto from 'crypto'

const logger = LoggerFactory.get('weplay-romstore')
const parser = new xml2js.Parser({explicitArray: false, trim: true, ignoreAttrs: true, explicitRoot: false})

class GameList {
  constructor(defaultRomName, romDir) {
    this.romsMap = []
    this.romDir = romDir
    this.defaultRomName = defaultRomName
  }

  init() {
    this.loadRoms()
  }

  get defaultRom() {
    return this.romsMap.filter(r => r.basename === this.defaultRomName)[0]
  }

  get map() {
    return this.romsMap
  }

  loadRoms() {
    this.romsMap = []
    GameList.readXml(join(this.romDir, 'gamelist.xml'), (data) => {
      this.gameList = data.game
      fs.writeFile(join(this.romDir, 'gamelist.json'), JSON.stringify(this.gameList), (err) => {
        err && logger.error(err)
      })
    })
    GameList.recursiveloop(this.romDir, (err, roms) => {
      err && logger.error(err)
      roms.forEach((rom) => {
        const ext = path.extname(rom)
        const basename = path.basename(rom).replace(ext, '')
        if (basename && !basename.startsWith('.') && ext in {'.gbc': null, '.gb': null, '.nes': null}) {
          const system = ext.substring(1, ext.length)
          const romData = fs.readFileSync(rom)
          const hash = this.digest(romData).toString()
          const romInfo = {path: rom, hash, emu: null, system}
          if (basename === this.defaultRomName) {
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

  static recursiveloop(dir, done) {
    let results = []
    fs.readdir(dir, (err, list) => {
      if (err) return done(err)
      let i = 0;
      (function next() {
        let file = list[i++]
        if (!file) return done(null, results)
        file = `${dir}/${file}`
        fs.stat(file, (err, stat) => {
          err && logger.error('recursiveloop', err)
          if (stat && stat.isDirectory()) {
            GameList.recursiveloop(file, (err, res) => {
              err && logger.error('recursiveloop', err)
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

  digest(state) {
    const md5 = crypto.createHash('md5')
    return md5.update(state).digest('hex')
  }

  static readXml(file, cb) {
    fs.readFile(file, (err, data) => {
      err && logger.error(err)
      if (data) {
        parser.parseString(data, (err, result) => {
          err && logger.error(err)
          cb(result)
        })
      }
    })
  }
}

export default GameList
