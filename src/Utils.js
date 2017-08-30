import fs from 'fs'
import xml2js from 'xml2js'
import {LoggerFactory} from 'weplay-common'

const logger = LoggerFactory.get('weplay-romstore')
const parser = new xml2js.Parser({explicitArray: false, trim: true, ignoreAttrs: true, explicitRoot: false})

class Utils {
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
            Utils.recursiveloop(file, (err, res) => {
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

export default Utils
