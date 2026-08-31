const DIRECT_SCOPE_NAMES = Object.freeze([
  "dependencies",
  "devDependencies",
  "optionalDependencies",
  "peerDependencies",
  "configDependencies",
  "packageManagerDependencies",
]);

const SEMVER_LIKE_PATTERN =
  /^[0-9]+\.[0-9]+\.[0-9]+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;
const PACKAGE_PART_PATTERN = /^[A-Za-z0-9._~-]+$/;

export { DIRECT_SCOPE_NAMES };

export class InventoryContractError extends Error {
  constructor(code, detail) {
    super(`${code}: ${detail}`);
    this.name = "InventoryContractError";
    this.code = code;
  }
}

export function parsePnpmLockInventory(lockText, options = {}) {
  const source = options.source ?? "pnpm-lock.yaml";
  const expectedLockfileVersion = options.expectedLockfileVersion ?? "9.0";
  if (typeof source !== "string" || source.length === 0) {
    throw contractError("INVALID_SOURCE", "source must be a non-empty string");
  }
  if (
    typeof expectedLockfileVersion !== "string" ||
    expectedLockfileVersion.length === 0
  ) {
    throw contractError(
      "INVALID_LOCKFILE_VERSION_POLICY",
      "expectedLockfileVersion must be a non-empty string",
    );
  }

  const splitDocuments = splitYamlDocuments(lockText, source);
  const documents = splitDocuments.map((lines, index) =>
    parseDocument(lines, source, index + 1, expectedLockfileVersion),
  );
  const packages = documents.flatMap((document) => document.packages);
  const directDependencies = documents.flatMap(
    (document) => document.directDependencies,
  );
  const scopeCounts = emptyScopeCounts();

  for (const document of documents) {
    for (const [scope, count] of Object.entries(document.scopeCounts)) {
      scopeCounts[scope] += count;
    }
  }

  return {
    source,
    expectedLockfileVersion,
    lockfileVersions: documents.map(({ lockfileVersion }) => lockfileVersion),
    documentCount: documents.length,
    documents,
    packages,
    packageCount: packages.length,
    directDependencies,
    scopeCounts,
  };
}

export function parsePnpmPackageKey(packageKey, context = "package key") {
  if (typeof packageKey !== "string" || packageKey.length === 0) {
    throw contractError(
      "MALFORMED_PACKAGE_KEY",
      `${context} must be a non-empty string`,
    );
  }

  const delimiterIndex = packageDelimiterIndex(packageKey);
  if (delimiterIndex <= 0 || delimiterIndex === packageKey.length - 1) {
    throw contractError(
      "MALFORMED_PACKAGE_KEY",
      `${context} is not an npm name/version locator: ${JSON.stringify(packageKey)}`,
    );
  }

  const name = packageKey.slice(0, delimiterIndex);
  const versionWithPeers = packageKey.slice(delimiterIndex + 1);
  validateNpmPackageName(name, context);

  const peerStart = versionWithPeers.indexOf("(");
  const version =
    peerStart === -1 ? versionWithPeers : versionWithPeers.slice(0, peerStart);
  const peerSuffix = peerStart === -1 ? "" : versionWithPeers.slice(peerStart);

  validateVersion(version, context);
  if (peerSuffix !== "") validatePeerSuffix(peerSuffix, context);

  return {
    rawKey: packageKey,
    name,
    version,
    peerSuffix,
    normalizedKey: `${name}@${version}`,
  };
}

export function assertOsvSourceInventoryParity(expectedSources, osvResult) {
  const expected = normalizeExpectedSources(expectedSources);
  const actual = normalizeOsvSources(osvResult);
  const expectedNames = [...expected.keys()].sort();
  const actualNames = [...actual.keys()].sort();
  const missingSources = expectedNames.filter((source) => !actual.has(source));
  const extraSources = actualNames.filter((source) => !expected.has(source));

  if (missingSources.length > 0 || extraSources.length > 0) {
    throw contractError(
      "OSV_SOURCE_MISMATCH",
      `missing sources ${formatStringList(missingSources)}; extra sources ${formatStringList(extraSources)}`,
    );
  }

  for (const source of expectedNames) {
    const expectedInventory = toMultiset(expected.get(source));
    const actualInventory = toMultiset(actual.get(source));
    const missingPackages = multisetDifference(
      expectedInventory,
      actualInventory,
    );
    const extraPackages = multisetDifference(
      actualInventory,
      expectedInventory,
    );

    if (missingPackages.length > 0 || extraPackages.length > 0) {
      throw contractError(
        "OSV_INVENTORY_MISMATCH",
        `source ${JSON.stringify(source)} missing ${formatStringList(missingPackages)}; extra ${formatStringList(extraPackages)}`,
      );
    }
  }

  return true;
}

