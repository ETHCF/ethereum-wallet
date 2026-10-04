// Fresh ecf-wallet installations start at schema version 0.
// Register future migrations here, starting with version 1. Each migration
// receives { meta, data } and must return that shape with meta.version updated.
const migrations = [
  require('./001').default,
  require('./002').default,
  require('./003').default,
]

export default migrations
