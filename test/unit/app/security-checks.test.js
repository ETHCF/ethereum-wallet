import { encode as abiEncode } from '@metamask/abi-utils';
import { strict as assert } from 'assert';

import { functionSelector } from '../../../app/scripts/lib/abi-method-decoder';
import {
  decodeCall,
  decodeMultiSend,
  decodeOrders,
  decodePermit,
  getTransactionAlerts,
  getTypedDataAlerts,
  isLookalike,
} from '../../../app/scripts/lib/security-checks';

const OWN = '0x1111111111111111111111111111111111111111';
const FRIEND = '0xabcd000000000000000000000000000000001234';
const LOOKALIKE = '0xabcd999999999999999999999999999999991234';
const STRANGER = '0x5555555555555555555555555555555555555555';
const TOKEN = '0x6b175474e89094c44da98b954eedeac495271d0f';
const SPENDER = '0x000000000022d473030f116ddee9f6b43ac78ba3';
const MAX = `0x${'f'.repeat(64)}`;
const NFT = '0xbc4ca0eda7647a8ab7c2061c2e118a18a936f13d';
const DRAINER = '0x7777777777777777777777777777777777777777';
const WETH = '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2';
const ZERO = '0x0000000000000000000000000000000000000000';
const ETHER = 10n ** 18n;

const encode = (selector, types, values) =>
  `0x${selector}${Buffer.from(abiEncode(types, values)).toString('hex')}`;
const ids = (alerts) => alerts.map(({ id }) => id);

function makeContext({
  contracts = [TOKEN, SPENDER, NFT],
  known = [FRIEND],
  tokens = [],
  nfts = [NFT],
} = {}) {
  const codeAt = new Set(contracts.map((a) => a.toLowerCase()));
  const erc721 = new Set(nfts.map((a) => a.toLowerCase()));
  return {
    getCode: async (address) =>
      codeAt.has(address.toLowerCase()) ? '0x6080' : '0x',
    // ERC-20 tokens do not implement ERC-165, so the call reverts.
    call: async (address, signature, _outputTypes, args) => {
      if (
        erc721.has(address.toLowerCase()) &&
        signature === 'supportsInterface(bytes4)'
      ) {
        return [args[0] === '0x80ac58cd'];
      }
      throw new Error('execution reverted');
    },
    ownAccounts: new Set([OWN]),
    knownAddresses: new Set(known.map((a) => a.toLowerCase())),
    tokenContracts: new Set(tokens.map((a) => a.toLowerCase())),
  };
}

