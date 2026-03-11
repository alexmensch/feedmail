import js from "@eslint/js";
import prettier from "eslint-config-prettier";
import globals from "globals";

const sharedRules = {
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
};

const workersGlobals = {
  ...globals.browser,
  structuredClone: "readonly",
  queueMicrotask: "readonly"
};

export default [
  js.configs.recommended,
  prettier,
  {
    files: ["src/**/*.js", "scripts/**/*.mjs"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: workersGlobals
    },
    rules: {
      ...sharedRules,
      "consistent-return": "error",
      "prefer-promise-reject-errors": "error"
    }
  },
  {
    files: ["tests/**/*.js"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: {
        ...workersGlobals,
        describe: "readonly",
        it: "readonly",
        expect: "readonly",
        beforeEach: "readonly",
        afterEach: "readonly",
        beforeAll: "readonly",
        afterAll: "readonly",
        vi: "readonly"
      }
    },
    rules: sharedRules
  },
  {
    ignores: [
      "node_modules/",
      "dist/",
      "coverage/",
      ".wrangler/",
      "src/templates/compiled/",
      "assets/"
    ]
  }
];
