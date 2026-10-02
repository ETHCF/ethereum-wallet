import React from 'react'
import { Provider } from 'react-redux'
import { render } from '@testing-library/react'
import { mount } from 'enzyme'
import { MemoryRouter } from 'react-router-dom'
import PropTypes from 'prop-types'
import { LegacyI18nProvider } from '../../ui/app/contexts/i18n'
import { ROUTER_FUTURE_FLAGS } from '../../ui/app/helpers/constants/router'

export function mountWithStore (component, store) {
  const context = {
    store,
  }
  return mount(component, { context })
}

export function mountWithRouter (component, store = {}, pathname = '/') {
  const routed = (
    <MemoryRouter initialEntries={[{ pathname }]} initialIndex={0} future={ROUTER_FUTURE_FLAGS}>
      {component}
    </MemoryRouter>
  )
  return mount(
    store.getState ? <Provider store={store}>{routed}</Provider> : routed,
    {
      context: { t: (str) => str, store },
      childContextTypes: { t: PropTypes.func, store: PropTypes.object },
    },
  )
}

export function renderWithProvider (component, store) {

  const Wrapper = () => (
    <Provider store={store}>
      <LegacyI18nProvider>
        { component }
      </LegacyI18nProvider>
    </Provider>
  )

  return render(<Wrapper />)
}
