import { ScrollViewStyleReset, useServerDocumentContext } from 'expo-router/html';
import type { PropsWithChildren } from 'react';

// Only the color preference is read here. The public HTML contains no account state.
const themeScript = `(function(){var t='dark';try{if(localStorage.getItem('clearpath-theme')==='light')t='light'}catch(e){console.warn('Could not read color mode preference.',e)}document.documentElement.dataset.theme=t})();`;

export default function Html({ children }: PropsWithChildren) {
  const { headNodes, bodyNodes, htmlAttributes, bodyAttributes } = useServerDocumentContext();
  return (
    <html lang="en" {...htmlAttributes} data-theme="dark" suppressHydrationWarning>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" href="/favicon.ico" sizes="any" />
        <ScrollViewStyleReset />
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
        {headNodes}
      </head>
      <body {...bodyAttributes}>
        {children}
        {bodyNodes}
      </body>
    </html>
  );
}
