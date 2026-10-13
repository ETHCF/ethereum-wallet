// Fresh ecf-wallet installations start at schema version 0 and run every
// migration below. Register new ones here (see `yarn generate:migration`).
// Each migration receives { meta, data } and must return that shape with
// meta.version updated.
const migrations = [
  require('./001').default,
  require('./002').default,
  require('./003').default,
  require('./004').default,
  require('./005').default,
];

export default migrations;
