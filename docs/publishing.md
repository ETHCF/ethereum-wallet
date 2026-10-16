# Publishing Guide

When publishing a new version of ECF Wallet, we follow this procedure:

## Overview

The below diagram outlines our process for design, development, and release. Building ECF Wallet is a community affair, and many steps of the process invite participation from external contributors as indicated. All QA, code review, and release of new versions is done by members of the core ECF Wallet team.

<img width="664" alt="mm-dev-process" src="https://user-images.githubusercontent.com/1016190/56308059-36906000-60fb-11e9-8e61-6655bca0c54f.png">


## Preparation

We try to ensure certain criteria are met before deploying:

- Deploy early in the week, to give time for emergency responses to unforeseen bugs.
- Deploy early in the day, for the same reason.
- Make sure at least one member of the support team is "on duty" to watch for new user issues coming through the support system.
- Roll out incrementally when possible, to a small number of users first, and gradually to more users.

## Incrementing the Version

Bump the version by hand in a pull request: set `version` in `app/manifest/_base.json`.

## Building

Each CI run uploads the packaged builds as the `extension-builds` artifact (kept for 7 days). Once the version bump pull request is reviewed and merged to `main`, download that run's builds for publication.

## Publishing

1. Publish to chrome store.
2. Visit [the chrome developer dashboard](https://chrome.google.com/webstore/developer/dashboard?authuser=2).
3. Publish to [firefox addon marketplace](https://addons.mozilla.org/developers/).
4. Publish to [Opera store](https://addons.opera.com/developer/).
5. Post on [Github releases](https://github.com/ETHCF/ethereum-wallet/releases) page.
6. Run the `yarn announce` script, and post that announcement in our public places.
