export const roundArray = (arr: number[]): number[] =>
  arr.map((n) => Math.round(n * 100) / 100);

export const roundVec3 = (
  v: [number, number, number],
): [number, number, number] => roundArray(v) as [number, number, number];

export const VEC3_EPSILON = 0.001;

export const areVec3sEqual = (
  a: Readonly<[number, number, number]> | undefined,
  b: Readonly<[number, number, number]>,
): boolean => {
  if (!a) {
    return false;
  }

  for (let i = 0; i < 3; i++) {
    const valA = a[i];
    const valB = b[i];

    if (Number.isNaN(valA) && Number.isNaN(valB)) {
      continue;
    }
    if (Number.isNaN(valA) || Number.isNaN(valB)) {
      return false;
    }
    if (Math.abs(valA - valB) >= VEC3_EPSILON) {
      return false;
    }
  }
  return true;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const throttle = <T extends (...args: any[]) => any>(
  func: T,
  limit: number,
): ((
  ...args: Parameters<T>
) => Promise<Awaited<ReturnType<T>> | undefined>) => {
  let lastFunc: NodeJS.Timeout | undefined;
  let lastRan: number | undefined;
  let supersededResolve: ((value: undefined) => void) | undefined;

  return async (
    ...args: Parameters<T>
  ): Promise<Awaited<ReturnType<T>> | undefined> => {
    const execute = async (): Promise<Awaited<ReturnType<T>>> => {
      const result = func(...args);
      return result instanceof Promise ? await result : result;
    };

    if (!lastRan) {
      lastRan = Date.now();
      return execute();
    } else {
      if (lastFunc) {
        clearTimeout(lastFunc);
        // Settle the superseded call's promise; a cleared timer would
        // otherwise leave it pending forever.
        supersededResolve?.(undefined);
      }
      return new Promise((resolve) => {
        supersededResolve = resolve;
        lastFunc = setTimeout(
          async () => {
            supersededResolve = undefined;
            if (Date.now() - (lastRan ?? 0) >= limit) {
              lastRan = Date.now();
              resolve(await execute());
            } else {
              resolve(undefined);
            }
          },
          limit - (Date.now() - (lastRan ?? 0)),
        );
      });
    }
  };
};
