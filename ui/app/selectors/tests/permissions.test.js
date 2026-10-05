import assert from 'assert';

import {
  getAddressConnectedDomainMap,
  getConnectedDomainsForSelectedAddress,
  getOrderedConnectedAccountsForActiveTab,
  getPermissionsForActiveTab,
  getPermittedAccountsByOrigin,
} from '../permissions';

describe('selectors', function () {
  describe('getConnectedDomainsForSelectedAddress', function () {
    it('should return the list of connected domains when there is 1 connected account', function () {
      const mockState = {
        ecfWallet: {
          selectedAddress: '0x8e5d75d60224ea0c33d0041e75de68b1c3cb6dd5',
          domainMetadata: {
            'peepeth.com': {
              icon: 'https://peepeth.com/favicon-32x32.png',
              name: 'Peepeth',
              host: 'peepeth.com',
            },
            'https://remix.ethereum.org': {
              icon: 'https://remix.ethereum.org/icon.png',
              name: 'Remix - Ethereum IDE',
              host: 'remix.ethereum.org',
            },
          },
          subjects: {
            'peepeth.com': {
              origin: 'peepeth.com',
              permissions: {
                eth_accounts: {
                  caveats: [
                    {
                      type: 'restrictReturnedAccounts',
                      value: ['0x8e5d75d60224ea0c33d0041e75de68b1c3cb6dd5'],
                    },
                  ],
                  date: 1585676177970,
                  id: '840d72a0-925f-449f-830a-1aa1dd5ce151',
                  invoker: 'peepeth.com',
                  parentCapability: 'eth_accounts',
                },
              },
            },
            'https://remix.ethereum.org': {
              origin: 'https://remix.ethereum.org',
              permissions: {
                eth_accounts: {
                  caveats: [
                    {
                      type: 'restrictReturnedAccounts',
                      value: ['0x8e5d75d60224ea0c33d0041e75de68b1c3cb6dd5'],
                    },
                  ],
                  date: 1585685128948,
                  id: '6b9615cc-64e4-4317-afab-3c4f8ee0244a',
                  invoker: 'https://remix.ethereum.org',
                  parentCapability: 'eth_accounts',
                },
              },
            },
          },
        },
      };
      const extensionId = undefined;
      assert.deepEqual(getConnectedDomainsForSelectedAddress(mockState), [
        {
          extensionId,
          icon: 'https://peepeth.com/favicon-32x32.png',
          origin: 'peepeth.com',
          name: 'Peepeth',
          host: 'peepeth.com',
        },
        {
          extensionId,
          name: 'Remix - Ethereum IDE',
          icon: 'https://remix.ethereum.org/icon.png',
          origin: 'https://remix.ethereum.org',
          host: 'remix.ethereum.org',
        },
      ]);
    });

    it('should return the list of connected domains when there are 2 connected accounts', function () {
      const mockState = {
        ecfWallet: {
          selectedAddress: '0x7250739de134d33ec7ab1ee592711e15098c9d2d',
          domainMetadata: {
            'peepeth.com': {
              icon: 'https://peepeth.com/favicon-32x32.png',
              name: 'Peepeth',
              host: 'peepeth.com',
            },
            'https://remix.ethereum.org': {
              icon: 'https://remix.ethereum.org/icon.png',
              name: 'Remix - Ethereum IDE',
              host: 'remix.ethereum.com',
            },
          },
          subjects: {
            'peepeth.com': {
              origin: 'peepeth.com',
              permissions: {
                eth_accounts: {
                  caveats: [
                    {
                      type: 'restrictReturnedAccounts',
                      value: ['0x8e5d75d60224ea0c33d0041e75de68b1c3cb6dd5'],
                    },
                  ],
                  date: 1585676177970,
                  id: '840d72a0-925f-449f-830a-1aa1dd5ce151',
                  invoker: 'peepeth.com',
                  parentCapability: 'eth_accounts',
                },
              },
            },
            'https://remix.ethereum.org': {
              origin: 'https://remix.ethereum.org',
              permissions: {
                eth_accounts: {
                  caveats: [
                    {
                      type: 'restrictReturnedAccounts',
                      value: [
                        '0x8e5d75d60224ea0c33d0041e75de68b1c3cb6dd5',
                        '0x7250739de134d33ec7ab1ee592711e15098c9d2d',
                      ],
                    },
                  ],
                  date: 1585685128948,
                  id: '6b9615cc-64e4-4317-afab-3c4f8ee0244a',
                  invoker: 'https://remix.ethereum.org',
                  parentCapability: 'eth_accounts',
                },
              },
            },
          },
        },
      };
      const extensionId = undefined;
      assert.deepEqual(getConnectedDomainsForSelectedAddress(mockState), [
        {
          extensionId,
          name: 'Remix - Ethereum IDE',
          icon: 'https://remix.ethereum.org/icon.png',
          origin: 'https://remix.ethereum.org',
          host: 'remix.ethereum.com',
        },
      ]);
    });
  });

  describe('getConnectedAccountsForActiveTab', function () {
    const mockState = {
      activeTab: {
        title: 'Eth Sign Tests',
        origin: 'https://remix.ethereum.org',
        protocol: 'https:',
        url: 'https://remix.ethereum.org/',
      },
      ecfWallet: {
        // These keys are numbers, so they match no address; the expected
        // result depends on that.
        /* eslint-disable no-loss-of-precision */
        accounts: {
          0x7250739de134d33ec7ab1ee592711e15098c9d2d: {
            address: '0x7250739de134d33ec7ab1ee592711e15098c9d2d',
          },
          0x8e5d75d60224ea0c33d0041e75de68b1c3cb6dd5: {
            address: '0x8e5d75d60224ea0c33d0041e75de68b1c3cb6dd5',
          },
          0xb3958fb96c8201486ae20be1d5c9f58083df343a: {
            address: '0xb3958fb96c8201486ae20be1d5c9f58083df343a',
          },
          0x0dcd5d886577d5081b0c52e242ef29e70be3e7bc: {
            address: '0x0dcd5d886577d5081b0c52e242ef29e70be3e7bc',
          },
          0x617b3f8050a0bd94b6b1da02b4384ee5b4df13f4: {
            address: '0x617b3f8050a0bd94b6b1da02b4384ee5b4df13f4',
          },
        },
        /* eslint-enable no-loss-of-precision */
        cachedBalances: {},
        subjects: {
          'https://remix.ethereum.org': {
            origin: 'https://remix.ethereum.org',
            permissions: {
              eth_accounts: {
                caveats: [
                  {
                    type: 'restrictReturnedAccounts',
                    value: [
                      '0x8e5d75d60224ea0c33d0041e75de68b1c3cb6dd5',
                      '0x7250739de134d33ec7ab1ee592711e15098c9d2d',
                      '0x617b3f8050a0bd94b6b1da02b4384ee5b4df13f4',
                      '0x0dcd5d886577d5081b0c52e242ef29e70be3e7bc',
                      '0xb3958fb96c8201486ae20be1d5c9f58083df343a',
                    ],
                  },
                ],
                date: 1586359844177,
                id: '3aa65a8b-3bcb-4944-941b-1baa5fe0ed8b',
                invoker: 'https://remix.ethereum.org',
                parentCapability: 'eth_accounts',
              },
            },
          },
          'peepeth.com': {
            origin: 'peepeth.com',
            permissions: {
              eth_accounts: {
                caveats: [
                  {
                    type: 'restrictReturnedAccounts',
                    value: ['0x8e5d75d60224ea0c33d0041e75de68b1c3cb6dd5'],
                  },
                ],
                date: 1585676177970,
                id: '840d72a0-925f-449f-830a-1aa1dd5ce151',
                invoker: 'peepeth.com',
                parentCapability: 'eth_accounts',
              },
            },
          },
        },
        identities: {
          '0x7250739de134d33ec7ab1ee592711e15098c9d2d': {
            address: '0x7250739de134d33ec7ab1ee592711e15098c9d2d',
            name: 'Really Long Name That Should Be Truncated',
          },
          '0x8e5d75d60224ea0c33d0041e75de68b1c3cb6dd5': {
            address: '0x8e5d75d60224ea0c33d0041e75de68b1c3cb6dd5',
            lastSelected: 1586359844192,
            name: 'Account 1',
          },
          '0xb3958fb96c8201486ae20be1d5c9f58083df343a': {
            lastSelected: 1586359844193,
            address: '0xb3958fb96c8201486ae20be1d5c9f58083df343a',
            name: 'Account 2',
          },
          '0x0dcd5d886577d5081b0c52e242ef29e70be3e7bc': {
            address: '0x0dcd5d886577d5081b0c52e242ef29e70be3e7bc',
            lastSelected: 1586359844192,
            name: 'Account 3',
          },
          '0x617b3f8050a0bd94b6b1da02b4384ee5b4df13f4': {
            address: '0x617b3f8050a0bd94b6b1da02b4384ee5b4df13f4',
            name: 'Account 4',
          },
        },
        keyrings: [
          {
            accounts: [
              '0x8e5d75d60224ea0c33d0041e75de68b1c3cb6dd5',
              '0x7250739de134d33ec7ab1ee592711e15098c9d2d',
              '0x617b3f8050a0bd94b6b1da02b4384ee5b4df13f4',
              '0x0dcd5d886577d5081b0c52e242ef29e70be3e7bc',
              '0xb3958fb96c8201486ae20be1d5c9f58083df343a',
            ],
          },
        ],
        permissionsHistory: {
          'https://remix.ethereum.org': {
            eth_accounts: {
              accounts: {
                '0x7250739de134d33ec7ab1ee592711e15098c9d2d': 1586359844192,
                '0x8e5d75d60224ea0c33d0041e75de68b1c3cb6dd5': 1586359844192,
                '0x617b3f8050a0bd94b6b1da02b4384ee5b4df13f4': 1586359844192,
                '0x0dcd5d886577d5081b0c52e242ef29e70be3e7bc': 1586359844192,
                '0xb3958fb96c8201486ae20be1d5c9f58083df343a': 1586359844192,
              },
              lastApproved: 1586359844192,
            },
          },
        },
      },
    };

    it('should return connected accounts sorted by last selected, then by keyring controller order', function () {
      assert.deepEqual(getOrderedConnectedAccountsForActiveTab(mockState), [
        {
          address: '0xb3958fb96c8201486ae20be1d5c9f58083df343a',
          name: 'Account 2',
          lastActive: 1586359844192,
          lastSelected: 1586359844193,
        },
        {
          address: '0x8e5d75d60224ea0c33d0041e75de68b1c3cb6dd5',
          name: 'Account 1',
          lastActive: 1586359844192,
          lastSelected: 1586359844192,
        },
        {
          address: '0x0dcd5d886577d5081b0c52e242ef29e70be3e7bc',
          name: 'Account 3',
          lastActive: 1586359844192,
          lastSelected: 1586359844192,
        },
        {
          address: '0x7250739de134d33ec7ab1ee592711e15098c9d2d',
          name: 'Really Long Name That Should Be Truncated',
          lastActive: 1586359844192,
        },
        {
          address: '0x617b3f8050a0bd94b6b1da02b4384ee5b4df13f4',
          name: 'Account 4',
          lastActive: 1586359844192,
        },
      ]);
    });
  });

  describe('getPermissionsForActiveTab', function () {
    const mockState = {
      activeTab: {
        title: 'Eth Sign Tests',
        origin: 'https://remix.ethereum.org',
        protocol: 'https:',
        url: 'https://remix.ethereum.org/',
      },
      ecfWallet: {
        identities: {
          '0x7250739de134d33ec7ab1ee592711e15098c9d2d': {
            address: '0x7250739de134d33ec7ab1ee592711e15098c9d2d',
            name: 'Really Long Name That Should Be Truncated',
          },
          '0x8e5d75d60224ea0c33d0041e75de68b1c3cb6dd5': {
            address: '0x8e5d75d60224ea0c33d0041e75de68b1c3cb6dd5',
            name: 'Account 1',
          },
          '0xb3958fb96c8201486ae20be1d5c9f58083df343a': {
            address: '0xb3958fb96c8201486ae20be1d5c9f58083df343a',
            name: 'Account 2',
          },
        },
        subjects: {
          'https://remix.ethereum.org': {
            origin: 'https://remix.ethereum.org',
            permissions: {
              eth_accounts: {
                caveats: [
                  {
                    type: 'restrictReturnedAccounts',
                    value: [
                      '0x8e5d75d60224ea0c33d0041e75de68b1c3cb6dd5',
                      '0x7250739de134d33ec7ab1ee592711e15098c9d2d',
                    ],
                  },
                ],
                date: 1586359844177,
                id: '3aa65a8b-3bcb-4944-941b-1baa5fe0ed8b',
                invoker: 'https://remix.ethereum.org',
                parentCapability: 'eth_accounts',
              },
            },
          },
          'peepeth.com': {
            origin: 'peepeth.com',
            permissions: {
              eth_accounts: {
                caveats: [
                  {
                    type: 'restrictReturnedAccounts',
                    value: ['0x8e5d75d60224ea0c33d0041e75de68b1c3cb6dd5'],
                  },
                ],
                date: 1585676177970,
                id: '840d72a0-925f-449f-830a-1aa1dd5ce151',
                invoker: 'peepeth.com',
                parentCapability: 'eth_accounts',
              },
            },
          },
          'uniswap.exchange': {
            origin: 'uniswap.exchange',
            permissions: {
              eth_accounts: {
                caveats: [
                  {
                    type: 'restrictReturnedAccounts',
                    value: ['0x8e5d75d60224ea0c33d0041e75de68b1c3cb6dd5'],
                  },
                ],
                date: 1585616816623,
                id: 'ce625215-f2e9-48e7-93ca-21ba193244ff',
                invoker: 'uniswap.exchange',
                parentCapability: 'eth_accounts',
              },
            },
          },
        },
        domainMetadata: {
          'https://remix.ethereum.org': {
            icon: 'https://remix.ethereum.org/icon.png',
            name: 'Remix - Ethereum IDE',
          },
        },
        permissionsHistory: {
          'https://remix.ethereum.org': {
            eth_accounts: {
              accounts: {
                '0x7250739de134d33ec7ab1ee592711e15098c9d2d': 1586359844192,
                '0x8e5d75d60224ea0c33d0041e75de68b1c3cb6dd5': 1586359844192,
              },
              lastApproved: 1586359844192,
            },
          },
        },
      },
    };

    it('should return a list of permissions strings', function () {
      assert.deepEqual(getPermissionsForActiveTab(mockState), [
        {
          key: 'eth_accounts',
        },
      ]);
    });
  });

  describe('getPermittedAccountsByOrigin', function () {
    const account1 = '0x8e5d75d60224ea0c33d0041e75de68b1c3cb6dd5';
    const account2 = '0x7250739de134d33ec7ab1ee592711e15098c9d2d';

    const getSubject = (origin, caveats) => ({
      origin,
      permissions: {
        eth_accounts: {
          caveats,
          date: 1,
          id: origin,
          invoker: origin,
          parentCapability: 'eth_accounts',
        },
      },
    });

    const mockState = {
      ecfWallet: {
        domainMetadata: {
          'https://remix.ethereum.org': { name: 'Remix', icon: 'remix.png' },
        },
        subjects: {
          'https://remix.ethereum.org': getSubject(
            'https://remix.ethereum.org',
            [{ type: 'restrictReturnedAccounts', value: [account1, account2] }],
          ),
          'peepeth.com': getSubject('peepeth.com', [
            { type: 'restrictReturnedAccounts', value: [account1] },
          ]),
          // rpc-cap caveat shape: not a permitted account
          'old.shape': getSubject('old.shape', [
            {
              name: 'exposedAccounts',
              type: 'filterResponse',
              value: [account2],
            },
          ]),
        },
      },
    };

    it('should return the permitted accounts of each origin', function () {
      assert.deepEqual(getPermittedAccountsByOrigin(mockState), {
        'https://remix.ethereum.org': [account1, account2],
        'peepeth.com': [account1],
      });
    });

    it('should map addresses to their connected domains', function () {
      assert.deepEqual(getAddressConnectedDomainMap(mockState), {
        [account1]: {
          'https://remix.ethereum.org': { icon: 'remix.png', name: 'Remix' },
          'peepeth.com': { icon: undefined, name: 'peepeth.com' },
        },
        [account2]: {
          'https://remix.ethereum.org': { icon: 'remix.png', name: 'Remix' },
        },
      });
    });

    it('should return no accounts without subjects', function () {
      assert.deepEqual(getPermittedAccountsByOrigin({ ecfWallet: {} }), {});
    });
  });
});
