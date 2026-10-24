// Matrix index 0 is the base; indices 1..n are stops. Directed distances are supported.
export function optimizeRoundTrip(matrix: number[][]) {
  const n = matrix.length - 1;
  if (
    n < 1 ||
    n > 60 ||
    matrix.some(
      (row) =>
        row.length !== n + 1 ||
        row.some((value) => !Number.isFinite(value) || value < 0),
    )
  )
    throw Error(
      "La ruta requiere entre 1 y 60 paradas con distancias válidas.",
    );
  const cost = (order: number[]) => {
    let total = 0,
      previous = 0;
    for (const stop of order) {
      total += matrix[previous][stop + 1];
      previous = stop + 1;
    }
    return total + matrix[previous][0];
  };
  let order = Array.from({ length: n }, (_, i) => i);
  const originalDistance = cost(order);
  let best = originalDistance;
  if (n <= 12) {
    const size = 1 << n;
    const costs = new Float64Array(size * n).fill(Infinity);
    const previous = new Int16Array(size * n).fill(-1);
    for (let i = 0; i < n; i++) costs[(1 << i) * n + i] = matrix[0][i + 1];
    for (let mask = 1; mask < size; mask++)
      for (let last = 0; last < n; last++) {
        const current = costs[mask * n + last];
        if (!Number.isFinite(current)) continue;
        for (let next = 0; next < n; next++)
          if (!(mask & (1 << next))) {
            const index = (mask | (1 << next)) * n + next;
            const candidate = current + matrix[last + 1][next + 1];
            if (candidate < costs[index]) {
              costs[index] = candidate;
              previous[index] = last;
            }
          }
      }
    const full = size - 1;
    for (let last = 0; last < n; last++) {
      const candidate = costs[full * n + last] + matrix[last + 1][0];
      if (candidate < best - 1e-8) {
        best = candidate;
        const result: number[] = [];
        let mask = full,
          at = last;
        while (at >= 0) {
          result.push(at);
          const next = previous[mask * n + at];
          mask ^= 1 << at;
          at = next;
        }
        order = result.reverse();
      }
    }
  } else {
    // Multiple starting points avoid a single greedy decision determining the whole route.
    for (const first of Array.from({ length: n }, (_, i) => i)
      .sort((a, b) => matrix[0][a + 1] - matrix[0][b + 1])
      .slice(0, 8)) {
      const remaining = new Set(Array.from({ length: n }, (_, i) => i));
      remaining.delete(first);
      const candidate = [first];
      while (remaining.size) {
        const from = candidate[candidate.length - 1] + 1;
        let next = -1,
          shortest = Infinity;
        for (const i of remaining)
          if (matrix[from][i + 1] < shortest) {
            shortest = matrix[from][i + 1];
            next = i;
          }
        candidate.push(next);
        remaining.delete(next);
      }
      const distance = cost(candidate);
      if (distance < best - 1e-8) {
        order = candidate;
        best = distance;
      }
    }
    // Evaluate full costs so reversing a segment also works for directed road matrices.
    for (let pass = 0; pass < 30; pass++) {
      let improved = false;
      for (let i = 0; i < n - 1; i++)
        for (let j = i + 1; j < n; j++) {
          const candidate = [
            ...order.slice(0, i),
            ...order.slice(i, j + 1).reverse(),
            ...order.slice(j + 1),
          ];
          const distance = cost(candidate);
          if (distance < best - 1e-8) {
            order = candidate;
            best = distance;
            improved = true;
          }
        }
      if (!improved) break;
    }
  }
  return {
    order,
    distance: best,
    originalDistance,
    algorithm: n <= 12 ? ("exact" as const) : ("heuristic" as const),
  };
}
