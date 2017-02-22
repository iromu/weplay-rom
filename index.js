process.title = 'weplay-rom';

const discoveryUrl = process.env.DISCOVERY_URL || 'http://localhost:3010';
const discoveryPort = process.env.DISCOVERY_PORT || 3020;

const RomStoreService = require('./RomStoreService');
const service = new RomStoreService(discoveryUrl, discoveryPort);

require('weplay-common').cleanup(service.destroy.bind(service));
