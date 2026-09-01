// Every case is one exact textual mutation of the validated canonical source.
export const negativeMutations = [
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
