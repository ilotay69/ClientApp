/** Geometry shared by the menu renderer and its tests. Coordinates are CSS pixels. */
export function branchGeometry(count: number) {
  const rows = Math.max(0, Math.floor(count));
  const rowHeight = 40;
  const padding = 4;
  const trunkX = 10;
  const radius = 9;
  const endX = 28;
  const branches = Array.from({ length: rows }, (_, index) => {
    const y = padding + index * rowHeight + rowHeight / 2;
    const turn = `Q ${trunkX} ${y} ${trunkX + radius} ${y} H ${endX}`;
    return {
      curve: `M ${trunkX} ${y - radius} ${turn}`,
      reach: `M ${trunkX} 0 V ${y - radius} ${turn}`,
    };
  });
  return {
    height: rows * rowHeight + padding * 2,
    trunk: rows
      ? `M ${trunkX} 0 V ${padding + (rows - 1) * rowHeight + rowHeight / 2 - radius}`
      : "",
    branches,
  };
}
