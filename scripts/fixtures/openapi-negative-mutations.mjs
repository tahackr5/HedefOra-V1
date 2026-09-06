// Every case is one exact textual mutation of the validated canonical source.
// Fixed fixture anchors keep each operation mutation unique in the whole source.
const healthOperationSources = Object.freeze({
  live: `  /health/live:
    get:
      operationId: getHealthLive
      summary: Check whether the API process is serving traffic
      description: >-
        Returns a live status while the API process serves traffic. Once
        graceful shutdown begins, the same endpoint returns a stable 503 error
        envelope and asks callers to retry after a bounded delay.
      tags:
        - Health
      security: []
      x-hedefora-auth: public
      x-hedefora-idempotency: inherent
      x-hedefora-concurrency: none
      x-hedefora-rate-limit: health
      responses:
        "200":
          description: The API process is live and serving traffic.
          headers:
            X-Request-ID:
              $ref: "#/components/headers/RequestId"
            Cache-Control:
              $ref: "#/components/headers/CacheControl"
            X-Content-Type-Options:
              $ref: "#/components/headers/ContentTypeOptions"
            Vary:
              $ref: "#/components/headers/VaryAccept"
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/HealthLiveResponse"
        "503":
          description: The API process is draining and will stop serving.
          headers:
            X-Request-ID:
              $ref: "#/components/headers/RequestId"
            Retry-After:
              $ref: "#/components/headers/RetryAfter"
            Cache-Control:
              $ref: "#/components/headers/CacheControl"
            X-Content-Type-Options:
              $ref: "#/components/headers/ContentTypeOptions"
            Vary:
              $ref: "#/components/headers/VaryAccept"
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/ServiceUnavailableError"
        default:
          description: A typed, user-safe HTTP error.
          headers:
            X-Request-ID:
              $ref: "#/components/headers/RequestId"
            Cache-Control:
              $ref: "#/components/headers/CacheControl"
            X-Content-Type-Options:
              $ref: "#/components/headers/ContentTypeOptions"
            Vary:
              $ref: "#/components/headers/VaryAccept"
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/ErrorEnvelope"
`,
  ready: `  /health/ready:
    get:
      operationId: getHealthReady
      summary: Check whether the API can use its PostgreSQL connection pool
      description: >-
        Returns a ready status only after a bounded PostgreSQL connection probe
        succeeds while the API process is not draining. Unavailable, closed,
        timed-out or cancelled probes and graceful drain return the same
        generic 503 error without database, connection or query details.
        This foundation signal does not assert migration or domain readiness.
      tags:
        - Health
      security: []
      x-hedefora-auth: public
      x-hedefora-idempotency: inherent
      x-hedefora-concurrency: none
      x-hedefora-rate-limit: health
      responses:
        "200":
          description: The bounded PostgreSQL probe succeeded before drain.
          headers:
            X-Request-ID:
              $ref: "#/components/headers/RequestId"
            Cache-Control:
              $ref: "#/components/headers/CacheControl"
            X-Content-Type-Options:
              $ref: "#/components/headers/ContentTypeOptions"
            Vary:
              $ref: "#/components/headers/VaryAccept"
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/HealthReadyResponse"
        "503":
          description: The PostgreSQL probe is unavailable or the API is draining.
          headers:
            X-Request-ID:
              $ref: "#/components/headers/RequestId"
            Retry-After:
              $ref: "#/components/headers/RetryAfter"
            Cache-Control:
              $ref: "#/components/headers/CacheControl"
            X-Content-Type-Options:
              $ref: "#/components/headers/ContentTypeOptions"
            Vary:
              $ref: "#/components/headers/VaryAccept"
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/ServiceUnavailableError"
        default:
          description: A typed, user-safe readiness HTTP error.
          headers:
            X-Request-ID:
              $ref: "#/components/headers/RequestId"
            Cache-Control:
              $ref: "#/components/headers/CacheControl"
            X-Content-Type-Options:
              $ref: "#/components/headers/ContentTypeOptions"
            Vary:
              $ref: "#/components/headers/VaryAccept"
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/ErrorEnvelope"
`,
});

