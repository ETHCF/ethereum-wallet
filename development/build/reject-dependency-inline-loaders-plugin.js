const PLUGIN_NAME = 'RejectDependencyInlineLoadersPlugin';

const isInNodeModules = (file) => /[\\/]node_modules[\\/]/u.test(file ?? '');

/**
 * Fails the build when a dependency asks for a webpack loader in its own
 * request, like require('!!./loader.js!./file.js'). Webpack would run that
 * loader in the build process, where neither LavaMoat nor the install script
 * gate applies, and it could change the bundle outside every compartment.
 */
module.exports = class RejectDependencyInlineLoadersPlugin {
  apply(compiler) {
    const reject = ({ request, context, contextInfo }) => {
      if (
        request?.includes('!') &&
        isInNodeModules(contextInfo?.issuer || context)
      ) {
        throw new Error(
          `Dependency requested an inline webpack loader: ${request}`,
        );
      }
    };

    // require.context carries its loaders through the context module factory,
    // and the modules it creates reach the normal one with no issuer.
    compiler.hooks.normalModuleFactory.tap(PLUGIN_NAME, (factory) => {
      factory.hooks.beforeResolve.tap(PLUGIN_NAME, reject);
    });
    compiler.hooks.contextModuleFactory.tap(PLUGIN_NAME, (factory) => {
      factory.hooks.beforeResolve.tap(PLUGIN_NAME, reject);
    });
  }
};
