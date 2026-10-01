import assert from 'assert'
import React from 'react'
import sinon from 'sinon'
import { mount } from 'enzyme'
import { Provider } from 'react-redux'
import configureMockStore from 'redux-mock-store'
import thunk from 'redux-thunk'
import RevealSeedPage from '../reveal-seed'
import { HOLD_DURATION_MS } from '../../../components/ui/hold-to-reveal-button/hold-to-reveal-button.component'

const SEED = 'debris dizzy just program just float decrease vacant alarm reduce speak stadium'

describe('Reveal Seed Page', function () {
  let clock
  let props
  let wrapper

  beforeEach(function () {
    clock = sinon.useFakeTimers()
    props = {
      history: { push: sinon.spy() },
      mostRecentOverviewPage: '/',
      requestRevealSeedWords: sinon.stub().resolves(SEED),
    }
    wrapper = mount(
      <Provider store={configureMockStore([thunk])({})}>
        <RevealSeedPage.WrappedComponent {...props} />
      </Provider>, {
        context: { t: (str) => str },
        childContextTypes: { t: () => null },
      },
    )
  })

  afterEach(function () {
    wrapper.unmount()
    clock.restore()
  })

  function answer (testId) {
    wrapper.find(`button[data-testid="${testId}"]`).simulate('click')
  }

  async function passQuizAndUnlock () {
    answer('srp-quiz-right-answer')
    answer('srp-quiz-continue')
    answer('srp-quiz-right-answer')
    answer('srp-quiz-continue')
    wrapper.find('form').simulate('submit')
    await Promise.resolve()
    await Promise.resolve()
    wrapper.update()
  }

  const holdButton = () => wrapper.find('button[data-testid="hold-to-reveal-button"]')
  const seedShown = () => wrapper.text().includes(SEED)

  it('asks the security quiz before the password, and repeats a wrongly answered question', function () {
    assert.equal(wrapper.find('form').length, 0)
    answer('srp-quiz-wrong-answer')
    assert.equal(wrapper.find('[data-testid="srp-quiz-wrong"]').length, 1)
    answer('srp-quiz-try-again')
    assert.ok(wrapper.text().includes('srpQuizQuestionOne'))

    answer('srp-quiz-right-answer')
    answer('srp-quiz-continue')
    assert.ok(wrapper.text().includes('srpQuizQuestionTwo'))
    assert.equal(wrapper.find('form').length, 0)
    answer('srp-quiz-right-answer')
    answer('srp-quiz-continue')
    assert.equal(wrapper.find('form').length, 1)
    assert.equal(props.requestRevealSeedWords.called, false)
  })

  it('reveals the seed phrase only after the button is held down', async function () {
    await passQuizAndUnlock()
    assert(props.requestRevealSeedWords.calledOnce)
    assert.equal(seedShown(), false)

    holdButton().simulate('pointerdown', { button: 0, isTrusted: true })
    clock.tick(HOLD_DURATION_MS - 1)
    wrapper.update()
    assert.equal(seedShown(), false)
    clock.tick(1)
    wrapper.update()
    assert.equal(seedShown(), true)
  })

  it('does not reveal on a short press, a click, or a scripted event', async function () {
    await passQuizAndUnlock()

    holdButton().simulate('pointerdown', { button: 0, isTrusted: true })
    clock.tick(HOLD_DURATION_MS / 2)
    holdButton().simulate('pointerup')
    clock.tick(HOLD_DURATION_MS * 2)

    holdButton().simulate('click')
    holdButton().simulate('pointerdown', { button: 0, isTrusted: false })
    clock.tick(HOLD_DURATION_MS * 2)
    wrapper.update()
    assert.equal(seedShown(), false)
  })
})
