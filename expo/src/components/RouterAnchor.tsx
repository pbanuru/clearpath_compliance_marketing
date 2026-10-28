import { forwardRef, type ComponentPropsWithoutRef } from 'react';

type Props = ComponentPropsWithoutRef<'a'> & {
  onPress?: ComponentPropsWithoutRef<'a'>['onClick'];
};

// Expo Link's asChild contract supplies native onPress alongside web onClick.
// Keep its web handler and consume the native-only prop at the DOM boundary.
export const RouterAnchor = forwardRef<HTMLAnchorElement, Props>(function RouterAnchor(
  { onPress: _onPress, ...props },
  ref,
) {
  return <a {...props} ref={ref} />;
});
