const fs = require('fs')
const xml2js = require('xml2js')
const logger = require('weplay-common').logger('weplay-romstore')

const parser = new xml2js.Parser({explicitArray: false, trim: true, ignoreAttrs: true, explicitRoot: false})

function _recursiveloop(dir, done) {
  var results = []
  fs.readdir(dir, (err, list) => {
    if (err) return done(err)
    var i = 0;
    (function next() {
      var file = list[i++]
      if (!file) return done(null, results)
      file = dir + '/' + file
      fs.stat(file, (err, stat) => {
        err && logger.error('recursiveloop', err)
        if (stat && stat.isDirectory()) {
          _recursiveloop(file, (err, res) => {
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

class Utils {
  recursiveloop(dir, done) {
    _recursiveloop(dir, done)
  }

  readXml(file, cb) {
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

module.exports = Utils
