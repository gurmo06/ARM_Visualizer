export const MEMORY_SIZE_BYTES = 64 * 1024;
export const MEMORY_LOW_ADDRESS = 0n;
export const MEMORY_HIGH_ADDRESS = BigInt(MEMORY_SIZE_BYTES - 1);
export const INITIAL_STACK_POINTER = 0xFFF0n;
export const STACK_WINDOW_BYTES = 128;
