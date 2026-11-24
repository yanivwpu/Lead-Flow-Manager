import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import ts from "typescript";

const langs = ["en", "he", "es"];
const src = "client/src";
const baselinePath = "scripts/localization/baseline.json";
const allowPath = "scripts/localization/allowlist.json";
const update = process.argv.includes("--update-baseline");
const allow = JSON.parse(fs.readFileSync(allowPath, "utf8"));
const problems = [];
const findings = new Map();
const report = (message) => problems.push(message);
const nameOf = (name) => name && (ts.isIdentifier(name) || ts.isStringLiteral(name)) ? name.text : undefined;
const parse = (file) => ts.createSourceFile(file, fs.readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true);

function flatten(object, prefix = "", values = new Map()) {
  for (const [key, value] of Object.entries(object)) {
    const name = prefix + key;
    if (value && typeof value === "object") flatten(value, name + ".", values);
    else values.set(name, value);
  }
  return values;
}

const dictionaries = new Map(langs.map((lang) => {
  const file = `${src}/locales/${lang}.json`;
  const input = fs.readFileSync(file, "utf8");
  const parsed = ts.parseJsonText(file, input);
  function checkObject(node, prefix = "") {
    if (ts.isArrayLiteralExpression(node)) {
      node.elements.forEach((element, index) => checkObject(element, `${prefix}${index}.`));
      return;
    }
    if (!ts.isObjectLiteralExpression(node)) return;
    const keys = new Set();
    for (const prop of node.properties) {
      if (!ts.isPropertyAssignment(prop)) continue;
      const key = nameOf(prop.name);
      if (keys.has(key)) report(`${lang}: duplicate ${prefix}${key}`);
      keys.add(key);
      checkObject(prop.initializer, `${prefix}${key}.`);
    }
  }
  checkObject(parsed.statements[0].expression);
  const values = flatten(JSON.parse(input));
  for (const [key, value] of values) {
    if (typeof value !== "string" || !value.trim()) report(`${lang}: empty or invalid ${key}`);
  }
  return [lang, values];
}));

const en = dictionaries.get("en");
const variables = (value) => [...String(value).matchAll(/{{\s*-?\s*([^},\s]+)[^}]*}}/g)]
  .map((match) => match[1]).sort();
const plural = /_(one|two|many|few|zero|other)$/;
for (const [lang, dict] of dictionaries) {
  for (const [key, english] of en) {
    if (!dict.has(key)) {
      report(`${lang}: missing ${key}`);
      continue;
    }
    const expected = variables(english).filter((name) =>
      !(name === "count" && allow.spelledOutCount.includes(`${lang}:${key}`)));
    if (expected.join() !== variables(dict.get(key)).join()) report(`${lang}: interpolation differs for ${key}`);
  }
  for (const key of dict.keys()) {
    const localizedPlural = plural.test(key) && en.has(key.replace(plural, "_other"));
    if (!en.has(key) && !localizedPlural && !allow.legacyDictionaryKeys.includes(key)) report(`${lang}: unexpected key ${key}`);
    if (localizedPlural && !en.has(key) && variables(dict.get(key)).join() !== variables(en.get(key.replace(plural, "_other"))).join()) {
      report(`${lang}: plural variables differ for ${key}`);
    }
  }
  for (const key of en.keys()) {
    if (!key.endsWith("_other")) continue;
    const base = key.slice(0, -6);
    for (const form of new Intl.PluralRules(lang).resolvedOptions().pluralCategories) {
      if (!dict.has(base + "_" + form)) report(`${lang}: missing plural form ${base}_${form}`);
    }
  }
}

function files(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) return files(file);
    return /\.[jt]sx?$/.test(file) ? [file] : [];
  });
}

function flag(file, kind, value) {
  const hash = createHash("sha256").update(`${kind}\0${value}`).digest("hex").slice(0, 16);
  const previous = findings.get(file)?.get(hash);
  if (!findings.has(file)) findings.set(file, new Map());
  findings.get(file).set(hash, { count: (previous?.count || 0) + 1, kind, value });
}

