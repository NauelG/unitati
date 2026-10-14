import { cleanup } from '@testing-library/svelte';
import { afterEach } from 'vitest';

// Vitest globals are off, so Testing Library cannot register its own cleanup.
afterEach(() => cleanup());