export function scopeHealthMutation(mutation, operation) {
  const source = healthOperationSources[operation];
  if (
    typeof source !== "string" ||
    typeof mutation.before !== "string" ||
    mutation.before.length === 0 ||
    typeof mutation.after !== "string" ||
    mutation.before === mutation.after
  ) {
    throw new TypeError("invalid scoped health mutation");
  }
  const firstIndex = source.indexOf(mutation.before);
  if (
    firstIndex === -1 ||
    source.indexOf(mutation.before, firstIndex + mutation.before.length) !== -1
  ) {
    throw new Error(`${mutation.name} scoped mutation anchor is not unique`);
  }
  return {
    ...mutation,
    before: source,
    after:
      source.slice(0, firstIndex) +
      mutation.after +
      source.slice(firstIndex + mutation.before.length),
  };
}

const baseNegativeMutations = [
  {
    name: "reject-external-server-origin",
    rule: "w001-server-origin",
    before: `  - url: /
    description: Current origin`,
    after: `  - url: https://example.invalid
    description: External origin`,
  },
  {
    name: "reject-missing-health-operation",
    rule: "w001-health-operation",
    before: `paths:
  /health/live:`,
    after: `paths: {}
x-fixture-disabled-paths:
  /health/live:`,
  },
  {
    name: "reject-unexpected-path",
    rule: "w001-only-health-path",
    before: `paths:
  /health/live:`,
    after: `paths:
  /unexpected: {}
  /health/live:`,
  },
  {
    name: "reject-health-post-only",
    rule: "w001-health-get-only",
    before: "    get:",
    after: "    post:",
  },
  {
    name: "reject-health-callback",
    rule: "w001-health-operation-shape",
    before: "      responses:",
    after: `      callbacks: {}
      responses:`,
  },
  {
    name: "reject-health-public",
    rule: "w001-health-public",
    before: "      security: []",
    after: `      security:
        - bearerAuth: []`,
  },
  {
    name: "reject-health-semantics",
    rule: "w001-health-semantics",
    before: "      x-hedefora-idempotency: inherent",
    after: "      x-hedefora-idempotency: required",
  },
  {
    name: "reject-health-response-reference",
    rule: "w001-health-responses",
    before:
      '                $ref: "#/components/schemas/ServiceUnavailableError"',
    after: '                $ref: "#/components/schemas/ErrorEnvelope"',
  },
  {
    name: "reject-health-missing-response",
    rule: "w001-health-response-surface",
    before: '        "503":',
    after: '        "599":',
  },
  {
    name: "reject-unexpected-health-status",
    rule: "w001-health-response-surface",
    before: `        default:
          description: A typed, user-safe HTTP error.`,
    after: `        "504": {}
        default:
          description: A typed, user-safe HTTP error.`,
  },
  {
    name: "reject-health-missing-draining-header",
    rule: "w001-health-draining-headers",
    before: `            Retry-After:
              $ref: "#/components/headers/RetryAfter"
`,
    after: "",
  },
  {
    name: "reject-health-missing-standard-header",
    rule: "w001-health-standard-headers",
    before: `        "200":
          description: The API process is live and serving traffic.
          headers:
            X-Request-ID:
              $ref: "#/components/headers/RequestId"
            Cache-Control:
              $ref: "#/components/headers/CacheControl"`,
    after: `        "200":
          description: The API process is live and serving traffic.
          headers:
            X-Request-ID:
              $ref: "#/components/headers/RequestId"`,
  },
  {
    name: "reject-health-extra-media-type",
    rule: "w001-health-json-only",
    before: `          content:
            application/json:
              schema:
                $ref: "#/components/schemas/HealthLiveResponse"`,
    after: `          content:
            application/json:
              schema:
                $ref: "#/components/schemas/HealthLiveResponse"
            text/plain:
              schema:
                type: string`,
  },
  {
    name: "reject-error-envelope-open",
    rule: "w001-error-envelope-shape",
    before: `    ErrorEnvelope:
      type: object
      additionalProperties: false`,
    after: `    ErrorEnvelope:
      type: object
      additionalProperties: true`,
  },
  {
    name: "reject-error-envelope-types",
    rule: "w001-error-envelope-shape",
    before: `    ErrorEnvelope:
      type: object
      additionalProperties: false
      required:
        - code
        - message
        - request_id
        - retryable
      properties:
        code:
          $ref: "#/components/schemas/ErrorCode"
        message:
          type: string`,
    after: `    ErrorEnvelope:
      type: object
      additionalProperties: false
      required:
        - code
        - message
        - request_id
        - retryable
      properties:
        code:
          $ref: "#/components/schemas/ErrorCode"
        message:
          type: integer`,
  },
  {
    name: "reject-health-response-shape",
    rule: "w001-health-response-shape",
    before: `    HealthLiveResponse:
      type: object
      additionalProperties: false
      required:
        - status
      properties:
        status:
          type: string
          enum:
            - live`,
    after: `    HealthLiveResponse:
      type: object
      additionalProperties: false
      required:
        - status
      properties:
        status:
          type: string
          enum:
            - ready`,
  },
  {
    name: "reject-service-unavailable-shape",
    rule: "w001-service-unavailable-shape",
    before: `        retryable:
          type: boolean
          enum:
            - true`,
    after: `        retryable:
          type: boolean
          enum:
            - false`,
  },
  {
    name: "reject-request-id-shape",
    rule: "w001-request-id-shape",
    before: `    RequestId:
      type: string
      minLength: 36`,
    after: `    RequestId:
      type: string
      minLength: 35`,
  },
  {
    name: "reject-request-id-nullable",
    rule: "w001-request-id-shape",
    before: `    RequestId:
      type: string
      minLength: 36`,
    after: `    RequestId:
      type: string
      nullable: true
      minLength: 36`,
  },
  {
    name: "reject-request-id-go-type",
    rule: "w001-request-id-shape",
    before: `    RequestId:
      type: string
      minLength: 36`,
    after: `    RequestId:
      type: string
      x-go-type: int
      minLength: 36`,
  },
  {
    name: "reject-component-category",
    rule: "w001-component-surface",
    before: `components:
  headers:`,
    after: `components:
  callbacks: {}
  headers:`,
  },
  {
    name: "reject-header-component-shape",
    rule: "w001-header-component-shapes",
    before: `        enum:
          - no-store`,
    after: `        enum:
          - public`,
  },
  {
    name: "reject-extra-schema-component",
    rule: "w001-schema-component-surface",
    before: `  schemas:
    RequestId:`,
    after: `  schemas:
    Unexpected:
      type: string
    RequestId:`,
  },
  {
    name: "reject-error-code-shape",
    rule: "w001-error-code-shape",
    before: `        - unsupported_media_type
        - internal_error`,
    after: `        - unsupported_media_type
        - internal_error
        - unknown_error`,
  },
  {
    name: "reject-external-reference",
    rule: "w001-no-external-ref",
    before: '                $ref: "#/components/schemas/ErrorEnvelope"',
    after: '                $ref: "https://example.invalid/error.yaml"',
  },
  {
    name: "reject-obfuscated-reference",
    rule: "w001-no-external-ref",
    before: '                $ref: "#/components/schemas/ErrorEnvelope"',
    after: String.raw`                "\u0024ref": "https://example.invalid/error.yaml"`,
  },
  {
    name: "reject-missing-auth",
    rule: "w001-operation-auth",
    before: "      x-hedefora-auth: public\n",
    after: "",
  },
  {
    name: "reject-missing-idempotency",
    rule: "w001-operation-idempotency",
    before: "      x-hedefora-idempotency: inherent\n",
    after: "",
  },
  {
    name: "reject-missing-concurrency",
    rule: "w001-operation-concurrency",
    before: "      x-hedefora-concurrency: none\n",
    after: "",
  },
  {
    name: "reject-missing-rate-limit",
    rule: "w001-operation-rate-limit",
    before: "      x-hedefora-rate-limit: health\n",
    after: "",
  },
  {
    name: "reject-missing-typed-error",
    rule: "w001-operation-typed-default-error",
    before: '                $ref: "#/components/schemas/ErrorEnvelope"',
    after: '                $ref: "#/components/schemas/HealthLiveResponse"',
  },
  {
    name: "reject-go-type-import",
    rule: "w001-no-go-type-import",
    before:
      "jsonSchemaDialect: https://json-schema.org/draft/2020-12/schema\ntags:",
    after: `jsonSchemaDialect: https://json-schema.org/draft/2020-12/schema
x-go-type-import:
  name: os
  path: os
tags:`,
  },
  {
    name: "reject-webhook",
    rule: "w001-no-webhook-operations",
    before: `paths:
  /health/live:`,
    after: `webhooks:
  fixture:
    post:
      responses:
        "200":
          description: Fixture response.
paths:
  /health/live:`,
  },
];

