# Design System

The wallet matches [swap.ethcf.org](https://swap.ethcf.org): flat, monochrome,
square corners, no shadows, no webfont. It is deliberately plain.

The system lives in `ui/app/css/design-system/`:

- `themes.scss` defines every colour as a `--color-*` custom property, once for
  light and again under `[data-theme='dark']`. Components reference the token,
  never a literal. A new colour belongs here or it will not survive a theme
  switch.
- `typography.scss` sets the type scale. The family is `Courier New`, falling
  back to the system monospace stack. No font is downloaded.
- `breakpoints.scss` and `z-index.scss` hold the remaining shared values.
- `index.scss` pulls the above together for the main stylesheet.

Two rules worth stating because they have been broken before. Sass functions
such as `lighten()` cannot operate on a custom property, so pick a different
token rather than computing one. And a colour that is close to a theme's
background needs a border or an inset hairline to stay visible, as the network
swatches in `ui/app/css/itcss/components/network.scss` do.
