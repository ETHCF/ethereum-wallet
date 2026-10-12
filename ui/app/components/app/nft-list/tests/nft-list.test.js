import { waitFor } from '@testing-library/react';
import assert from 'assert';
import React from 'react';
import configureMockStore from 'redux-mock-store';
import { thunk } from 'redux-thunk';
import sinon from 'sinon';

import NftList from '..';
import { renderWithProvider } from '../../../../../../test/lib/render-helpers';
import * as actions from '../../../../store/actions';

const ACCOUNT = '0x1234567890123456789012345678901234567890';
const CONTRACT = '0xBC4CA0EdA7647A8aB7C2061c2E118A18a936f13D';

describe('NftList', function () {
  let background;

  beforeEach(function () {
    background = {
      detectNfts: sinon.stub().callsFake((cb) => cb(null)),
      getNftImages: sinon
        .stub()
        .callsFake((keys, cb) =>
          cb(null, { [keys[0]]: 'data:image/png;base64,AAAA' }),
        ),
    };
    actions._setBackgroundConnection(background);
  });

  const render = (ecfWallet) =>
    renderWithProvider(
      <NftList />,
      configureMockStore([thunk])({
        ecfWallet: {
          selectedAddress: ACCOUNT,
          provider: { type: 'mainnet' },
          allNfts: {},
          ...ecfWallet,
        },
      }),
    );

  it('looks nothing up on a network detection is not used for', function () {
    const { getByTestId } = render({ provider: { type: 'sepolia' } });
    assert.ok(getByTestId('nft-list-unsupported'));
    assert.equal(background.detectNfts.called, false);
  });

  it('looks up the NFTs when shown, and says when there are none', async function () {
    const { findByTestId } = render();
    assert.ok(await findByTestId('nft-list-empty'));
    assert.ok(background.detectNfts.calledOnce);
  });

  it('shows downloaded images, and a placeholder for the rest', async function () {
    const nft = (tokenId) => ({
      address: CONTRACT,
      tokenId,
      name: `Ape #${tokenId}`,
      collection: { name: 'Apes' },
    });
    const { container, getAllByTestId } = render({
      displayNftMedia: true,
      allNfts: { [ACCOUNT]: { '0x1': [nft('1'), nft('2')] } },
    });
    assert.equal(getAllByTestId('nft-list-item').length, 2);
    await waitFor(() =>
      assert.equal(
        container.querySelector('img.nft-list__image')?.getAttribute('src'),
        'data:image/png;base64,AAAA',
      ),
    );
    assert.equal(
      container.querySelectorAll('.nft-list__image--placeholder').length,
      1,
    );
    assert.deepEqual(background.getNftImages.firstCall.args[0], [
      `0x1:${CONTRACT.toLowerCase()}:1`,
      `0x1:${CONTRACT.toLowerCase()}:2`,
    ]);
  });

  it('asks for no images unless the user allows them', async function () {
    const { findAllByTestId } = render({
      allNfts: {
        [ACCOUNT]: { '0x1': [{ address: CONTRACT, tokenId: '1', name: 'A' }] },
      },
    });
    await findAllByTestId('nft-list-item');
    assert.equal(background.getNftImages.called, false);
  });
});
