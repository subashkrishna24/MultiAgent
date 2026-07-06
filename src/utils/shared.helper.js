export function prepareUserDetails(userdetails, session) {
  if (!userdetails) {
    return;
  }
  // Set timezone if missing
  if (!userdetails.timeZone) {
    userdetails.timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  }
  try {
    const now = new Date();
    const hourStr = Intl.DateTimeFormat("en-US", {
      timeZone: userdetails.timeZone,
      hour: "numeric",
      hour12: false,
    }).format(now);
    const hour = parseInt(hourStr, 10);
    const greeting =
      hour < 12
        ? "Good morning"
        : hour < 17
          ? "Good afternoon"
          : "Good evening";

    userdetails.localHour = Number.isFinite(hour) ? hour : null;
    userdetails.greeting = greeting;
  } catch (err) {
    console.error("Error determining user timezone:", err);
    userdetails.localHour = null;
    userdetails.greeting = "Hello";
  }
  session.UserDetails = userdetails;
  return userdetails;
}

export function cleanReportEntry(entry) {
  let rows = [];

  try {
    const parsedOuter =
      typeof entry.data === "string" ? JSON.parse(entry.data) : entry.data;

    const dbdataRaw = parsedOuter?.dbdata;
    const parsedInner =
      typeof dbdataRaw === "string" ? JSON.parse(dbdataRaw) : dbdataRaw;

    if (parsedInner && typeof parsedInner === "object") {
      const tableKey = Object.keys(parsedInner)[0]; // e.g. "Table1"
      rows = Array.isArray(parsedInner[tableKey]) ? parsedInner[tableKey] : [];
    }
  } catch (err) {
    console.error(`Failed to parse dataset "${entry.name}":`, err.message);
    rows = [];
  }

  return {
    name: entry.name,
    rowCount: rows.length,
    rows,
  };
}

export function cleanMergedResults(mergedResults) {
  return mergedResults.map(cleanReportEntry);
}
