import assert from 'assert';
import { mount } from 'enzyme';
import React from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

import Help from '..';
import en from '../../../../../app/_locales/en/messages.json';
import { HELP_TOPICS, getHelpUrl } from '../../../helpers/constants/help';
import { ROUTER_FUTURE_FLAGS } from '../../../helpers/constants/router';
import { HELP_ROUTE } from '../../../helpers/constants/routes';

describe('Help page', function () {
  function mountAt(pathname) {
    return mount(
      <MemoryRouter initialEntries={[pathname]} future={ROUTER_FUTURE_FLAGS}>
        <Routes>
          <Route path={`${HELP_ROUTE}/:topic?`} element={<Help />} />
        </Routes>
      </MemoryRouter>,
    );
  }

  it('renders the requested topic and links to the others', function () {
    const wrapper = mountAt(`${HELP_ROUTE}/add-tokens`);
    assert.equal(wrapper.find('.help__title').text(), '[helpAddTokensTitle]');
    assert.equal(
      wrapper.find('.help__paragraph').length,
      HELP_TOPICS['add-tokens'].paragraphs.length,
    );
    assert.deepEqual(
      wrapper.find('a.help__topic-link').map((link) => link.prop('href')),
      ['/help/imported-accounts', '/help/import-json', '/help/safety-tips'],
    );
  });

  it('shows the safety tips for a missing or unknown topic', function () {
    for (const pathname of [HELP_ROUTE, `${HELP_ROUTE}/no-such-topic`]) {
      const wrapper = mountAt(pathname);
      assert.equal(
        wrapper.find('.help__title').text(),
        '[helpSafetyTipsTitle]',
      );
    }
  });

  it('has English text for every topic', function () {
    for (const { title, paragraphs } of Object.values(HELP_TOPICS)) {
      for (const key of [title, ...paragraphs]) {
        assert.ok(en[key], `missing ${key}`);
      }
    }
  });

  it('links into the full-screen view', function () {
    assert.equal(getHelpUrl('safety-tips'), 'home.html#/help/safety-tips');
  });
});
