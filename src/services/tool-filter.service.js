export function filterToolsByModule(tools, module) {
  return tools.filter(tool => {
    const desc = tool.description?.toLowerCase() || "";

    // Reporting and Knowledge should only get their own tools
    if (module == "reporting" || module == "knowledge") {
      return desc.includes(`[module:${module}]`);
    }

    // Other modules get module-specific + shared tools
    return (
      desc.includes(`[module:${module}]`) ||
      desc.includes(`[module:shared]`)
    );
  });
}