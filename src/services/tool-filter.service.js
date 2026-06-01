export function filterToolsByModule(tools, module) {
  return tools.filter((x) =>
    x.description?.toLowerCase().includes(`[module:${module}]`),
  );
}