const liveOperationMutationNames = new Set([
  "reject-health-post-only",
  "reject-health-callback",
  "reject-health-public",
  "reject-health-semantics",
  "reject-health-response-reference",
  "reject-health-missing-response",
  "reject-unexpected-health-status",
  "reject-health-missing-draining-header",
  "reject-health-missing-standard-header",
  "reject-health-extra-media-type",
  "reject-external-reference",
  "reject-obfuscated-reference",
  "reject-missing-auth",
  "reject-missing-idempotency",
  "reject-missing-concurrency",
  "reject-missing-rate-limit",
  "reject-missing-typed-error",
]);

const readyOperationMutations = [
  {
    name: "reject-ready-post-only",
    rule: "w001-health-get-only",
    before: "    get:",
    after: "    post:",
  },
  {
    name: "reject-ready-callback",
    rule: "w001-health-operation-shape",
    before: "      responses:",
    after: "      callbacks: {}\n      responses:",
  },
  {
    name: "reject-ready-public",
    rule: "w001-health-public",
    before: "      security: []",
    after: "      security:\n        - bearerAuth: []",
  },
  {
    name: "reject-ready-semantics",
    rule: "w001-health-semantics",
    before: "      x-hedefora-idempotency: inherent",
    after: "      x-hedefora-idempotency: required",
  },
  {
    name: "reject-ready-success-reference",
    rule: "w001-readiness-responses",
    before: '                $ref: "#/components/schemas/HealthReadyResponse"',
    after: '                $ref: "#/components/schemas/HealthLiveResponse"',
  },
  {
    name: "reject-ready-unavailable-reference",
    rule: "w001-readiness-responses",
    before:
      '                $ref: "#/components/schemas/ServiceUnavailableError"',
    after: '                $ref: "#/components/schemas/ErrorEnvelope"',
  },
  {
    name: "reject-ready-missing-response",
    rule: "w001-health-response-surface",
    before: '        "503":',
    after: '        "599":',
  },
  {
    name: "reject-ready-unexpected-status",
    rule: "w001-health-response-surface",
    before: "        default:",
    after: '        "504": {}\n        default:',
  },
  {
    name: "reject-ready-missing-retry-header",
    rule: "w001-health-draining-headers",
    before:
      '            Retry-After:\n              $ref: "#/components/headers/RetryAfter"\n',
    after: "",
  },
  {
    name: "reject-ready-missing-standard-header",
    rule: "w001-health-standard-headers",
    before:
      '        "200":\n          description: The bounded PostgreSQL probe succeeded before drain.\n          headers:\n            X-Request-ID:\n              $ref: "#/components/headers/RequestId"\n            Cache-Control:\n              $ref: "#/components/headers/CacheControl"',
    after:
      '        "200":\n          description: The bounded PostgreSQL probe succeeded before drain.\n          headers:\n            X-Request-ID:\n              $ref: "#/components/headers/RequestId"',
  },
  {
    name: "reject-ready-extra-media-type",
    rule: "w001-health-json-only",
    before: '                $ref: "#/components/schemas/HealthReadyResponse"',
    after:
      '                $ref: "#/components/schemas/HealthReadyResponse"\n            text/plain:\n              schema:\n                type: string',
  },
  {
    name: "reject-ready-operation-id",
    rule: "w001-health-ready-operation-id",
    before: "      operationId: getHealthReady",
    after: "      operationId: unexpectedReady",
  },
  {
    name: "reject-ready-missing-operation-id",
    rule: "w001-health-ready-operation-id",
    before: "      operationId: getHealthReady\n",
    after: "",
  },
  {
    name: "reject-ready-missing-auth",
    rule: "w001-operation-auth",
    before: "      x-hedefora-auth: public\n",
    after: "",
  },
  {
    name: "reject-ready-missing-idempotency",
    rule: "w001-operation-idempotency",
    before: "      x-hedefora-idempotency: inherent\n",
    after: "",
  },
  {
    name: "reject-ready-missing-concurrency",
    rule: "w001-operation-concurrency",
    before: "      x-hedefora-concurrency: none\n",
    after: "",
  },
  {
    name: "reject-ready-missing-rate-limit",
    rule: "w001-operation-rate-limit",
    before: "      x-hedefora-rate-limit: health\n",
    after: "",
  },
  {
    name: "reject-ready-missing-typed-error",
    rule: "w001-operation-typed-default-error",
    before: '                $ref: "#/components/schemas/ErrorEnvelope"',
    after: '                $ref: "#/components/schemas/HealthReadyResponse"',
  },
  {
    name: "reject-ready-external-reference",
    rule: "w001-no-external-ref",
    before: '                $ref: "#/components/schemas/HealthReadyResponse"',
    after: '                $ref: "https://example.invalid/ready.yaml"',
  },
];

