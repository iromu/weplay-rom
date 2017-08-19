process.title = 'weplay-rom'

const discoveryUrl = process.env.DISCOVERY_URL || 'http://localhost:3010'
const discoveryPort = process.env.DISCOVERY_PORT || 3020
const statusPort = process.env.STATUS_PORT || 8031
const RomStoreService = require('./src/RomStoreService')
const service = new RomStoreService(discoveryUrl, discoveryPort, statusPort)

require('weplay-common').cleanup(service.destroy.bind(service))
