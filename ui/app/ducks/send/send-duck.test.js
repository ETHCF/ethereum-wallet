import assert from 'assert';

import SendReducer from './send.duck';

describe('Send Duck', function () {
  const mockState = {
    mockProp: 123,
  };
  const initState = {
    errors: {},
    gasButtonGroupShown: true,
  };
  const UPDATE_SEND_ERRORS = 'ecf-wallet/send/UPDATE_SEND_ERRORS';
  const RESET_SEND_STATE = 'ecf-wallet/send/RESET_SEND_STATE';
  const SHOW_GAS_BUTTON_GROUP = 'ecf-wallet/send/SHOW_GAS_BUTTON_GROUP';
  const HIDE_GAS_BUTTON_GROUP = 'ecf-wallet/send/HIDE_GAS_BUTTON_GROUP';

  describe('SendReducer()', function () {
    it('should return state unchanged if it does not match a dispatched actions type', function () {
      assert.deepEqual(
        SendReducer(mockState, {
          type: 'someOtherAction',
          value: 'someValue',
        }),
        mockState,
      );
    });

    it('should set gasButtonGroupShown to true when receiving a SHOW_GAS_BUTTON_GROUP action', function () {
      assert.deepEqual(
        SendReducer(
          { ...mockState, gasButtonGroupShown: false },
          { type: SHOW_GAS_BUTTON_GROUP },
        ),
        { gasButtonGroupShown: true, ...mockState },
      );
    });

    it('should set gasButtonGroupShown to false when receiving a HIDE_GAS_BUTTON_GROUP action', function () {
      assert.deepEqual(
        SendReducer(mockState, { type: HIDE_GAS_BUTTON_GROUP }),
        { gasButtonGroupShown: false, ...mockState },
      );
    });

    it('should extend send.errors with the value of a UPDATE_SEND_ERRORS action', function () {
      const modifiedMockState = {
        ...mockState,
        errors: {
          someError: false,
        },
      };
      assert.deepEqual(
        SendReducer(modifiedMockState, {
          type: UPDATE_SEND_ERRORS,
          value: { someOtherError: true },
        }),
        {
          ...modifiedMockState,
          errors: {
            someError: false,
            someOtherError: true,
          },
        },
      );
    });

    it('should return the initial state in response to a RESET_SEND_STATE action', function () {
      assert.deepEqual(
        SendReducer(mockState, {
          type: RESET_SEND_STATE,
        }),
        initState,
      );
    });
  });
});