function splitYamlDocuments(lockText, source) {
  if (typeof lockText !== "string") {
    throw contractError(
      "INVALID_LOCKFILE",
      "lockfile content must be a string",
    );
  }
  if (lockText.length === 0 || lockText.trim().length === 0) {
    throw contractError("EMPTY_LOCKFILE", `${JSON.stringify(source)} is empty`);
  }
  if (lockText.includes("\u0000")) {
    throw contractError(
      "INVALID_LOCKFILE",
      `${JSON.stringify(source)} contains a NUL byte`,
    );
  }

  const normalizedText = lockText.replaceAll("\r\n", "\n");
  if (normalizedText.includes("\r")) {
    throw contractError(
      "INVALID_NEWLINE",
      `${JSON.stringify(source)} contains a bare carriage return`,
    );
  }

  const sourceLines = normalizedText.split("\n");
  const documents = [];
  const documentBodies = new Set();
  let current = [];
  let sawSeparator = false;

  for (const [index, text] of sourceLines.entries()) {
    const lineNumber = index + 1;
    if (text.trim() === "---" && text !== "---") {
      throw contractError(
        "MALFORMED_DOCUMENT_SEPARATOR",
        `${JSON.stringify(source)} line ${lineNumber} must contain exactly ---`,
      );
    }
    if (text !== "---") {
      current.push({ lineNumber, text });
      continue;
    }

    if (documents.length === 0 && !sawSeparator && current.length === 0) {
      sawSeparator = true;
      continue;
    }

    finalizeDocument(current, documents, documentBodies, source, lineNumber);
    current = [];
    sawSeparator = true;
  }

  finalizeDocument(
    current,
    documents,
    documentBodies,
    source,
    sourceLines.length + 1,
  );
  return documents;
}

function finalizeDocument(
  lines,
  documents,
  documentBodies,
  source,
  boundaryLine,
) {
  const trimmed = trimBlankLines(lines);
  if (trimmed.length === 0) {
    throw contractError(
      "EMPTY_DOCUMENT",
      `${JSON.stringify(source)} has an empty YAML document before line ${boundaryLine}`,
    );
  }

  const body = trimmed.map(({ text }) => text).join("\n");
  if (documentBodies.has(body)) {
    throw contractError(
      "DUPLICATE_DOCUMENT",
      `${JSON.stringify(source)} repeats an identical YAML document before line ${boundaryLine}`,
    );
  }
  documentBodies.add(body);
  documents.push(trimmed);
}

function trimBlankLines(lines) {
  let start = 0;
  let end = lines.length;
  while (start < end && lines[start].text.trim() === "") start += 1;
  while (end > start && lines[end - 1].text.trim() === "") end -= 1;
  return lines.slice(start, end);
}

function parseDocument(lines, source, documentNumber, expectedLockfileVersion) {
  const documentSource = `${source}#document-${documentNumber}`;
  const text = `${lines.map((line) => line.text).join("\n")}\n`;
  const sections = parseTopLevelSections(lines, documentSource);
  const versionEntry = sections.find(({ key }) => key === "lockfileVersion");
  if (!versionEntry) {
    throw contractError(
      "MISSING_LOCKFILE_VERSION",
      `${JSON.stringify(documentSource)} has no top-level lockfileVersion`,
    );
  }
  const lockfileVersion = parseScalarString(
    versionEntry.value,
    `${documentSource} line ${versionEntry.lineNumber}`,
  );
  if (lockfileVersion !== expectedLockfileVersion) {
    throw contractError(
      "LOCKFILE_VERSION_MISMATCH",
      `${JSON.stringify(documentSource)} lockfileVersion ${JSON.stringify(lockfileVersion)} does not match expected ${JSON.stringify(expectedLockfileVersion)}`,
    );
  }
  const packageSection = sections.find(({ key }) => key === "packages");
  if (!packageSection) {
    throw contractError(
      "MISSING_PACKAGES",
      `${JSON.stringify(documentSource)} has no top-level packages section`,
    );
  }
  if (packageSection.value !== "") {
    throw contractError(
      "EMPTY_PACKAGES",
      `${JSON.stringify(documentSource)} packages must be a non-empty block mapping`,
    );
  }

  const packages = parsePackageSection(
    lines,
    sections,
    packageSection,
    documentSource,
    documentNumber,
  );
  const importerSection = sections.find(({ key }) => key === "importers");
  const importerInventory = importerSection
    ? parseImporterSection(
        lines,
        sections,
        importerSection,
        documentSource,
        documentNumber,
      )
    : { directDependencies: [], scopeCounts: emptyScopeCounts() };

  return {
    source: documentSource,
    documentNumber,
    text,
    lockfileVersion,
    packageCount: packages.length,
    packages,
    directDependencies: importerInventory.directDependencies,
    scopeCounts: importerInventory.scopeCounts,
  };
}

