export function filterToolsByModule(
  tools,
  module
) {
  return tools.filter(tool => {

    const desc =
      tool.description?.toLowerCase() || "";

    return (
      desc.includes(`[module:${module}]`) ||
      desc.includes(`[module:shared]`)
    );
  });
}