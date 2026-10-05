import React, { useCallback, useEffect, useRef } from 'react';
import {
  useLocation,
  useNavigate,
  useNavigationType,
  useParams,
} from 'react-router-dom';

/**
 * Gives a class component the router hooks' values as props: `navigate`,
 * `location`, `params` and `navigationType`. Props passed in explicitly take
 * precedence.
 *
 * @param {React.ComponentType} WrappedComponent - The component to wrap
 * @returns {React.ComponentType} The wrapped component
 */
export default function withRouter(WrappedComponent) {
  const ComponentWithRouter = (props) => {
    const routerNavigate = useNavigate();
    const location = useLocation();
    const params = useParams();
    const navigationType = useNavigationType();

    // React Router ignores navigate() until the component that called
    // useNavigate() has mounted, and on the first render the router only
    // starts listening for location changes in its own layout effect. A
    // wrapped component's componentDidMount runs before both (children mount
    // first), so hold navigations made before then and make them in this
    // passive effect, which runs after every layout effect of the commit.
    const mounted = useRef(false);
    const pendingNavigations = useRef([]);
    useEffect(() => {
      mounted.current = true;
      for (const args of pendingNavigations.current.splice(0)) {
        routerNavigate(...args);
      }
    }, []); // eslint-disable-line react-hooks/exhaustive-deps
    const navigate = useCallback(
      (...args) => {
        if (mounted.current) {
          routerNavigate(...args);
        } else {
          pendingNavigations.current.push(args);
        }
      },
      [routerNavigate],
    );

    return (
      <WrappedComponent
        navigate={navigate}
        location={location}
        params={params}
        navigationType={navigationType}
        {...props}
      />
    );
  };
  ComponentWithRouter.displayName = `withRouter(${WrappedComponent.displayName || WrappedComponent.name || 'Component'})`;
  // Like react-router 5's withRouter, expose the innermost component, which
  // connect() also exposes, so tests can render it without the store.
  ComponentWithRouter.WrappedComponent =
    WrappedComponent.WrappedComponent || WrappedComponent;
  return ComponentWithRouter;
}