function inspect(file) {
  const tree = parse(file);
  const constants = new Map();
  const textAttributes = new Set(["title", "description", "placeholder", "aria-label", "aria-description", "alt", "label"]);
  const translators = new Set();
  function collect(node) {
    if (ts.isVariableDeclaration(node) && node.initializer) {
      if (ts.isIdentifier(node.name) && ts.isStringLiteralLike(node.initializer)) {
        const name = node.name.text;
        const value = node.initializer.text;
        constants.set(name, constants.has(name) && constants.get(name) !== value ? undefined : value);
      }
      if (ts.isObjectBindingPattern(node.name) && ts.isCallExpression(node.initializer) &&
          node.initializer.expression.getText(tree) === "useTranslation") {
        for (const entry of node.name.elements) {
          if (nameOf(entry.propertyName || entry.name) === "t") translators.add(entry.name.getText(tree));
        }
      }
    }
    ts.forEachChild(node, collect);
  }
  collect(tree);
  function resolve(node) {
    if (ts.isStringLiteralLike(node)) return node.text;
    if (ts.isIdentifier(node)) return constants.get(node.text);
    if (ts.isTemplateExpression(node)) {
      let value = node.head.text;
      for (const span of node.templateSpans) {
        const part = resolve(span.expression);
        if (part === undefined) return undefined;
        value += part + span.literal.text;
      }
      return value;
    }
    if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken) {
      const left = resolve(node.left);
      const right = resolve(node.right);
      if (left !== undefined && right !== undefined) return left + right;
    }
  }

  function checkText(node) {
    if (!node) return;
    if (ts.isJsxExpression(node)) return checkText(node.expression);
    if (ts.isConditionalExpression(node)) {
      checkText(node.whenTrue);
      checkText(node.whenFalse);
      return;
    }
    if (!ts.isJsxText(node) && !ts.isStringLiteralLike(node) && !ts.isTemplateExpression(node)) return;
    const value = (ts.isTemplateExpression(node)
      ? node.head.text + node.templateSpans.map((span) => span.literal.text).join(" ")
      : node.text).trim().replace(/\s+/g, " ");
    if (/[A-Za-z]{2}/.test(value) && !allow.intentionalText.includes(value)) flag(file, "literal", value);
  }

  function visit(node) {
    if (ts.isJsxText(node) || ts.isJsxExpression(node) && ts.isJsxElement(node.parent)) checkText(node);
    if (ts.isJsxAttribute(node) && textAttributes.has(node.name.getText(tree))) checkText(node.initializer);
    if (ts.isPropertyAssignment(node) && textAttributes.has(nameOf(node.name))) checkText(node.initializer);
    if (ts.isCallExpression(node) && node.arguments.length &&
        (translators.has(node.expression.getText(tree)) || node.expression.getText(tree) === "i18n.t")) {
      const argument = node.arguments[0];
      const key = resolve(argument);
      const expression = argument.getText(tree).replace(/\s+/g, " ");
      const keys = key === undefined ? allow.dynamicKeys[file]?.[expression] : [key];
      if (!keys?.length) flag(file, "dynamic key", expression);
      for (const candidate of keys || []) {
        if (en.has(candidate) || en.has(candidate + "_other")) continue;
        if (key === undefined) report(`${file}: invalid mapped key ${candidate}`);
        else flag(file, "missing key", candidate);
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(tree);
}

for (const file of files(src)) inspect(file);

// Existing shared/public models use several shapes. Check their actual resolved copy against EN.
const { default: checkMaps } = await import("./typed-maps.ts");
for (const problem of checkMaps()) flag("shared/marketing-locale-maps", "missing typed map field", problem);

if (update && !problems.length) {
  const baseline = Object.fromEntries([...findings].sort().map(([file, entries]) => [
    file, Object.fromEntries([...entries].sort().map(([hash, finding]) => [hash, finding.count])),
  ]));
  fs.writeFileSync(baselinePath, "{\n" + Object.entries(baseline).map(([file, items]) =>
    `  ${JSON.stringify(file)}: ${JSON.stringify(items)}`).join(",\n") + "\n}\n");
} else if (!update) {
  const baseline = JSON.parse(fs.readFileSync(baselinePath, "utf8"));
  for (const [file, entries] of findings) for (const [hash, finding] of entries) {
    if (finding.count > (baseline[file]?.[hash] || 0)) report(`${file}: ${finding.kind}: ${finding.value}`);
  }
}
const count = [...findings.values()].reduce((total, values) =>
  total + [...values.values()].reduce((sum, row) => sum + row.count, 0), 0);
if (problems.length) {
  console.error(problems.join("\n"));
  process.exitCode = 1;
} else {
  console.log(`Localization checks passed. ${count} tracked legacy findings in ${findings.size} files.`);
}
