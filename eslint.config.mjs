// One ESLint config for the whole repo. Type-aware rules use each file's nearest tsconfig
// (expo/tsconfig.json or backend/convex/tsconfig.json). Formatting belongs to Prettier.
import { defineConfig, globalIgnores } from 'eslint/config';
import expoConfig from 'eslint-config-expo/flat.js';
import tseslint from 'typescript-eslint';
import convexPlugin from '@convex-dev/eslint-plugin';
import comments from '@eslint-community/eslint-plugin-eslint-comments/configs';
import globals from 'globals';

export default defineConfig([
  globalIgnores([
    '**/dist/**',
    'expo/public/pdfjs/**',
    '**/.expo/**',
    '**/.wrangler/**',
    'expo/ios/**',
    'expo/android/**',
    'backend/convex/_generated/**',
    '**/expo-env.d.ts',
    '.agents/**',
  ]),
  { linterOptions: { reportUnusedDisableDirectives: 'error', reportUnusedInlineConfigs: 'error' } },
  // Imports, React, React Hooks (including React Compiler rules), and Expo env-var rules.
  { files: ['expo/**'], extends: [expoConfig] },
  tseslint.configs.strictTypeChecked,
  // Scoped by the plugin to **/convex/**/*.ts.
  convexPlugin.configs.recommended,
  comments.recommended,
  {
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    rules: {
      '@typescript-eslint/switch-exhaustiveness-check': [
        'error',
        {
          allowDefaultCaseForExhaustiveSwitch: false,
          considerDefaultExhaustiveForUnions: false,
          requireDefaultForNonUnion: true,
        },
      ],
      '@typescript-eslint/no-unsafe-type-assertion': 'error',
      '@typescript-eslint/consistent-type-assertions': [
        'error',
        {
          assertionStyle: 'as',
          objectLiteralTypeAssertions: 'never',
          arrayLiteralTypeAssertions: 'never',
        },
      ],
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          args: 'after-used',
          argsIgnorePattern: '^_',
          caughtErrors: 'all',
          ignoreRestSiblings: true,
          reportUsedIgnorePattern: true,
          enableAutofixRemoval: { imports: true },
        },
      ],
      '@typescript-eslint/no-empty-function': 'error',
      'no-empty': 'error',
      'no-restricted-syntax': [
        'error',
        {
          selector: 'CatchClause:not([param])',
          message: 'Bind and handle the error instead of swallowing it.',
        },
        {
          selector: "CallExpression[callee.property.name='catch'][arguments.0.params.length=0]",
          message: '.catch() callback ignores the error.',
        },
      ],
      // Trim noise from strictTypeChecked without losing the bug classes it targets.
      '@typescript-eslint/no-misused-promises': [
        'error',
        { checksVoidReturn: { attributes: false } },
      ],
      '@typescript-eslint/no-confusing-void-expression': ['error', { ignoreArrowShorthand: true }],
      '@typescript-eslint/restrict-template-expressions': [
        'error',
        {
          allowNumber: true,
          allowAny: false,
          allowBoolean: false,
          allowNullish: false,
          allowRegExp: false,
          allowNever: false,
        },
      ],
      eqeqeq: ['error', 'smart'],
      'prefer-const': 'error',
      'no-console': ['error', { allow: ['info', 'warn', 'error'] }],
      // Agents tend to silence rules instead of fixing the code.
      '@eslint-community/eslint-comments/require-description': 'error',
      '@eslint-community/eslint-comments/no-restricted-disable': [
        'error',
        '@typescript-eslint/no-explicit-any',
        '@typescript-eslint/no-unsafe-*',
        '@typescript-eslint/no-floating-promises',
        'react-hooks/rules-of-hooks',
      ],
    },
  },
  {
    files: ['expo/**'],
    rules: {
      // TypeScript already resolves imports; these duplicate it slowly.
      'import/no-unresolved': 'off',
      'import/named': 'off',
      'import/namespace': 'off',
      'import/no-named-as-default-member': 'off',
      'react-hooks/exhaustive-deps': 'error',
    },
  },
  // Every public Convex function must start with a require*/check* access check.
  { files: ['backend/convex/**/*.ts'], rules: { '@convex-dev/require-access-control': 'error' } },
  {
    files: ['**/*.{js,mjs,cjs}'],
    extends: [tseslint.configs.disableTypeChecked],
    languageOptions: { globals: globals.node },
    rules: { '@typescript-eslint/no-require-imports': 'off' },
  },
]);
