import { fireEvent } from '@testing-library/react';
import assert from 'assert';
import React from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import configureMockStore from 'redux-mock-store';

import BackupReminder from '..';
import { renderWithProvider } from '../../../../../../test/lib/render-helpers';
import { INITIALIZE_BACKUP_SEED_PHRASE_ROUTE } from '../../../../helpers/constants/routes';

describe('BackupReminder', function () {
  const render = (seedPhraseBackedUp) =>
    renderWithProvider(
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route path="/" element={<BackupReminder />} />
          <Route
            path={INITIALIZE_BACKUP_SEED_PHRASE_ROUTE}
            element={<div data-testid="backup-flow" />}
          />
        </Routes>
      </MemoryRouter>,
      configureMockStore()({ ecfWallet: { seedPhraseBackedUp } }),
    );

  it('shows nothing once the seed phrase is backed up', function () {
    const { queryByTestId } = render(true);
    assert.equal(queryByTestId('backup-reminder'), null);
  });

  it('opens the backup flow when the seed phrase is not backed up', function () {
    const { getByTestId } = render(false);
    fireEvent.click(getByTestId('backup-reminder'));
    assert.ok(getByTestId('backup-flow'));
  });
});
