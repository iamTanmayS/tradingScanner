import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Run each test file in a separate worker to isolate shared cache state
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: true,
      },
    },
  },
});

