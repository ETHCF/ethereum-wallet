import React from 'react'
import PropTypes from 'prop-types'
import { useSelector } from 'react-redux'
import { useNavigate } from 'react-router-dom'
import AddTokenButton from '../add-token-button'
import TokenList from '../token-list'
import { ADD_TOKEN_ROUTE } from '../../../helpers/constants/routes'
import AssetListItem from '../asset-list-item'
import { useUserPreferencedCurrency } from '../../../hooks/useUserPreferencedCurrency'
import { getCurrentAccountWithSendEtherInfo, getNativeCurrency } from '../../../selectors'
import { useCurrencyDisplay } from '../../../hooks/useCurrencyDisplay'

const AssetList = ({ onClickAsset }) => {
  const navigate = useNavigate()
  const selectedAccountBalance = useSelector((state) => getCurrentAccountWithSendEtherInfo(state).balance)
  const nativeCurrency = useSelector(getNativeCurrency)

  const {
    currency: primaryCurrency,
    numberOfDecimals: primaryNumberOfDecimals,
  } = useUserPreferencedCurrency({ ethNumberOfDecimals: 4 })

  const [primaryCurrencyDisplay] = useCurrencyDisplay(
    selectedAccountBalance,
    { numberOfDecimals: primaryNumberOfDecimals, currency: primaryCurrency },
  )

  return (
    <>
      <AssetListItem
        onClick={() => onClickAsset(nativeCurrency)}
        data-testid="wallet-balance"
        primary={primaryCurrencyDisplay}
      />
      <TokenList
        onTokenClick={(tokenAddress) => {
          onClickAsset(tokenAddress)
        }}
      />
      <AddTokenButton
        onClick={() => {
          navigate(ADD_TOKEN_ROUTE)
        }}
      />
    </>
  )
}

AssetList.propTypes = {
  onClickAsset: PropTypes.func.isRequired,
}

export default AssetList
