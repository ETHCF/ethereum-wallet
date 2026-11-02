# Welcome to MetaECF!

If you're submitting code to MetaECF, there are some simple things we'd appreciate you doing to help us stay organized!

### Finding the right project

Before taking the time to code and implement something, feel free to open an issue and discuss it! There may even be an issue already open, and together we may come up with a specific strategy before you take your precious time to write code.

There are also plenty of open issues we'd love help with. Search the [`good first issue`](https://github.com/ETHCF/ethereum-wallet/issues?q=is%3Aopen+is%3Aissue+label%3A%22good+first+issue%22) label.

If you're picking up an existing issue, feel free to ask clarifying questions on the issue as you go about your work.

### Submitting a pull request
When you're done with your project / bugfix / feature and ready to submit a PR, there are a couple guidelines we ask you to follow:

- [ ] **Test it**: For any new programmatic functionality, we like unit tests when possible, so if you can keep your code cleanly isolated, please add a test: background tests go in `test/unit`, UI tests in a `tests` folder next to the component. Run `yarn test` (unit tests and lint) before submitting.
- [ ] **Meet the spec**: Make sure the PR adds functionality that matches the issue you're closing. Design or implementation details are sometimes settled in the issue's conversation, so read it carefully!
- [ ] **Close the issue**: If this PR closes an open issue, add the line `Fixes #$ISSUE_NUMBER`. Ex. For closing issue 418, include the line `Fixes #418`. If it doesn't close the issue but addresses it partially, just include a reference to the issue number, like `#418`.
- [ ] **Keep it simple**: Try not to include multiple features in a single PR, and don't make extraneous changes outside the scope of your contribution. All those touched files make things harder to review ;)
- [ ] **PR against `main`**: Submit your PR against the `main` branch.
- [ ] **Get reviewed by a core contributor**: Make sure you get a `:thumbsup`, `:+1`, or `LGTM` from a user with a `Member` badge before merging.

And that's it! Thanks for helping out.