describe('On-device security checks', function () {
  describe('decodeCall', function () {
    it('reads recipients and spenders from transfer and approval calls', function () {
      assert.equal(
        decodeCall(encode('a9059cbb', ['address', 'uint256'], [STRANGER, 1]))
          .recipient,
        STRANGER,
      );
      assert.equal(
        decodeCall(
          encode(
            '23b872dd',
            ['address', 'address', 'uint256'],
            [OWN, STRANGER, 1],
          ),
        ).recipient,
        STRANGER,
      );
      const approve = decodeCall(
        encode('095ea7b3', ['address', 'uint256'], [SPENDER, MAX]),
      );
      assert.equal(approve.kind, 'approve');
      assert.equal(approve.spender, SPENDER);
      assert.equal(
        decodeCall(encode('a22cb465', ['address', 'bool'], [SPENDER, true]))
          .approved,
        true,
      );
      assert.equal(approve.malformed, false);
      assert.equal(decodeCall('0xdeadbeef'), undefined);
    });

    it('reads malformed calls as a contract that does not check them would', function () {
      const standard = encode('095ea7b3', ['address', 'uint256'], [SPENDER, 1]);
      // Dirty padding above the spender address, which older contracts mask off.
      const dirty = decodeCall(
        `0x095ea7b3${'ff'.repeat(12)}${standard.slice(34)}`,
      );
      assert.equal(dirty.malformed, true);
      assert.equal(dirty.spender, SPENDER);
      assert.equal(dirty.amount.toString(10), '1');
      // Missing calldata reads as zeros on the right, so a truncated amount
      // of 0xff is 0xff followed by 31 zero bytes to the contract.
      const short = decodeCall(
        encode('095ea7b3', ['address', 'uint256'], [SPENDER, MAX]).slice(
          0,
          10 + 64 + 2,
        ),
      );
      assert.equal(short.malformed, true);
      assert.equal(short.amount.toString(16), `ff${'0'.repeat(62)}`);
      // Not even whole bytes: nothing can be read, but it is still malformed.
      assert.deepEqual(decodeCall('0xa9059cbb123'), {
        kind: 'tokenTransfer',
        malformed: true,
      });
    });
  });

  it('matches look-alike addresses by their visible start and end', function () {
    assert.equal(isLookalike(LOOKALIKE, FRIEND), true);
    assert.equal(isLookalike(FRIEND, FRIEND), false);
    assert.equal(isLookalike(STRANGER, FRIEND), false);
  });

  describe('transactions', function () {
    it('flags burn addresses', async function () {
      const alerts = await getTransactionAlerts({
        txParams: { to: '0x000000000000000000000000000000000000dEaD' },
        ...makeContext(),
      });
      assert.deepEqual(ids(alerts), ['alertBurnAddress']);
    });

    it('flags a look-alike of a known address instead of calling it new', async function () {
      const alerts = await getTransactionAlerts({
        txParams: { to: LOOKALIKE },
        ...makeContext(),
      });
      assert.deepEqual(ids(alerts), ['alertLookalikeAddress']);
      assert.equal(alerts[0].severity, 'danger');
      assert.equal(alerts[0].args[0].toLowerCase(), FRIEND);
    });

    it("notes first-time recipients, but not contacts or the user's own accounts", async function () {
      assert.deepEqual(
        ids(
          await getTransactionAlerts({
            txParams: { to: STRANGER },
            ...makeContext(),
          }),
        ),
        ['alertFirstTimeRecipient'],
      );
      assert.deepEqual(
        await getTransactionAlerts({
          txParams: { to: FRIEND },
          ...makeContext(),
        }),
        [],
      );
      assert.deepEqual(
        await getTransactionAlerts({ txParams: { to: OWN }, ...makeContext() }),
        [],
      );
    });

    it('checks the token recipient, not the token contract, for transfers', async function () {
      const alerts = await getTransactionAlerts({
        txParams: {
          to: TOKEN,
          data: encode('a9059cbb', ['address', 'uint256'], [LOOKALIKE, 5]),
        },
        ...makeContext(),
      });
      assert.deepEqual(ids(alerts), ['alertLookalikeAddress']);
      const toContract = await getTransactionAlerts({
        txParams: {
          to: TOKEN,
          data: encode('a9059cbb', ['address', 'uint256'], [TOKEN, 5]),
        },
        ...makeContext(),
      });
      assert.deepEqual(ids(toContract), ['alertRecipientIsTokenContract']);
    });

    it('flags sending funds to a tracked token contract', async function () {
      const alerts = await getTransactionAlerts({
        txParams: { to: TOKEN },
        ...makeContext({ tokens: [TOKEN], known: [TOKEN] }),
      });
      assert.deepEqual(ids(alerts), ['alertRecipientIsKnownToken']);
    });

    it('flags contract data sent to an address without code', async function () {
      const alerts = await getTransactionAlerts({
        txParams: { to: STRANGER, data: '0x12345678' },
        ...makeContext(),
      });
      assert.deepEqual(ids(alerts), ['alertDataToNonContract']);
    });

    it('flags unlimited approvals and spenders that are not contracts, but not revocations', async function () {
      const unlimited = await getTransactionAlerts({
        txParams: {
          to: TOKEN,
          data: encode('095ea7b3', ['address', 'uint256'], [SPENDER, MAX]),
        },
        ...makeContext(),
      });
      assert.deepEqual(ids(unlimited), ['alertUnlimitedApproval']);
      const toAccount = await getTransactionAlerts({
        txParams: {
          to: TOKEN,
          data: encode('095ea7b3', ['address', 'uint256'], [STRANGER, 10]),
        },
        ...makeContext(),
      });
      assert.deepEqual(ids(toAccount), ['alertSpenderNotContract']);
      const revoke = await getTransactionAlerts({
        txParams: {
          to: TOKEN,
          data: encode('095ea7b3', ['address', 'uint256'], [STRANGER, 0]),
        },
        ...makeContext(),
      });
      assert.deepEqual(revoke, []);
    });

    it('flags token calls that are not encoded the standard way, and still checks them', async function () {
      const standard = encode(
        '095ea7b3',
        ['address', 'uint256'],
        [SPENDER, MAX],
      );
      const dirtyApproval = await getTransactionAlerts({
        txParams: {
          to: TOKEN,
          data: `0x095ea7b3${'ff'.repeat(12)}${standard.slice(34)}`,
        },
        ...makeContext(),
      });
      assert.deepEqual(ids(dirtyApproval), [
        'alertMalformedTokenCall',
        'alertUnlimitedApproval',
      ]);
      const unreadable = await getTransactionAlerts({
        txParams: { to: TOKEN, data: '0xa9059cbb123' },
        ...makeContext(),
      });
      assert.deepEqual(ids(unreadable), ['alertMalformedTokenCall']);
    });

    it('flags approving a whole NFT collection', async function () {
      const alerts = await getTransactionAlerts({
        txParams: {
          to: TOKEN,
          data: encode('a22cb465', ['address', 'bool'], [STRANGER, true]),
        },
        ...makeContext(),
      });
      assert.deepEqual(ids(alerts), [
        'alertApproveAllNfts',
        'alertSpenderNotContract',
      ]);
      const revoke = await getTransactionAlerts({
        txParams: {
          to: TOKEN,
          data: encode('a22cb465', ['address', 'bool'], [STRANGER, false]),
        },
        ...makeContext(),
      });
      assert.deepEqual(revoke, []);
    });

    it('reports when the RPC cannot be reached instead of failing', async function () {
      const alerts = await getTransactionAlerts({
        txParams: {
          to: TOKEN,
          data: encode('095ea7b3', ['address', 'uint256'], [SPENDER, 1]),
        },
        ...makeContext(),
        getCode: async () => {
          throw new Error('offline');
        },
      });
      assert.deepEqual(ids(alerts), [
        'alertCodeCheckFailed',
        'alertCodeCheckFailed',
      ]);
    });

    it('warns rather than whispers when a check could not run', async function () {
      const offline = async () => {
        throw new Error('offline');
      };
      const approval = await getTransactionAlerts({
        txParams: {
          to: TOKEN,
          data: encode('095ea7b3', ['address', 'uint256'], [SPENDER, 1]),
        },
        ...makeContext(),
        getCode: offline,
      });
      // The check it stands in for is a DANGER alert, so an unreachable network
      // must not silently downgrade it to the quietest severity.
      assert.deepEqual(
        approval.map(({ severity }) => severity),
        ['warning', 'warning'],
      );

      const plainData = await getTransactionAlerts({
        txParams: { to: STRANGER, data: '0xdeadbeef' },
        ...makeContext(),
        getCode: offline,
      });
      assert.equal(plainData[0].id, 'alertCodeCheckFailed');
      assert.equal(plainData[0].severity, 'warning');
    });
  });

  describe('typed data', function () {
    const now = Date.UTC(2026, 9, 1);
    const soon = Math.floor(now / 1000) + 3600;
    const permit = (message, primaryType = 'Permit') =>
      JSON.stringify({ primaryType, domain: {}, types: {}, message });

    it('decodes EIP-2612, DAI and Permit2 permits', function () {
      assert.equal(
        decodePermit({
          primaryType: 'Permit',
          message: { spender: SPENDER, value: '5', deadline: soon },
        }).amounts[0].toString(),
        '5',
      );
      assert.equal(
        decodePermit({
          primaryType: 'Permit',
          message: { spender: SPENDER, allowed: true, expiry: 0 },
        }).unlimited,
        true,
      );
      const single = decodePermit({
        primaryType: 'PermitSingle',
        message: {
          spender: SPENDER,
          sigDeadline: soon,
          details: { token: TOKEN, amount: '7', expiration: soon + 5 },
        },
      });
      assert.equal(single.amounts[0].toString(), '7');
      assert.equal(single.expiry.toNumber(), soon + 5);
      assert.equal(
        decodePermit({ primaryType: 'Mail', message: { spender: SPENDER } }),
        undefined,
      );
    });

    it('explains a short, limited permit to a contract', async function () {
      const alerts = await getTypedDataAlerts({
        data: permit({
          owner: OWN,
          spender: SPENDER,
          value: '5',
          nonce: 0,
          deadline: soon,
        }),
        now,
        ...makeContext(),
      });
      assert.deepEqual(ids(alerts), ['alertPermitSignature']);
    });

    it('flags unlimited, long-lived permits to ordinary accounts', async function () {
      const alerts = await getTypedDataAlerts({
        data: permit({ spender: STRANGER, value: MAX, deadline: MAX }),
        now,
        ...makeContext(),
      });
      assert.deepEqual(ids(alerts), [
        'alertSpenderNotContract',
        'alertPermitSignature',
        'alertUnlimitedApproval',
        'alertLongLivedPermit',
      ]);
      const dai = await getTypedDataAlerts({
        data: permit({
          holder: OWN,
          spender: SPENDER,
          nonce: 0,
          expiry: 0,
          allowed: true,
        }),
        now,
        ...makeContext(),
      });
      assert.deepEqual(ids(dai), [
        'alertPermitSignature',
        'alertUnlimitedApproval',
        'alertLongLivedPermit',
      ]);
    });

    it('ignores revocations and other messages, and flags unreadable data', async function () {
      assert.deepEqual(
        await getTypedDataAlerts({
          data: permit({ spender: SPENDER, allowed: false, expiry: 0 }),
          now,
          ...makeContext(),
        }),
        [],
      );
      assert.deepEqual(
        await getTypedDataAlerts({
          data: permit({ contents: 'hi' }, 'Mail'),
          now,
          ...makeContext(),
        }),
        [],
      );
      assert.deepEqual(
        ids(
          await getTypedDataAlerts({
            data: '{not json',
            now,
            ...makeContext(),
          }),
        ),
        ['alertSecurityChecksFailed'],
      );
    });
  });

  describe('token approvals that share the ERC-20 selector', function () {
    it('reads increaseApproval like increaseAllowance', function () {
      assert.equal(
        functionSelector('increaseApproval(address,uint256)'),
        'd73dd623',
      );
      const call = decodeCall(
        encode('d73dd623', ['address', 'uint256'], [SPENDER, MAX]),
      );
      assert.equal(call.kind, 'approve');
      assert.equal(call.spender, SPENDER);
    });

    it('checks ERC-721 approve(spender, 0) instead of reading it as a revocation', async function () {
      const toAccount = await getTransactionAlerts({
        txParams: {
          to: NFT,
          data: encode('095ea7b3', ['address', 'uint256'], [DRAINER, 0]),
        },
        ...makeContext(),
      });
      assert.deepEqual(ids(toAccount), [
        'alertSpenderNotContract',
        'alertApproveNft',
      ]);
      assert.equal(toAccount[1].args[1], '0');
      // An ERC-20 approval of 0 is still a revocation.
      assert.deepEqual(
        await getTransactionAlerts({
          txParams: {
            to: TOKEN,
            data: encode('095ea7b3', ['address', 'uint256'], [DRAINER, 0]),
          },
          ...makeContext(),
        }),
        [],
      );
      // Approving the zero address revokes a single NFT approval.
      assert.deepEqual(
        await getTransactionAlerts({
          txParams: {
            to: NFT,
            data: encode('095ea7b3', ['address', 'uint256'], [ZERO, 7]),
          },
          ...makeContext(),
        }),
        [],
      );
    });

    it('does not read a large token ID as an unlimited allowance', async function () {
      const alerts = await getTransactionAlerts({
        txParams: {
          to: NFT,
          data: encode('095ea7b3', ['address', 'uint256'], [SPENDER, MAX]),
        },
        ...makeContext(),
      });
      assert.deepEqual(ids(alerts), ['alertApproveNft']);
    });
  });

  describe('marketplace orders', function () {
    const now = Date.UTC(2026, 9, 1);
    const nowSeconds = Math.floor(now / 1000);
    const inAWeek = String(nowSeconds + 7 * 24 * 3600);
    const OPENSEA_FEE = '0x0000a26b00c1f0df003000390027140000faa719';
    const SEAPORT_TYPES = {
      EIP712Domain: [
        { name: 'name', type: 'string' },
        { name: 'version', type: 'string' },
        { name: 'chainId', type: 'uint256' },
        { name: 'verifyingContract', type: 'address' },
      ],
      OrderComponents: [
        { name: 'offerer', type: 'address' },
        { name: 'zone', type: 'address' },
        { name: 'offer', type: 'OfferItem[]' },
        { name: 'consideration', type: 'ConsiderationItem[]' },
        { name: 'orderType', type: 'uint8' },
        { name: 'startTime', type: 'uint256' },
        { name: 'endTime', type: 'uint256' },
        { name: 'zoneHash', type: 'bytes32' },
        { name: 'salt', type: 'uint256' },
        { name: 'conduitKey', type: 'bytes32' },
        { name: 'counter', type: 'uint256' },
      ],
      OfferItem: [
        { name: 'itemType', type: 'uint8' },
        { name: 'token', type: 'address' },
        { name: 'identifierOrCriteria', type: 'uint256' },
        { name: 'startAmount', type: 'uint256' },
        { name: 'endAmount', type: 'uint256' },
      ],
      ConsiderationItem: [
        { name: 'itemType', type: 'uint8' },
        { name: 'token', type: 'address' },
        { name: 'identifierOrCriteria', type: 'uint256' },
        { name: 'startAmount', type: 'uint256' },
        { name: 'endAmount', type: 'uint256' },
        { name: 'recipient', type: 'address' },
      ],
    };
    const SEAPORT_DOMAIN = {
      name: 'Seaport',
      version: '1.6',
      chainId: 1,
      verifyingContract: '0x0000000000000068f116a894984e2db1123eb395',
    };
    const item = (itemType, token, id, amount, recipient) => ({
      itemType,
      token,
      identifierOrCriteria: String(id),
      startAmount: String(amount),
      endAmount: String(amount),
      ...(recipient ? { recipient } : {}),
    });
    const seaportOrder = (offer, consideration, overrides = {}) => ({
      offerer: OWN,
      zone: ZERO,
      offer,
      consideration,
      orderType: 0,
      startTime: String(nowSeconds),
      endTime: inAWeek,
      zoneHash: `0x${'0'.repeat(64)}`,
      salt: '24446860302761739304752683030156737591518664810215442929808784621098726351597',
      conduitKey:
        '0x0000007b02230091a7ed01230072f7006a004d60a8d4e71d599b8104250f0000',
      counter: '0',
      ...overrides,
    });
    const seaport = (message) =>
      JSON.stringify({
        types: SEAPORT_TYPES,
        primaryType: 'OrderComponents',
        domain: SEAPORT_DOMAIN,
        message,
      });
    const ape = item(2, NFT, 1234, 1);
    const check = async (data) =>
      getTypedDataAlerts({ data, now, ...makeContext() });

    it('flags a zero-price Seaport listing that pays someone else', async function () {
      const alerts = await check(
        seaport(seaportOrder([ape], [item(2, NFT, 1234, 1, DRAINER)])),
      );
      assert.deepEqual(ids(alerts), [
        'alertOrderFreeListing',
        'alertOrderSummaryNothing',
      ]);
      assert.equal(alerts[0].severity, 'danger');
      assert.match(
        alerts[0].args[0],
        /ERC-721 0xBC4CA0EdA7647A8aB7C2061c2E118A18a936f13D #1234/u,
      );
      assert.equal(alerts[1].args[0], 'Seaport 1.6');
    });

    it('flags a Seaport listing that pays the signer next to nothing', async function () {
      const alerts = await check(
        seaport(
          seaportOrder(
            [ape, item(1, TOKEN, 0, 5000n * ETHER)],
            [item(0, ZERO, 0, 1, OWN), item(1, TOKEN, 0, 1, OWN)],
          ),
        ),
      );
      assert.deepEqual(ids(alerts), [
        'alertOrderFreeListing',
        'alertOrderSummary',
      ]);
      assert.equal(
        alerts[1].args[2],
        `0.000000000000000001 native, 1 ERC-20 0x6B175474E89094C44Da98b954EedeAC495271d0F`,
      );
    });

    it('does not flag a normally priced Seaport listing or a bid', async function () {
      const listing = await check(
        seaport(
          seaportOrder(
            [ape],
            [
              item(0, ZERO, 0, (975n * ETHER) / 1000n, OWN),
              item(0, ZERO, 0, (25n * ETHER) / 1000n, OPENSEA_FEE),
            ],
          ),
        ),
      );
      assert.deepEqual(ids(listing), ['alertOrderSummary']);
      assert.equal(listing[0].severity, 'info');
      assert.equal(listing[0].args[2], '0.975 native');

      // A collection offer: WETH for any NFT of the collection.
      const bid = await check(
        seaport(
          seaportOrder(
            [item(1, WETH, 0, ETHER)],
            [
              item(4, NFT, 0, 1, OWN),
              item(1, WETH, 0, ETHER / 40n, OPENSEA_FEE),
            ],
          ),
        ),
      );
      assert.deepEqual(ids(bid), ['alertOrderSummary']);
      assert.equal(
        bid[0].args[1],
        '1 ERC-20 0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
      );
    });

    it('warns about wildcard offers and orders that last for years', async function () {
      const alerts = await check(
        seaport(
          seaportOrder(
            [item(4, NFT, 0, 1)],
            [
              item(0, ZERO, 0, ETHER, OWN),
              item(0, ZERO, 0, ETHER / 40n, OPENSEA_FEE),
            ],
            { endTime: MAX },
          ),
        ),
      );
      assert.deepEqual(ids(alerts), [
        'alertOrderWildcardOffer',
        'alertOrderLongLived',
        'alertOrderSummary',
      ]);
    });

    it('checks every order in a Seaport bulk order', async function () {
      const padding = seaportOrder([], [], { offerer: ZERO, endTime: '0' });
      const alerts = await check(
        JSON.stringify({
          primaryType: 'BulkOrder',
          domain: SEAPORT_DOMAIN,
          types: {},
          message: {
            tree: [
              [
                seaportOrder([ape], [item(0, ZERO, 0, ETHER, OWN)]),
                seaportOrder([item(2, NFT, 99, 1)], []),
              ],
              [padding, padding],
            ],
          },
        }),
      );
      assert.deepEqual(ids(alerts), [
        'alertOrderFreeListing',
        'alertOrderSummary',
        'alertOrderSummaryNothing',
      ]);
    });

    const BLUR_DOMAIN = {
      name: 'Blur Exchange',
      version: '1.0',
      chainId: 1,
      verifyingContract: '0x000000000000ad05ccc4f10045630fb830b95127',
    };
    const blurOrder = (overrides) => ({
      trader: OWN,
      side: 1,
      matchingPolicy: '0x0000000000b92d5d043faf7cecf7e2ee6aaed232',
      collection: NFT,
      tokenId: '1234',
      amount: '1',
      paymentToken: ZERO,
      price: String(ETHER),
      listingTime: String(nowSeconds),
      expirationTime: inAWeek,
      fees: [
        { rate: 50, recipient: '0x8e5b3a5e1e7a8e8a3f4e3b5a3f6c4d4e3a2b1c0d' },
      ],
      salt: '1',
      extraParams: '0x',
      nonce: 0,
      ...overrides,
    });
    const blur = (message, primaryType = 'Order') =>
      JSON.stringify({ primaryType, domain: BLUR_DOMAIN, types: {}, message });

    it('flags Blur listings for nothing, and hidden bulk listings', async function () {
      const free = await check(blur(blurOrder({ price: '0' })));
      assert.deepEqual(ids(free), [
        'alertOrderFreeListing',
        'alertOrderSummaryNothing',
      ]);
      // Fees that take the whole price leave the seller nothing.
      const allFees = await check(
        blur(blurOrder({ fees: [{ rate: 10000, recipient: DRAINER }] })),
      );
      assert.equal(allFees[0].id, 'alertOrderFreeListing');
      const root = await check(blur({ tree: `0x${'ab'.repeat(32)}` }, 'Root'));
      assert.deepEqual(ids(root), ['alertBulkSignatureHidden']);
      assert.equal(root[0].severity, 'danger');
    });

    it('does not flag a priced Blur listing', async function () {
      const alerts = await check(blur(blurOrder()));
      assert.deepEqual(ids(alerts), ['alertOrderSummary']);
      assert.equal(alerts[0].args[2], '0.995 native');
    });

    const LOOKSRARE_DOMAIN = {
      name: 'LooksRareProtocol',
      version: '2',
      chainId: 1,
      verifyingContract: '0x0000000000e655fae4d56241588680f86e3b2377',
    };
    const maker = (overrides) => ({
      quoteType: 1,
      globalNonce: '0',
      subsetNonce: '0',
      orderNonce: '0',
      strategyId: '0',
      collectionType: 0,
      collection: NFT,
      currency: ZERO,
      signer: OWN,
      startTime: String(nowSeconds),
      endTime: inAWeek,
      price: String(ETHER / 2n),
      itemIds: ['1234'],
      amounts: ['1'],
      additionalParameters: '0x',
      ...overrides,
    });
    const looksRare = (message) =>
      JSON.stringify({
        primaryType: 'Maker',
        domain: LOOKSRARE_DOMAIN,
        types: {},
        message,
      });

    it('flags LooksRare asks for next to nothing, but not priced asks or bids', async function () {
      const free = await check(looksRare(maker({ price: '1' })));
      assert.deepEqual(ids(free), [
        'alertOrderFreeListing',
        'alertOrderSummary',
      ]);
      assert.deepEqual(ids(await check(looksRare(maker()))), [
        'alertOrderSummary',
      ]);
      const bid = await check(
        looksRare(maker({ quoteType: 0, currency: WETH })),
      );
      assert.deepEqual(ids(bid), ['alertOrderSummary']);
    });

    it('leaves other order formats alone', function () {
      assert.equal(
        decodeOrders({
          primaryType: 'Order',
          domain: { name: 'Gnosis Protocol' },
          message: { sellToken: WETH },
        }),
        undefined,
      );
      assert.deepEqual(
        decodeOrders({
          primaryType: 'OrderComponents',
          domain: SEAPORT_DOMAIN,
          message: seaportOrder([{ itemType: 9 }], []),
        }),
        { unreadable: true },
      );
    });
  });

  describe('Safe transactions', function () {
    const SAFE = '0x9999999999999999999999999999999999999999';
    const MULTISEND_CALL_ONLY = '0x9641d764fc13c8b624c04430c7356c1c7c8102e2';
    const safeTx = (overrides) =>
      JSON.stringify({
        primaryType: 'SafeTx',
        domain: { chainId: 1, verifyingContract: SAFE },
        types: {},
        message: {
          to: TOKEN,
          value: '0',
          data: '0x',
          operation: 0,
          safeTxGas: '0',
          baseGas: '0',
          gasPrice: '0',
          gasToken: ZERO,
          refundReceiver: ZERO,
          nonce: '3',
          ...overrides,
        },
      });
    const check = async (data) =>
      getTypedDataAlerts({ data, ...makeContext() });
    const packCall = (operation, to, value, data) => {
      const bytes = Buffer.from(data.slice(2), 'hex');
      return Buffer.concat([
        Buffer.from([operation]),
        Buffer.from(to.slice(2), 'hex'),
        Buffer.from(value.toString(16).padStart(64, '0'), 'hex'),
        Buffer.from(bytes.length.toString(16).padStart(64, '0'), 'hex'),
        bytes,
      ]);
    };
    const multiSend = (...calls) =>
      encode('8d80ff0a', ['bytes'], [Buffer.concat(calls)]);
    const addOwner = encode(
      functionSelector('addOwnerWithThreshold(address,uint256)'),
      ['address', 'uint256'],
      [DRAINER, 1],
    );

    it('shows a plain Safe call', async function () {
      const alerts = await check(safeTx({ to: FRIEND, value: String(ETHER) }));
      assert.deepEqual(ids(alerts), ['alertSafeTxSummary']);
      assert.deepEqual(alerts[0].args.slice(1), [
        'call',
        '0xAbcd000000000000000000000000000000001234',
        '1',
        '0',
      ]);
    });

    it('flags delegatecalls to anything but MultiSend', async function () {
      const alerts = await check(
        safeTx({ to: DRAINER, operation: 1, data: '0x12345678' }),
      );
      assert.deepEqual(ids(alerts), [
        'alertSafeDelegateCall',
        'alertSafeTxSummary',
      ]);
      assert.equal(alerts[0].severity, 'danger');
    });

    it('names changes to the Safe itself, including inside a MultiSend batch', async function () {
      const direct = await check(
        safeTx({
          to: SAFE,
          data: encode(
            functionSelector('changeThreshold(uint256)'),
            ['uint256'],
            [1],
          ),
        }),
      );
      assert.deepEqual(ids(direct), [
        'alertSafeSelfCall',
        'alertSafeTxSummary',
      ]);
      assert.deepEqual(direct[0].args, ['changeThreshold']);

      const batch = multiSend(
        packCall(
          0,
          TOKEN,
          0n,
          encode('a9059cbb', ['address', 'uint256'], [FRIEND, 1]),
        ),
        packCall(0, SAFE, 0n, addOwner),
      );
      assert.equal(decodeMultiSend(batch).length, 2);
      const batched = await check(
        safeTx({ to: MULTISEND_CALL_ONLY, operation: 1, data: batch }),
      );
      assert.deepEqual(ids(batched), [
        'alertSafeSelfCall',
        'alertSafeTxSummary',
      ]);
      assert.deepEqual(batched[0].args, ['addOwnerWithThreshold']);
    });

    it('flags delegatecalls and unreadable data inside a MultiSend batch', async function () {
      const nested = await check(
        safeTx({
          to: MULTISEND_CALL_ONLY,
          operation: 1,
          data: multiSend(packCall(1, DRAINER, 0n, '0x12345678')),
        }),
      );
      assert.deepEqual(ids(nested), [
        'alertSafeDelegateCall',
        'alertSafeTxSummary',
      ]);
      const truncated = multiSend(packCall(0, TOKEN, 0n, '0x12345678')).slice(
        0,
        -66,
      );
      const unreadable = await check(
        safeTx({ to: MULTISEND_CALL_ONLY, operation: 1, data: truncated }),
      );
      assert.deepEqual(ids(unreadable), [
        'alertSafeBatchUnreadable',
        'alertSafeTxSummary',
      ]);
    });
  });
});
