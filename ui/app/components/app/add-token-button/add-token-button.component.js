import React from 'react';
import { useNavigate } from 'react-router-dom';

import { ADD_TOKEN_ROUTE } from '../../../helpers/constants/routes';
import { useI18nContext } from '../../../hooks/useI18nContext';
import Button from '../../ui/button';

export default function AddTokenButton() {
  const t = useI18nContext();
  const navigate = useNavigate();

  return (
    <div className="add-token-button">
      <Button
        className="add-token-button__button"
        type="secondary"
        rounded
        onClick={() => {
          navigate(ADD_TOKEN_ROUTE);
        }}
      >
        {t('addToken')}
      </Button>
    </div>
  );
}
