import React, { useContext, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { I18nContext } from '../../../contexts/i18n'
import { ABOUT_US_ROUTE } from '../../../helpers/constants/routes'

/**
 * Shows the hash of the running build, so verifying it is one click away
 * rather than something to go looking for. The full hash, the commit and the
 * instructions live under Settings > About.
 */
export default function BuildStamp () {
  const t = useContext(I18nContext)
  const navigate = useNavigate()
  const [hash, setHash] = useState(null)

  useEffect(() => {
    let cancelled = false
    // Packaged with the extension by development/build/build-info.js, so this
    // reads a local file and never touches the network.
    global.fetch('./build-info.json')
      .then((response) => response.json())
      .then((info) => {
        if (!cancelled) {
          setHash(info.hash)
        }
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [])

  if (!hash) {
    return null
  }

  return (
    <button
      className="build-stamp"
      onClick={() => navigate(ABOUT_US_ROUTE)}
      title={hash}
    >
      {`${t('buildHash').toLowerCase()} ${hash.slice(0, 8)}`}
      <span className="build-stamp__verify">{ t('verify') }</span>
    </button>
  )
}