function parseTopLevelSections(lines, documentSource) {
  const sections = [];
  const seenKeys = new Map();

  for (const [index, line] of lines.entries()) {
    rejectTabIndentation(line, documentSource);
    if (isBlankOrComment(line.text)) continue;

    const indent = leadingSpaces(line.text);
    if (indent % 2 !== 0) {
      throw contractError(
        "MALFORMED_INDENTATION",
        `${JSON.stringify(documentSource)} line ${line.lineNumber} uses odd indentation`,
      );
    }
    if (indent !== 0) continue;

    const entry = parseMappingEntry(
      line.text,
      `${documentSource} line ${line.lineNumber}`,
    );
    if (seenKeys.has(entry.key)) {
      throw contractError(
        "DUPLICATE_TOP_LEVEL_KEY",
        `${JSON.stringify(documentSource)} repeats top-level key ${JSON.stringify(entry.key)} at lines ${seenKeys.get(entry.key)} and ${line.lineNumber}`,
      );
    }
    seenKeys.set(entry.key, line.lineNumber);
    sections.push({ ...entry, index, lineNumber: line.lineNumber });
  }

  return sections;
}

function parsePackageSection(
  lines,
  sections,
  section,
  documentSource,
  documentNumber,
) {
  const end = nextSectionIndex(sections, section, lines.length);
  const packages = [];
  const physicalKeys = new Map();

  for (let index = section.index + 1; index < end; index += 1) {
    const line = lines[index];
    if (isBlankOrComment(line.text)) continue;
    const indent = leadingSpaces(line.text);
    if (indent < 2 || indent % 2 !== 0) {
      throw contractError(
        "MALFORMED_PACKAGE_INDENTATION",
        `${JSON.stringify(documentSource)} line ${line.lineNumber} is not a valid packages entry`,
      );
    }
    if (indent > 2) continue;

    const entry = parseMappingEntry(
      line.text.slice(2),
      `${documentSource} line ${line.lineNumber}`,
    );
    if (entry.value !== "") {
      throw contractError(
        "MALFORMED_PACKAGE_ENTRY",
        `${JSON.stringify(documentSource)} line ${line.lineNumber} package entry must be a block mapping`,
      );
    }
    if (physicalKeys.has(entry.key)) {
      throw contractError(
        "DUPLICATE_PACKAGE_ENTRY",
        `${JSON.stringify(documentSource)} repeats package key ${JSON.stringify(entry.key)} at lines ${physicalKeys.get(entry.key)} and ${line.lineNumber}`,
      );
    }
    physicalKeys.set(entry.key, line.lineNumber);

    const parsed = parsePnpmPackageKey(
      entry.key,
      `${documentSource} line ${line.lineNumber}`,
    );
    packages.push({
      source: documentSource,
      documentNumber,
      lineNumber: line.lineNumber,
      ...parsed,
    });
  }

  if (packages.length === 0) {
    throw contractError(
      "EMPTY_PACKAGES",
      `${JSON.stringify(documentSource)} packages section has no physical entries`,
    );
  }
  return packages;
}

