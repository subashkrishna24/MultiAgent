const SANITIZE_CONTROL_CHARS_REGEX =
  /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

function sanitizeControlCharacters(str) {
  if (typeof str !== "string") return str;
  return str.replace(SANITIZE_CONTROL_CHARS_REGEX, "");
}

function repairStringContents(text) {
  let out = "";
  let inString = false;
  let escape = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];

    if (inString) {
      if (escape) {
        out += ch;
        escape = false;
        continue;
      }

      if (ch === "\\") {
        out += ch;
        escape = true;
        continue;
      }

      if (ch === "\n") {
        out += "\\n";
        continue;
      }
      if (ch === "\r") {
        out += "\\r";
        continue;
      }
      if (ch === "\t") {
        out += "\\t";
        continue;
      }

      if (ch.charCodeAt(0) <= 0x1f) {
        continue;
      }

      if (ch === '"') {
        let j = i + 1;
        while (j < text.length && /\s/.test(text[j])) j++;
        const next = text[j];
        const looksLikeClose =
          next === undefined ||
          next === "," ||
          next === "}" ||
          next === "]" ||
          next === ":";

        if (looksLikeClose) {
          inString = false;
          out += ch;
        } else {
          out += '\\"';
        }
        continue;
      }

      out += ch;
      continue;
    } else {
      if (ch === '"') {
        inString = true;
        out += ch;
        continue;
      }
      out += ch;
    }
  }

  return out;
}

export function extractJSON(text) {
  if (!text) {
    throw new Error("Empty response");
  }

  let cleaned = text
    .replace(/```json/gi, "")
    .replace(/```/g, "")
    .trim();

  cleaned = sanitizeControlCharacters(cleaned);
  cleaned = repairStringContents(cleaned);

  const objectStart = cleaned.indexOf("{");
  const arrayStart = cleaned.indexOf("[");

  let start = -1;
  if (objectStart !== -1 && arrayStart !== -1) {
    start = Math.min(objectStart, arrayStart);
  } else {
    start = objectStart !== -1 ? objectStart : arrayStart;
  }

  if (start === -1) {
    throw new Error("No JSON found");
  }

  let inString = false;
  let escape = false;
  let depth = 0;
  let end = -1;

  for (let i = start; i < cleaned.length; i++) {
    const ch = cleaned[i];

    if (escape) {
      escape = false;
      continue;
    }

    if (ch === "\\") {
      escape = true;
      continue;
    }

    if (ch === '"') {
      inString = !inString;
      continue;
    }

    if (!inString) {
      if (ch === "{" || ch === "[") {
        depth++;
      } else if (ch === "}" || ch === "]") {
        depth--;

        if (depth === 0) {
          end = i;
          break;
        }
      }
    }
  }

  if (end === -1) {
    let repaired = cleaned.substring(start);

    if (inString) {
      repaired += '"';
    }

    const openBraces = (repaired.match(/{/g) || []).length;
    const closeBraces = (repaired.match(/}/g) || []).length;
    const openBrackets = (repaired.match(/\[/g) || []).length;
    const closeBrackets = (repaired.match(/]/g) || []).length;

    for (let i = 0; i < openBrackets - closeBrackets; i++) {
      repaired += "]";
    }

    for (let i = 0; i < openBraces - closeBraces; i++) {
      repaired += "}";
    }

    cleaned = repaired;
  } else {
    cleaned = cleaned.substring(start, end + 1);
  }

  cleaned = cleaned.replace(/,\s*([}\]])/g, "$1");

  try {
    return JSON.parse(cleaned);
  } catch (error) {
    console.error("Failed to parse JSON:", error);
    console.error("Problematic JSON:", cleaned);
    throw new Error(`Failed to parse JSON: ${error.message}`);
  }
}
