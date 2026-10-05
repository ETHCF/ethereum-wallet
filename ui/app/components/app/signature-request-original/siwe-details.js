import PropTypes from 'prop-types';
import React from 'react';

export default function SiweDetails({ siwe, origin }) {
  const { parsedMessage: message, errors = [], warnings = [] } = siwe;
  return (
    <section
      className="request-signature__rows"
      aria-label="Sign in with Ethereum"
    >
      <h2>Sign in with Ethereum</h2>
      <p>Requesting site: {origin}</p>
      {errors.map((error) => (
        <p role="alert" key={error}>
          {error}
        </p>
      ))}
      {warnings.map((warning) => (
        <p role="alert" key={warning}>
          {warning}
        </p>
      ))}
      {message && (
        <div>
          {[
            ['Domain', message.domain],
            ['Account', message.address],
            ['Statement', message.statement],
            ['URI', message.uri],
            ['Chain ID', message.chainId],
            ['Version', message.version],
            ['Nonce', message.nonce],
            ['Issued at', message.issuedAt],
            ['Expires at', message.expirationTime],
            ['Not before', message.notBefore],
            ['Request ID', message.requestId],
          ]
            .filter(([, value]) => value !== undefined)
            .map(([label, value]) => (
              <div className="request-signature__row" key={label}>
                <strong>{label}: </strong>
                <span>{String(value)}</span>
              </div>
            ))}
          {message.resources?.length > 0 && <h3>Resources</h3>}
          {message.resources?.map((resource, index) => (
            <p key={index}>{resource}</p>
          ))}
          <p>
            Signing proves control of your account to this site. It does not
            send a transaction or pay gas.
          </p>
        </div>
      )}
    </section>
  );
}

SiweDetails.propTypes = {
  siwe: PropTypes.object.isRequired,
  origin: PropTypes.string,
};