export const negativeMutations = [
  scopeHealthMutation(
    {
      name: "reject-live-missing-operation-id",
      rule: "w001-health-live-operation-id",
      before: "      operationId: getHealthLive\n",
      after: "",
    },
    "live",
  ),
  ...baseNegativeMutations.map((mutation) =>
    liveOperationMutationNames.has(mutation.name)
      ? scopeHealthMutation(mutation, "live")
      : mutation,
  ),
  ...readyOperationMutations.map((mutation) =>
    scopeHealthMutation(mutation, "ready"),
  ),
  scopeHealthMutation(
    {
      name: "reject-live-operation-id",
      rule: "w001-health-live-operation-id",
      before: "      operationId: getHealthLive",
      after: "      operationId: unexpectedLive",
    },
    "live",
  ),
  scopeHealthMutation(
    {
      name: "reject-live-ready-success-reference",
      rule: "w001-health-responses",
      before: '                $ref: "#/components/schemas/HealthLiveResponse"',
      after: '                $ref: "#/components/schemas/HealthReadyResponse"',
    },
    "live",
  ),
  {
    name: "reject-missing-ready-operation",
    rule: "w001-health-operation",
    before: healthOperationSources.ready,
    after: "",
  },
  {
    name: "reject-ready-response-open",
    rule: "w001-readiness-response-shape",
    before:
      "    HealthReadyResponse:\n      type: object\n      additionalProperties: false",
    after:
      "    HealthReadyResponse:\n      type: object\n      additionalProperties: true",
  },
  {
    name: "reject-ready-response-enum",
    rule: "w001-readiness-response-shape",
    before: "            - ready",
    after: "            - live",
  },
  {
    name: "reject-ready-response-extra-property",
    rule: "w001-readiness-response-shape",
    before: "            - ready",
    after: "            - ready\n        database:\n          type: string",
  },
];
