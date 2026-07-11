export interface RandomSource {
  nextInt(maxExclusive: number): number;
}

/** Predictable finite random source for tests and deterministic simulations. */
export class DeterministicRandomSource implements RandomSource {
  private index = 0;

  constructor(private readonly values: readonly number[]) {}

  nextInt(maxExclusive: number): number {
    if (!Number.isSafeInteger(maxExclusive) || maxExclusive <= 0) {
      throw new RangeError("maxExclusive must be a positive safe integer.");
    }

    if (this.index >= this.values.length) {
      throw new RangeError("Deterministic random sequence is exhausted.");
    }

    const value = this.values[this.index++];
    if (!Number.isSafeInteger(value) || value < 0 || value >= maxExclusive) {
      throw new RangeError(`Deterministic random value must be between 0 and ${maxExclusive - 1}.`);
    }

    return value;
  }
}
