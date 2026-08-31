// Each case changes one unique anchor in the exact canonical source.
export const generatorNegativeMutations = [
  {
    name: "reject-duplicate-root-key",
    code: "SOURCE_SEAL_MISMATCH",
    before: "openapi: 3.1.0\ninfo:",
    after: "openapi: 3.1.0\nopenapi: 3.1.0\ninfo:",
  },
  {
    name: "reject-yaml-anchor",
    code: "SOURCE_ANCHOR_FORBIDDEN",
    before: "servers:\n",
    after: "x-fixture-anchor: &defaults value\nservers:\n",
  },
  {
    name: "reject-yaml-alias",
    code: "SOURCE_ALIAS_FORBIDDEN",
    before: "servers:\n",
    after: "x-fixture-alias: *defaults\nservers:\n",
  },
  {
    name: "reject-yaml-merge-key",
    code: "SOURCE_MERGE_FORBIDDEN",
    before: "  contact:\n",
    after: "  <<: {fixture: true}\n  contact:\n",
  },
  {
    name: "reject-custom-yaml-tag",
    code: "SOURCE_TAG_FORBIDDEN",
    before: "  title: HedefOra API",
    after: "  title: !fixture HedefOra API",
  },
  {
    name: "reject-second-yaml-document",
    code: "SOURCE_DOCUMENT_MARKER_FORBIDDEN",
    before: "        - internal_error\n",
    after: "        - internal_error\n---\nfixture: true\n",
  },
  {
    name: "reject-yaml-directive",
    code: "SOURCE_DIRECTIVE_FORBIDDEN",
    before: "openapi: 3.1.0",
    after: "%YAML 1.2\nopenapi: 3.1.0",
  },
  {
    name: "reject-mixed-case-go-extension",
    code: "SOURCE_GO_EXTENSION_FORBIDDEN",
    before: "jsonSchemaDialect: https://json-schema.org/draft/2020-12/schema",
    after:
      "jsonSchemaDialect: https://json-schema.org/draft/2020-12/schema\nX-Go-Type-Import: fixture",
  },
  {
    name: "reject-nested-go-extension",
    code: "SOURCE_GO_EXTENSION_FORBIDDEN",
    before: "    HealthLiveResponse:\n      type: object",
    after:
      "    HealthLiveResponse:\n      x-go-type: fixture\n      type: object",
  },
  {
    name: "reject-unknown-vendor-extension",
    code: "SOURCE_EXTENSION_FORBIDDEN",
    before: "      x-hedefora-rate-limit: health",
    after:
      "      x-hedefora-rate-limit: health\n      x-hedefora-fixture: rejected",
  },
  {
    name: "reject-dynamic-reference",
    code: "SOURCE_REFERENCE_FORBIDDEN",
    before: '                $ref: "#/components/schemas/HealthLiveResponse"',
    after:
      '                $dynamicRef: "#/components/schemas/HealthLiveResponse"',
  },
  {
    name: "reject-recursive-reference",
    code: "SOURCE_REFERENCE_FORBIDDEN",
    before: '                $ref: "#/components/schemas/HealthLiveResponse"',
    after:
      '                $recursiveRef: "#/components/schemas/HealthLiveResponse"',
  },
  {
    name: "reject-relative-file-reference",
    code: "SOURCE_REFERENCE_FORBIDDEN",
    before: '                $ref: "#/components/schemas/HealthLiveResponse"',
    after: '                $ref: "./fixture.yaml"',
  },
  {
    name: "reject-file-url-reference",
    code: "SOURCE_REFERENCE_FORBIDDEN",
    before: '                $ref: "#/components/schemas/HealthLiveResponse"',
    after: '                $ref: "file:///tmp/fixture.yaml"',
  },
  {
    name: "reject-windows-reference",
    code: "SOURCE_ESCAPE_FORBIDDEN",
    before: '                $ref: "#/components/schemas/HealthLiveResponse"',
    after: String.raw`                $ref: "C:\fixture.yaml"`,
  },
  {
    name: "reject-operation-id-code-poison",
    code: "SOURCE_ESCAPE_FORBIDDEN",
    before: "      operationId: getHealthLive",
    after: '      operationId: "getHealthLive\\n//go:generate fixture-canary"',
  },
  {
    name: "reject-schema-name-code-poison",
    code: "SOURCE_SEAL_MISMATCH",
    before: "    HealthLiveResponse:\n      type: object",
    after:
      '    "HealthLiveResponse`; init() { fixture() }; //":\n      type: object',
  },
  {
    name: "reject-enum-code-poison",
    code: "SOURCE_ESCAPE_FORBIDDEN",
    before: "            - live",
    after: '            - "live\\n//go:linkname fixture"',
  },
  {
    name: "reject-prototype-key",
    code: "SOURCE_PROPERTY_FORBIDDEN",
    before: "components:\n  headers:",
    after: "components:\n  __proto__: fixture\n  headers:",
  },
  {
    name: "reject-unknown-root-key",
    code: "SOURCE_SEAL_MISMATCH",
    before: "paths:\n  /health/live:",
    after: "fixture: rejected\npaths:\n  /health/live:",
  },
];
