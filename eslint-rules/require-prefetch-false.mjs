/**
 * Requires `prefetch={false}` on every `<Link>` pointing at an audit-logged
 * detail route.
 *
 * `GET /v1/orders/{id}` and `GET /v1/clients/{id}` each write a row to the
 * append-only `access_audit_log`, recording who accessed which patient's
 * information for Law 25 accountability. Next prefetches links on viewport
 * entry by default, so a board of 50 cards would record 50 accesses that never
 * happened — filling the accountability record with reads no human performed
 * and destroying its evidentiary value (PRD 8.1).
 *
 * This is a compliance control, not a performance preference, which is why it is
 * a lint error rather than a code-review habit.
 *
 * Scope note: list routes (`/orders`, `/clients`) are *not* audited detail reads
 * and may prefetch freely. Only a route with a dynamic segment below them is
 * covered.
 */

/** `/orders/<something>` or `/clients/<something>` — not the bare list route. */
const AUDITED_PREFIX = /^\/(orders|clients)\/(?!$)/;

/**
 * Static sub-routes that are not detail reads. `/orders/new` renders an empty
 * form and fetches no patient, so prefetching it is free — and worth having.
 */
const STATIC_SUBROUTES = /^\/(orders|clients)\/new(\/.*)?$/;

function isAuditedHref(attribute) {
  const value = attribute.value;
  if (!value) return false;

  // href="/orders/abc"
  if (value.type === "Literal") {
    if (typeof value.value !== "string") return false;
    if (STATIC_SUBROUTES.test(value.value)) return false;
    return AUDITED_PREFIX.test(value.value);
  }

  if (value.type !== "JSXExpressionContainer") return false;
  const expression = value.expression;

  // href={`/orders/${order.id}`}
  if (expression.type === "TemplateLiteral") {
    const head = expression.quasis[0]?.value.cooked ?? "";
    // A dynamic segment must follow the prefix, otherwise it is a list route.
    return AUDITED_PREFIX.test(head) || /^\/(orders|clients)\/$/.test(head);
  }

  // href={"/clients/" + id}
  if (expression.type === "BinaryExpression" && expression.operator === "+") {
    const left = expression.left;
    return (
      left.type === "Literal" &&
      typeof left.value === "string" &&
      (AUDITED_PREFIX.test(left.value) || /^\/(orders|clients)\/$/.test(left.value))
    );
  }

  // href={somethingOpaque} — not analysable, so not reported.
  return false;
}

function hasPrefetchFalse(node) {
  return node.attributes.some(
    (attribute) =>
      attribute.type === "JSXAttribute" &&
      attribute.name?.name === "prefetch" &&
      attribute.value?.type === "JSXExpressionContainer" &&
      attribute.value.expression.type === "Literal" &&
      attribute.value.expression.value === false,
  );
}

const rule = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Require prefetch={false} on links to audit-logged detail routes so prefetching cannot forge access-log entries.",
    },
    schema: [],
    messages: {
      missing:
        "Add prefetch={false}: {{href}} is audit-logged, and Next prefetches on viewport entry, which would record accesses no human performed (PRD 8.1).",
    },
  },

  create(context) {
    return {
      JSXOpeningElement(node) {
        if (node.name.type !== "JSXIdentifier" || node.name.name !== "Link") return;

        const href = node.attributes.find(
          (attribute) =>
            attribute.type === "JSXAttribute" && attribute.name?.name === "href",
        );

        if (!href || !isAuditedHref(href)) return;
        if (hasPrefetchFalse(node)) return;

        context.report({
          node,
          messageId: "missing",
          data: { href: context.sourceCode.getText(href.value ?? href) },
        });
      },
    };
  },
};

const plugin = {
  rules: { "require-prefetch-false": rule },
};

export default plugin;
