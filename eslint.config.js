import js from "@eslint/js";
import prettier from "eslint-config-prettier";

export default [
  js.configs.recommended,
  prettier,
  {
    files: ["src/**/*.js", "scripts/**/*.mjs"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: {
        console: "readonly",
        URL: "readonly",
        Response: "readonly",
        Headers: "readonly",
        Request: "readonly",
        fetch: "readonly",
        crypto: "readonly",
        TextEncoder: "readonly",
        TextDecoder: "readonly",
        AbortController: "readonly",
        AbortSignal: "readonly",
        structuredClone: "readonly",
        atob: "readonly",
        btoa: "readonly",
        setTimeout: "readonly",
        setInterval: "readonly",
        clearTimeout: "readonly",
        clearInterval: "readonly",
        queueMicrotask: "readonly"
      }
    },
    rules: {
      "no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }
      ],
      "no-prototype-builtins": "error",
      "no-template-curly-in-string": "error",
      eqeqeq: "error",
      "no-eval": "error",
      "no-implied-eval": "error",
      "consistent-return": "error",
      curly: "error",
      "prefer-promise-reject-errors": "error",
      "prefer-const": "error",
      "no-var": "error",
      "object-shorthand": "error",
      "prefer-arrow-callback": "error",
      "prefer-template": "error"
    }
  },
  {
    files: ["tests/**/*.js"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: {
        console: "readonly",
        describe: "readonly",
        it: "readonly",
        expect: "readonly",
        beforeEach: "readonly",
        afterEach: "readonly",
        beforeAll: "readonly",
        afterAll: "readonly",
        vi: "readonly",
        URL: "readonly",
        Response: "readonly",
        Headers: "readonly",
        Request: "readonly",
        fetch: "readonly",
        crypto: "readonly",
        TextEncoder: "readonly",
        TextDecoder: "readonly",
        structuredClone: "readonly",
        setTimeout: "readonly"
      }
    },
    rules: {
      "no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }
      ],
      "no-prototype-builtins": "error",
      "no-template-curly-in-string": "error",
      eqeqeq: "error",
      "no-eval": "error",
      "no-implied-eval": "error",
      curly: "error",
      "prefer-const": "error",
      "no-var": "error",
      "object-shorthand": "error",
      "prefer-arrow-callback": "error",
      "prefer-template": "error"
    }
  },
  {
    ignores: [
      "node_modules/",
      "dist/",
      "coverage/",
      ".wrangler/",
      "src/templates/compiled/"
    ]
  }
];