function parseImporterSection(
  lines,
  sections,
  section,
  documentSource,
  documentNumber,
) {
  if (section.value === "{}") {
    assertSectionHasNoContent(
      lines,
      sections,
      section,
      documentSource,
      "inline-empty importers",
    );
    return { directDependencies: [], scopeCounts: emptyScopeCounts() };
  }
  if (section.value !== "") {
    throw contractError(
      "MALFORMED_IMPORTERS",
      `${JSON.stringify(documentSource)} importers must be a block mapping or {}`,
    );
  }

  const end = nextSectionIndex(sections, section, lines.length);
  const directDependencies = [];
  const scopeCounts = emptyScopeCounts();
  const seenImporters = new Map();
  let importer = null;
  let declaredSection = null;
  let scope = null;
  let seenSections = null;
  let seenDependencies = null;
  let importerAllowsChildren = false;
  let sectionAllowsChildren = false;
  let dependencyAllowsChildren = false;
  let currentDependency = null;

  for (let index = section.index + 1; index < end; index += 1) {
    const line = lines[index];
    if (isBlankOrComment(line.text)) continue;
    const indent = leadingSpaces(line.text);
    if (indent < 2 || indent % 2 !== 0) {
      throw contractError(
        "MALFORMED_IMPORTER_INDENTATION",
        `${JSON.stringify(documentSource)} line ${line.lineNumber} is not a valid importer entry`,
      );
    }

    if (indent === 2) {
      const entry = parseMappingEntry(
        line.text.slice(2),
        `${documentSource} line ${line.lineNumber}`,
      );
      if (entry.value !== "" && entry.value !== "{}") {
        throw contractError(
          "MALFORMED_IMPORTER",
          `${JSON.stringify(documentSource)} line ${line.lineNumber} importer must be a block mapping or {}`,
        );
      }
      if (seenImporters.has(entry.key)) {
        throw contractError(
          "DUPLICATE_IMPORTER",
          `${JSON.stringify(documentSource)} repeats importer ${JSON.stringify(entry.key)} at lines ${seenImporters.get(entry.key)} and ${line.lineNumber}`,
        );
      }
      seenImporters.set(entry.key, line.lineNumber);
      importer = entry.key;
      declaredSection = null;
      scope = null;
      seenSections = new Map();
      seenDependencies = new Map();
      importerAllowsChildren = entry.value === "";
      sectionAllowsChildren = false;
      dependencyAllowsChildren = false;
      currentDependency = null;
      continue;
    }

    if (!importer) {
      throw contractError(
        "MALFORMED_IMPORTERS",
        `${JSON.stringify(documentSource)} line ${line.lineNumber} appears before an importer key`,
      );
    }
    if (!importerAllowsChildren) {
      throw contractError(
        "MALFORMED_IMPORTER",
        `${JSON.stringify(documentSource)} line ${line.lineNumber} is nested under inline-empty importer ${JSON.stringify(importer)}`,
      );
    }

    if (indent === 4) {
      const entry = parseMappingEntry(
        line.text.slice(4),
        `${documentSource} line ${line.lineNumber}`,
      );
      if (entry.value !== "" && entry.value !== "{}") {
        throw contractError(
          "MALFORMED_IMPORTER_SCOPE",
          `${JSON.stringify(documentSource)} line ${line.lineNumber} importer section must be a block mapping or {}`,
        );
      }
      if (seenSections.has(entry.key)) {
        throw contractError(
          "DUPLICATE_IMPORTER_SCOPE",
          `${JSON.stringify(documentSource)} importer ${JSON.stringify(importer)} repeats section ${JSON.stringify(entry.key)} at lines ${seenSections.get(entry.key)} and ${line.lineNumber}`,
        );
      }
      seenSections.set(entry.key, line.lineNumber);
      declaredSection = entry.key;
      scope = DIRECT_SCOPE_NAMES.includes(entry.key) ? entry.key : "unknown";
      sectionAllowsChildren = entry.value === "";
      dependencyAllowsChildren = false;
      currentDependency = null;
      continue;
    }

    if (indent === 6) {
      if (!declaredSection || !scope) {
        throw contractError(
          "MALFORMED_IMPORTER_DEPENDENCY",
          `${JSON.stringify(documentSource)} line ${line.lineNumber} appears before an importer section`,
        );
      }
      if (!sectionAllowsChildren) {
        throw contractError(
          "MALFORMED_IMPORTER_SCOPE",
          `${JSON.stringify(documentSource)} line ${line.lineNumber} is nested under inline-empty section ${JSON.stringify(declaredSection)}`,
        );
      }
      const entry = parseMappingEntry(
        line.text.slice(6),
        `${documentSource} line ${line.lineNumber}`,
      );
      validateNpmPackageName(
        entry.key,
        `${documentSource} line ${line.lineNumber}`,
      );
      const duplicateKey = `${declaredSection}\u0000${entry.key}`;
      if (seenDependencies.has(duplicateKey)) {
        throw contractError(
          "DUPLICATE_IMPORTER_DEPENDENCY",
          `${JSON.stringify(documentSource)} importer ${JSON.stringify(importer)} repeats dependency ${JSON.stringify(entry.key)} in ${JSON.stringify(declaredSection)} at lines ${seenDependencies.get(duplicateKey)} and ${line.lineNumber}`,
        );
      }
      seenDependencies.set(duplicateKey, line.lineNumber);
      scopeCounts[scope] += 1;
      directDependencies.push({
        source: documentSource,
        documentNumber,
        lineNumber: line.lineNumber,
        importer,
        section: declaredSection,
        scope,
        name: entry.key,
      });
      currentDependency = entry.key;
      dependencyAllowsChildren = entry.value === "";
      continue;
    }

    if (!currentDependency) {
      throw contractError(
        "MALFORMED_IMPORTER_DEPENDENCY",
        `${JSON.stringify(documentSource)} line ${line.lineNumber} appears before a direct dependency`,
      );
    }
    if (!dependencyAllowsChildren) {
      throw contractError(
        "MALFORMED_IMPORTER_DEPENDENCY",
        `${JSON.stringify(documentSource)} line ${line.lineNumber} is nested under scalar dependency ${JSON.stringify(currentDependency)}`,
      );
    }
  }

  return { directDependencies, scopeCounts };
}

