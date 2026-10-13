import { act, fireEvent, render } from '@testing-library/react';
import assert from 'assert';
import React from 'react';
import sinon from 'sinon';

import Tooltip from '..';

describe('Tooltip', function () {
  const trigger = (container) => container.querySelector('.trigger').parentNode;
  const tooltip = () => document.body.querySelector('[role="tooltip"]');

  afterEach(function () {
    sinon.restore();
  });

  it('shows the title while the trigger is hovered', function () {
    const { container } = render(
      <Tooltip title="Copy to clipboard" position="bottom">
        <span className="trigger">Address</span>
      </Tooltip>,
    );
    assert.equal(tooltip(), null);

    fireEvent.mouseEnter(trigger(container));
    assert.equal(tooltip().textContent, 'Copy to clipboard');
    assert.equal(
      trigger(container).getAttribute('aria-describedby'),
      tooltip().id,
    );

    fireEvent.mouseLeave(trigger(container));
    assert.equal(tooltip(), null);
  });

  it('shows on keyboard focus too', function () {
    const { container } = render(
      <Tooltip title="Balance may be outdated">
        <span className="trigger">1 ETH</span>
      </Tooltip>,
    );
    fireEvent.focus(trigger(container));
    assert.equal(tooltip().textContent, 'Balance may be outdated');
    fireEvent.blur(trigger(container));
    assert.equal(tooltip(), null);
  });

  it('shows rich content and reports when it hides', function () {
    const onHidden = sinon.spy();
    const { container } = render(
      <Tooltip html={<b>Not your current account</b>} onHidden={onHidden}>
        <span className="trigger">0xabc</span>
      </Tooltip>,
    );
    fireEvent.mouseEnter(trigger(container));
    assert.equal(
      tooltip().querySelector('b').textContent,
      'Not your current account',
    );
    assert.equal(onHidden.called, false);
    fireEvent.mouseLeave(trigger(container));
    assert.equal(onHidden.calledOnce, true);
  });

  it('shows nothing when disabled or empty', function () {
    const { container, rerender } = render(
      <Tooltip title="Outdated" disabled>
        <span className="trigger">1 ETH</span>
      </Tooltip>,
    );
    fireEvent.mouseEnter(trigger(container));
    assert.equal(tooltip(), null);

    rerender(
      <Tooltip wrapperClassName="wrapper">
        <span className="trigger">1 ETH</span>
      </Tooltip>,
    );
    assert.ok(container.querySelector('.wrapper > .trigger'));
  });

  it('keeps an interactive tooltip open while the pointer moves onto it', function () {
    const clock = sinon.useFakeTimers();
    const { container } = render(
      <Tooltip interactive html={<a href="#help">Learn more</a>}>
        <span className="trigger">Warning</span>
      </Tooltip>,
    );
    fireEvent.mouseEnter(trigger(container));
    fireEvent.mouseLeave(trigger(container));
    fireEvent.mouseEnter(tooltip());
    act(() => clock.tick(1000));
    assert.ok(tooltip());

    fireEvent.mouseLeave(tooltip());
    act(() => clock.tick(1000));
    assert.equal(tooltip(), null);
  });
});
