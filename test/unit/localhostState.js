/**
 * @typedef {object} FirstTimeState
 * @property {object} config Initial configuration parameters
 * @property {object} NetworkController Network controller state
 */

/**
 * @type {FirstTimeState}
 */
const initialState = {
  config: {},
  NetworkController: {
    provider: {
      type: 'rpc',
      rpcTarget: 'http://localhost:8545',
    },
  },
};

export default initialState;
