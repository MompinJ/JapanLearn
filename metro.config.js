// Se parte SIEMPRE de getDefaultConfig de expo/metro-config: ahi es donde
// Expo mete 'db' en assetExts, que es lo que permite empaquetar japanese.db
// como asset. Escribir esta config a mano desde @react-native/metro-config
// romperia la carga de la base de datos.
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// expo-sqlite en WEB carga wa-sqlite.wasm. El archivo viene en el paquete pero
// Metro no lo resuelve si 'wasm' no esta declarado como asset. Solo afecta a la
// build web, que se usa para revisar la interfaz sin dispositivo.
if (!config.resolver.assetExts.includes('wasm')) {
  config.resolver.assetExts.push('wasm');
}

module.exports = config;
