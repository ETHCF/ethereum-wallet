import PropTypes from 'prop-types';
import React, { useEffect, useMemo, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';

import {
  BUILT_IN_NETWORKS,
  NFT_DETECTION_NETWORKS,
} from '../../../../../app/scripts/controllers/network/enums';
import nftImageKey from '../../../../../app/scripts/lib/nft-image-key';
import { useI18nContext } from '../../../hooks/useI18nContext';
import { getNftChainId, getNfts } from '../../../selectors';
import { detectNfts, getNftImages } from '../../../store/actions';

const DETECTION_CHAIN_IDS = NFT_DETECTION_NETWORKS.map(
  (type) => BUILT_IN_NETWORKS[type].chainId,
);

function NftCard({ nft, image }) {
  const collection = nft.collection?.name;
  const name = nft.name || `${collection ?? ''} #${nft.tokenId}`.trim();
  return (
    <li className="nft-list__item" data-testid="nft-list-item">
      {image ? (
        <img className="nft-list__image" src={image} alt="" />
      ) : (
        <div className="nft-list__image nft-list__image--placeholder">
          {(collection || name).charAt(0).toUpperCase()}
        </div>
      )}
      <div className="nft-list__name" title={name}>
        {name}
      </div>
      {collection && (
        <div className="nft-list__collection" title={collection}>
          {collection}
        </div>
      )}
    </li>
  );
}

NftCard.propTypes = {
  nft: PropTypes.shape({
    name: PropTypes.string,
    tokenId: PropTypes.string.isRequired,
    collection: PropTypes.shape({ name: PropTypes.string }),
  }).isRequired,
  image: PropTypes.string,
};

/**
 * The selected account's NFTs, looked up through the NFT API when shown. Only
 * rendered when the user has turned NFT detection on.
 *
 * @returns {React.ReactElement} The NFT list.
 */
export default function NftList() {
  const t = useI18nContext();
  const dispatch = useDispatch();
  const nfts = useSelector(getNfts);
  const chainId = useSelector(getNftChainId);
  const displayNftMedia = useSelector(
    (state) => state.ecfWallet.displayNftMedia,
  );
  const imagesVersion = useSelector(
    (state) => state.ecfWallet.nftImagesVersion,
  );
  const supported = DETECTION_CHAIN_IDS.includes(chainId);
  // The outcome of the last lookup, and the chain it was for: a lookup for
  // the current chain that has not finished yet is still loading.
  const [lookup, setLookup] = useState({});
  const [images, setImages] = useState({});

  useEffect(() => {
    if (!supported) {
      return undefined;
    }
    let current = true;
    dispatch(detectNfts())
      .then(() => current && setLookup({ chainId, status: 'idle' }))
      .catch(() => current && setLookup({ chainId, status: 'failed' }));
    return () => {
      current = false;
    };
  }, [dispatch, supported, chainId]);
  const status = lookup.chainId === chainId ? lookup.status : 'loading';

  const keys = useMemo(
    () => nfts.map((nft) => nftImageKey(chainId, nft.address, nft.tokenId)),
    [nfts, chainId],
  );
  useEffect(() => {
    if (!displayNftMedia || keys.length === 0) {
      return undefined;
    }
    let current = true;
    getNftImages(keys)
      .then((found) => current && setImages(found ?? {}))
      .catch(() => undefined);
    return () => {
      current = false;
    };
  }, [displayNftMedia, keys, imagesVersion]);

  if (!supported) {
    return (
      <div className="nft-list__message" data-testid="nft-list-unsupported">
        {t('nftsUnsupportedNetwork', [
          NFT_DETECTION_NETWORKS.map(
            (type) => BUILT_IN_NETWORKS[type].name,
          ).join(', '),
        ])}
      </div>
    );
  }

  return (
    <div className="nft-list">
      {status === 'loading' && nfts.length === 0 && (
        <div className="nft-list__message">{t('nftsLoading')}</div>
      )}
      {status === 'failed' && (
        <div className="nft-list__message nft-list__message--error">
          {t('nftsLookupFailed')}
        </div>
      )}
      {status === 'idle' && nfts.length === 0 && (
        <div className="nft-list__message" data-testid="nft-list-empty">
          {t('noNfts')}
        </div>
      )}
      {nfts.length > 0 && (
        <ul className="nft-list__grid">
          {nfts.map((nft, index) => (
            <NftCard
              key={`${nft.address}-${nft.tokenId}`}
              nft={nft}
              image={displayNftMedia ? images[keys[index]] : undefined}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
