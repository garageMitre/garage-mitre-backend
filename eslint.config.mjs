// Flat config — ESLint 9 ya no lee .eslintrc.js. Es la migración de ese archivo,
// manteniendo las mismas reglas que tenía el proyecto.
import tseslint from '@typescript-eslint/eslint-plugin';
import tsparser from '@typescript-eslint/parser';
import prettier from 'eslint-plugin-prettier';
import prettierConfig from 'eslint-config-prettier';

export default [
  {
    ignores: ['dist/**', 'node_modules/**', 'coverage/**', 'eslint.config.mjs'],
  },
  {
    files: ['**/*.ts'],
    languageOptions: {
      parser: tsparser,
      parserOptions: {
        sourceType: 'module',
      },
    },
    plugins: {
      '@typescript-eslint': tseslint,
      prettier,
    },
    rules: {
      ...tseslint.configs.recommended.rules,
      ...prettierConfig.rules,

      // El formato no bloquea el CI: se arregla con `pnpm format`, no es un bug.
      'prettier/prettier': 'warn',

      // Hay ~94 imports y variables sin usar heredados. Son ruido real que
      // conviene limpiar, pero no deberían frenar un deploy: quedan como
      // warning hasta que se saquen. Pasar a 'error' cuando el contador esté
      // en cero para que no vuelvan a entrar.
      '@typescript-eslint/no-unused-vars': 'warn',

      // Mismas excepciones que tenía .eslintrc.js — el proyecto no fuerza
      // tipado estricto.
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/explicit-module-boundary-types': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
];
