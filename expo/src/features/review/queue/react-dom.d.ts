// The app uses React DOM's web portal API without a separate types package.
declare module 'react-dom' {
  import type { ReactNode, ReactPortal, Key } from 'react';
  export function createPortal(
    children: ReactNode,
    container: Element | DocumentFragment,
    key?: Key | null,
  ): ReactPortal;
}