function parseMappingEntry(text, context) {
  if (text.length === 0) {
    throw contractError("MALFORMED_MAPPING", `${context} has an empty key`);
  }

  let key;
  let remainder;
  if (text.startsWith("'")) {
    ({ key, remainder } = parseSingleQuotedKey(text, context));
  } else if (text.startsWith('"')) {
    ({ key, remainder } = parseDoubleQuotedKey(text, context));
  } else {
    const colonIndex = text.indexOf(":");
    if (colonIndex <= 0) {
      throw contractError(
        "MALFORMED_MAPPING",
        `${context} is not a YAML mapping entry`,
      );
    }
    key = text.slice(0, colonIndex);
    remainder = text.slice(colonIndex);
    if (key !== key.trim() || /[\s#[\]{},]/u.test(key)) {
      throw contractError(
        "MALFORMED_MAPPING",
        `${context} has an unsupported unquoted key`,
      );
    }
  }

  if (!remainder.startsWith(":")) {
    throw contractError(
      "MALFORMED_MAPPING",
      `${context} is not a YAML mapping entry`,
    );
  }
  const value = remainder.slice(1).trim();
  if (value.startsWith("#")) {
    return { key, value: "" };
  }
  return { key, value };
}

function parseSingleQuotedKey(text, context) {
  let key = "";
  for (let index = 1; index < text.length; index += 1) {
    if (text[index] !== "'") {
      key += text[index];
      continue;
    }
    if (text[index + 1] === "'") {
      key += "'";
      index += 1;
      continue;
    }
    return { key, remainder: text.slice(index + 1) };
  }
  throw contractError(
    "MALFORMED_MAPPING",
    `${context} has an unterminated single-quoted key`,
  );
}

function parseDoubleQuotedKey(text, context) {
  let escaped = false;
  for (let index = 1; index < text.length; index += 1) {
    if (escaped) {
      escaped = false;
      continue;
    }
    if (text[index] === "\\") {
      escaped = true;
      continue;
    }
    if (text[index] !== '"') continue;

    let key;
    try {
      key = JSON.parse(text.slice(0, index + 1));
    } catch {
      throw contractError(
        "MALFORMED_MAPPING",
        `${context} has an invalid double-quoted key`,
      );
    }
    return { key, remainder: text.slice(index + 1) };
  }
  throw contractError(
    "MALFORMED_MAPPING",
    `${context} has an unterminated double-quoted key`,
  );
}

function parseScalarString(value, context) {
  if (value.length === 0) {
    throw contractError(
      "MALFORMED_SCALAR",
      `${context} must have a scalar value`,
    );
  }
  if (value.startsWith("'")) {
    if (!value.endsWith("'") || value.length < 2) {
      throw contractError(
        "MALFORMED_SCALAR",
        `${context} has an invalid single-quoted scalar`,
      );
    }
    return value.slice(1, -1).replaceAll("''", "'");
  }
  if (value.startsWith('"')) {
    let parsed;
    try {
      parsed = JSON.parse(value);
    } catch {
      throw contractError(
        "MALFORMED_SCALAR",
        `${context} has an invalid double-quoted scalar`,
      );
    }
    if (typeof parsed !== "string") {
      throw contractError(
        "MALFORMED_SCALAR",
        `${context} scalar must decode to a string`,
      );
    }
    return parsed;
  }
  if (/\s|#/u.test(value)) {
    throw contractError(
      "MALFORMED_SCALAR",
      `${context} has an unsupported unquoted scalar`,
    );
  }
  return value;
}

function packageDelimiterIndex(packageKey) {
  if (!packageKey.startsWith("@")) return packageKey.indexOf("@");
  const slashIndex = packageKey.indexOf("/");
  if (slashIndex <= 1) return -1;
  return packageKey.indexOf("@", slashIndex + 1);
}

function validateNpmPackageName(name, context) {
  if (name.startsWith("@")) {
    const slashIndex = name.indexOf("/");
    const scope = name.slice(1, slashIndex);
    const packageName = name.slice(slashIndex + 1);
    if (
      slashIndex <= 1 ||
      name.indexOf("/", slashIndex + 1) !== -1 ||
      !PACKAGE_PART_PATTERN.test(scope) ||
      !PACKAGE_PART_PATTERN.test(packageName)
    ) {
      throw contractError(
        "MALFORMED_PACKAGE_NAME",
        `${context} has invalid scoped npm package name ${JSON.stringify(name)}`,
      );
    }
    return;
  }

  if (
    name.includes("@") ||
    name.includes("/") ||
    !PACKAGE_PART_PATTERN.test(name)
  ) {
    throw contractError(
      "MALFORMED_PACKAGE_NAME",
      `${context} has invalid npm package name ${JSON.stringify(name)}`,
    );
  }
}

function validateVersion(version, context) {
  if (!SEMVER_LIKE_PATTERN.test(version)) {
    throw contractError(
      "MALFORMED_PACKAGE_VERSION",
      `${context} has unsupported npm version ${JSON.stringify(version)}`,
    );
  }
}

function validatePeerSuffix(peerSuffix, context) {
  let depth = 0;
  let groupContentLength = 0;

  for (const character of peerSuffix) {
    if (depth === 0 && character !== "(") {
      throw contractError(
        "MALFORMED_PEER_SUFFIX",
        `${context} has invalid peer suffix ${JSON.stringify(peerSuffix)}`,
      );
    }
    if (character === "(") {
      depth += 1;
      if (depth === 1) groupContentLength = 0;
      continue;
    }
    if (character === ")") {
      depth -= 1;
      if (depth < 0 || (depth === 0 && groupContentLength === 0)) {
        throw contractError(
          "MALFORMED_PEER_SUFFIX",
          `${context} has invalid peer suffix ${JSON.stringify(peerSuffix)}`,
        );
      }
      continue;
    }
    if (/\s/u.test(character)) {
      throw contractError(
        "MALFORMED_PEER_SUFFIX",
        `${context} has invalid peer suffix ${JSON.stringify(peerSuffix)}`,
      );
    }
    if (depth > 0) groupContentLength += 1;
  }

  if (depth !== 0) {
    throw contractError(
      "MALFORMED_PEER_SUFFIX",
      `${context} has unbalanced peer suffix ${JSON.stringify(peerSuffix)}`,
    );
  }
}

function normalizeExpectedSources(expectedSources) {
  if (!Array.isArray(expectedSources) || expectedSources.length === 0) {
    throw contractError(
      "INVALID_EXPECTED_SOURCES",
      "expectedSources must be a non-empty array",
    );
  }
  const normalized = new Map();
  for (const [index, expectedSource] of expectedSources.entries()) {
    const source = expectedSource?.source;
    if (typeof source !== "string" || source.length === 0) {
      throw contractError(
        "INVALID_EXPECTED_SOURCE",
        `expectedSources[${index}].source must be a non-empty string`,
      );
    }
    if (normalized.has(source)) {
      throw contractError(
        "DUPLICATE_EXPECTED_SOURCE",
        `expected source ${JSON.stringify(source)} appears more than once`,
      );
    }
    if (!Array.isArray(expectedSource.packages)) {
      throw contractError(
        "INVALID_EXPECTED_SOURCE",
        `expected source ${JSON.stringify(source)} packages must be an array`,
      );
    }
    normalized.set(
      source,
      expectedSource.packages.map((pkg, packageIndex) =>
        normalizeInventoryPackage(
          pkg,
          `expected source ${JSON.stringify(source)} package ${packageIndex}`,
        ),
      ),
    );
  }
  return normalized;
}

function normalizeOsvSources(osvResult) {
  if (!osvResult || !Array.isArray(osvResult.results)) {
    throw contractError(
      "INVALID_OSV_RESULT",
      "OSV result must contain a results array",
    );
  }

  const normalized = new Map();
  for (const [index, result] of osvResult.results.entries()) {
    const source = result?.source?.path;
    if (typeof source !== "string" || source.length === 0) {
      throw contractError(
        "INVALID_OSV_SOURCE",
        `OSV result ${index} source.path must be a non-empty string`,
      );
    }
    if (normalized.has(source)) {
      throw contractError(
        "DUPLICATE_OSV_SOURCE",
        `OSV source ${JSON.stringify(source)} appears more than once`,
      );
    }
    if (!Array.isArray(result.packages)) {
      throw contractError(
        "INVALID_OSV_SOURCE",
        `OSV source ${JSON.stringify(source)} packages must be an array`,
      );
    }

    normalized.set(
      source,
      result.packages.map((entry, packageIndex) => {
        const pkg = entry?.package;
        if (pkg?.ecosystem !== "npm") {
          throw contractError(
            "INVALID_OSV_PACKAGE",
            `OSV source ${JSON.stringify(source)} package ${packageIndex} ecosystem must be npm`,
          );
        }
        return normalizeInventoryPackage(
          pkg,
          `OSV source ${JSON.stringify(source)} package ${packageIndex}`,
        );
      }),
    );
  }
  return normalized;
}

function normalizeInventoryPackage(pkg, context) {
  if (!pkg || typeof pkg.name !== "string" || typeof pkg.version !== "string") {
    throw contractError(
      "INVALID_INVENTORY_PACKAGE",
      `${context} must have string name and version fields`,
    );
  }
  validateNpmPackageName(pkg.name, context);
  const normalized = parsePnpmPackageKey(`${pkg.name}@${pkg.version}`, context);
  return { name: normalized.name, version: normalized.version };
}

function toMultiset(packages) {
  const multiset = new Map();
  for (const pkg of packages) {
    const key = JSON.stringify([pkg.name, pkg.version]);
    multiset.set(key, (multiset.get(key) ?? 0) + 1);
  }
  return multiset;
}

function multisetDifference(left, right) {
  const difference = [];
  for (const key of [...left.keys()].sort()) {
    const count = left.get(key) - (right.get(key) ?? 0);
    if (count <= 0) continue;
    const [name, version] = JSON.parse(key);
    difference.push(`${name}@${version} x${count}`);
  }
  return difference;
}

function emptyScopeCounts() {
  return Object.fromEntries(
    [...DIRECT_SCOPE_NAMES, "unknown"].map((scope) => [scope, 0]),
  );
}

function nextSectionIndex(sections, section, fallback) {
  const position = sections.indexOf(section);
  return sections[position + 1]?.index ?? fallback;
}

function assertSectionHasNoContent(
  lines,
  sections,
  section,
  documentSource,
  description,
) {
  const end = nextSectionIndex(sections, section, lines.length);
  for (let index = section.index + 1; index < end; index += 1) {
    if (isBlankOrComment(lines[index].text)) continue;
    throw contractError(
      "MALFORMED_IMPORTERS",
      `${JSON.stringify(documentSource)} line ${lines[index].lineNumber} is nested under ${description}`,
    );
  }
}

function rejectTabIndentation(line, documentSource) {
  if (/^ *\t/u.test(line.text)) {
    throw contractError(
      "MALFORMED_INDENTATION",
      `${JSON.stringify(documentSource)} line ${line.lineNumber} uses tab indentation`,
    );
  }
}

function leadingSpaces(text) {
  return text.length - text.trimStart().length;
}

function isBlankOrComment(text) {
  const trimmed = text.trim();
  return trimmed === "" || trimmed.startsWith("#");
}

function formatStringList(values) {
  return `[${values.map((value) => JSON.stringify(value)).join(", ")}]`;
}

function contractError(code, detail) {
  return new InventoryContractError(code, detail);
}
